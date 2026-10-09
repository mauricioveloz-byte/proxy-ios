import CryptoKit
import Foundation

private struct ActiveResourceResponse: Decodable {
    let resourceID: String
    let resourceName: String
    let downloadURL: URL
    let checksumSHA256: String
    let targetPathRelative: String

    enum CodingKeys: String, CodingKey {
        case resourceID = "resource_id"
        case resourceName = "resource_name"
        case downloadURL = "download_url"
        case checksumSHA256 = "checksum_sha256"
        case targetPathRelative = "target_path_relative"
    }
}

enum ResourceManagerError: Error {
    case invalidAPIURL
    case invalidDownloadURL
    case httpStatus(Int)
    case invalidTargetPath
    case checksumMismatch
    case missingDocumentsDirectory
}

final class ResourceManager {
    private let apiBaseURL: URL
    private let bearerToken: String
    private let session: URLSession
    private let fileManager: FileManager

    init(
        apiBaseURL: URL,
        bearerToken: String,
        session: URLSession = .shared,
        fileManager: FileManager = .default
    ) {
        self.apiBaseURL = apiBaseURL
        self.bearerToken = bearerToken
        self.session = session
        self.fileManager = fileManager
    }

    /// Returns nil when the user has no active resource. On failure, callers can keep using
    /// their bundled default; this method never replaces a local file with unverified bytes.
    func syncActiveResource() async throws -> URL? {
        let endpoint = apiBaseURL
            .appendingPathComponent("api")
            .appendingPathComponent("v1")
            .appendingPathComponent("user")
            .appendingPathComponent("active-resource")
        var request = URLRequest(url: endpoint)
        request.setValue("Bearer \(bearerToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        let (data, response) = try await session.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw ResourceManagerError.invalidAPIURL
        }
        if httpResponse.statusCode == 404 { return nil }
        guard (200..<300).contains(httpResponse.statusCode) else {
            throw ResourceManagerError.httpStatus(httpResponse.statusCode)
        }

        let resource = try JSONDecoder().decode(ActiveResourceResponse.self, from: data)
        guard resource.downloadURL.scheme?.lowercased() == "https" else {
            throw ResourceManagerError.invalidDownloadURL
        }
        guard resource.checksumSHA256.count == 64 else {
            throw ResourceManagerError.checksumMismatch
        }

        guard let documentsDirectory = fileManager.urls(
            for: .documentDirectory,
            in: .userDomainMask
        ).first else {
            throw ResourceManagerError.missingDocumentsDirectory
        }
        let cacheDirectory = documentsDirectory.appendingPathComponent("Caches", isDirectory: true)
        let destinationURL = try makeDestination(
            relativePath: resource.targetPathRelative,
            under: cacheDirectory
        )

        // Avoid network transfer when the requested version is already installed.
        if fileManager.fileExists(atPath: destinationURL.path),
           (try? sha256(of: destinationURL)) == resource.checksumSHA256.lowercased() {
            return destinationURL
        }

        var downloadRequest = URLRequest(url: resource.downloadURL)
        downloadRequest.setValue("application/octet-stream", forHTTPHeaderField: "Accept")
        let (temporaryURL, downloadResponse) = try await session.download(for: downloadRequest)
        defer { try? fileManager.removeItem(at: temporaryURL) }

        guard let downloadHTTPResponse = downloadResponse as? HTTPURLResponse,
              (200..<300).contains(downloadHTTPResponse.statusCode) else {
            let status = (downloadResponse as? HTTPURLResponse)?.statusCode ?? -1
            throw ResourceManagerError.httpStatus(status)
        }
        guard try sha256(of: temporaryURL) == resource.checksumSHA256.lowercased() else {
            throw ResourceManagerError.checksumMismatch
        }

        try fileManager.createDirectory(
            at: destinationURL.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )
        if fileManager.fileExists(atPath: destinationURL.path) {
            // Replace only after checksum validation so a failed download preserves the old file.
            _ = try fileManager.replaceItemAt(
                destinationURL,
                withItemAt: temporaryURL,
                backupItemName: nil,
                options: []
            )
        } else {
            try fileManager.moveItem(at: temporaryURL, to: destinationURL)
        }
        return destinationURL
    }

    private func makeDestination(relativePath: String, under root: URL) throws -> URL {
        let components = relativePath.split(separator: "/", omittingEmptySubsequences: false)
        let allowed = CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789._-")
        let allowedFirst = CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-")
        guard !components.isEmpty,
              components.allSatisfy({ component in
                  !component.isEmpty && component != "." && component != ".." &&
                      component.unicodeScalars.first.map(allowedFirst.contains) == true &&
                      component.unicodeScalars.allSatisfy(allowed.contains)
              }) else {
            throw ResourceManagerError.invalidTargetPath
        }

        let destination = components.reduce(root) { partialURL, component in
            partialURL.appendingPathComponent(String(component))
        }.standardizedFileURL
        let rootPath = root.standardizedFileURL.path + "/"
        guard destination.path.hasPrefix(rootPath) else {
            throw ResourceManagerError.invalidTargetPath
        }
        return destination
    }

    private func sha256(of fileURL: URL) throws -> String {
        let file = try FileHandle(forReadingFrom: fileURL)
        defer { try? file.close() }

        var hasher = SHA256()
        while let chunk = try file.read(upToCount: 1024 * 1024), !chunk.isEmpty {
            hasher.update(data: chunk)
        }
        return hasher.finalize().map { String(format: "%02x", $0) }.joined()
    }
}