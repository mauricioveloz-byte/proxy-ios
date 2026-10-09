import CryptoKit
import Foundation

struct ActiveThemeResponse: Decodable {
    let customization: ThemeResource
}

struct ThemeResource: Decodable {
    let name: String
    let category: String
    let resourceURL: URL
    let checksumSha256: String
    let version: String

    enum CodingKeys: String, CodingKey {
        case name
        case category
        case resourceURL = "resource_url"
        case checksumSha256 = "checksum_sha256"
        case version
    }
}

enum ThemeDownloadError: Error {
    case invalidAPIURL
    case noActiveCustomization
    case badAPIResponse(Int)
    case invalidResourceURL
    case checksumMismatch
    case missingApplicationSupportDirectory
}

enum ThemeDownloader {
    static func fetchAndInstallActiveTheme(
        apiBaseURL: URL,
        bearerToken: String,
        session: URLSession = .shared
    ) async throws -> URL {
        let endpoint = apiBaseURL
            .appendingPathComponent("api")
            .appendingPathComponent("v1")
            .appendingPathComponent("user")
            .appendingPathComponent("active-theme")
        var request = URLRequest(url: endpoint)
        request.setValue("Bearer \(bearerToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        let (responseData, response) = try await session.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw ThemeDownloadError.invalidAPIURL
        }
        guard httpResponse.statusCode != 404 else {
            throw ThemeDownloadError.noActiveCustomization
        }
        guard (200..<300).contains(httpResponse.statusCode) else {
            throw ThemeDownloadError.badAPIResponse(httpResponse.statusCode)
        }

        let decoder = JSONDecoder()
        let themeResponse = try decoder.decode(ActiveThemeResponse.self, from: responseData)
        let theme = themeResponse.customization
        guard theme.resourceURL.scheme?.lowercased() == "https" else {
            throw ThemeDownloadError.invalidResourceURL
        }

        let (temporaryURL, downloadResponse) = try await session.download(from: theme.resourceURL)
        guard let downloadHTTPResponse = downloadResponse as? HTTPURLResponse,
              (200..<300).contains(downloadHTTPResponse.statusCode) else {
            let status = (downloadResponse as? HTTPURLResponse)?.statusCode ?? -1
            throw ThemeDownloadError.badAPIResponse(status)
        }

        let actualChecksum = try sha256(of: temporaryURL)
        guard actualChecksum == theme.checksumSha256.lowercased() else {
            throw ThemeDownloadError.checksumMismatch
        }

        guard let supportDirectory = FileManager.default.urls(
            for: .applicationSupportDirectory,
            in: .userDomainMask
        ).first else {
            throw ThemeDownloadError.missingApplicationSupportDirectory
        }

        let destinationDirectory = supportDirectory.appendingPathComponent("Customizations", isDirectory: true)
        try FileManager.default.createDirectory(
            at: destinationDirectory,
            withIntermediateDirectories: true
        )
        let fileExtension = theme.resourceURL.pathExtension.isEmpty
            ? "asset"
            : theme.resourceURL.pathExtension
        let destinationURL = destinationDirectory
            .appendingPathComponent(actualChecksum)
            .appendingPathExtension(fileExtension)

        // The checksum gives identical content a stable local filename.
        if FileManager.default.fileExists(atPath: destinationURL.path) {
            try FileManager.default.removeItem(at: temporaryURL)
        } else {
            try FileManager.default.moveItem(at: temporaryURL, to: destinationURL)
        }
        return destinationURL
    }

    private static func sha256(of fileURL: URL) throws -> String {
        let file = try FileHandle(forReadingFrom: fileURL)
        defer { try? file.close() }

        var hasher = SHA256()
        while let chunk = try file.read(upToCount: 1024 * 1024), !chunk.isEmpty {
            hasher.update(data: chunk)
        }
        return hasher.finalize().map { String(format: "%02x", $0) }.joined()
    }
}
