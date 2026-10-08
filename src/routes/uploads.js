const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const Customization = require('../models/Customization');
const asyncHandler = require('../middleware/async-handler');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { upload, PUBLIC_UPLOAD_DIRECTORY } = require('../config/public-upload');

const router = express.Router();
const CATEGORIES = new Set(['.cache', '.avatar', '.shaders']);

async function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
}

router.post(
  '/',
  authenticate,
  requireAdmin,
  upload.single('fileAsset'),
  asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Select a file to upload' });

    const temporaryPath = req.file.path;
    let storedPath;
    let recordCreated = false;
    try {
      const { name, category, version } = req.body;
      if (!CATEGORIES.has(category)) {
        return res.status(400).json({ error: 'Category must be .cache, .avatar, or .shaders' });
      }
      if (typeof name !== 'string' || !name.trim() || name.length > 120) {
        return res.status(400).json({ error: 'A resource name is required (maximum 120 characters)' });
      }
      if (typeof version !== 'string' || !version.trim() || version.length > 40) {
        return res.status(400).json({ error: 'A resource version is required (maximum 40 characters)' });
      }

      const fileName = `${crypto.randomUUID()}${category}`;
      storedPath = path.join(PUBLIC_UPLOAD_DIRECTORY, fileName);
      await fs.promises.rename(temporaryPath, storedPath);

      // Hash the persisted bytes, not a value supplied by the browser.
      const checksum = await sha256File(storedPath);
      const baseURL = (process.env.BASE_URL || process.env.PUBLIC_BASE_URL ||
        `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, '');
      const resource = await Customization.create({
        name: name.trim(),
        category,
        version: version.trim(),
        resource_url: `${baseURL}/uploads/${encodeURIComponent(fileName)}`,
        checksum_sha256: checksum,
        target_path_relative: `${category.slice(1)}/${fileName}`,
        storage_file_name: fileName,
      });
      recordCreated = true;
      return res.status(201).json({ resource });
    } finally {
      // Remove the temporary or renamed file if validation or MongoDB persistence fails.
      if (!recordCreated) {
        await fs.promises.unlink(storedPath || temporaryPath).catch(() => {});
      }
    }
  })
);

module.exports = router;