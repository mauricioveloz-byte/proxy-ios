const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const Customization = require('../models/Customization');
const asyncHandler = require('../middleware/async-handler');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { upload, UPLOAD_DIRECTORY } = require('../config/upload');

const router = express.Router();
router.use(authenticate);

function isSafeTargetPath(value) {
  return typeof value === 'string' && value.length <= 240 &&
    !value.startsWith('/') && !value.includes('\\') &&
    value.split('/').every((part) => /^(?!\.{1,2}$)[A-Za-z0-9_-][A-Za-z0-9._-]*$/.test(part));
}

async function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  // Stream large packages from disk instead of loading the whole upload into memory.
  for await (const chunk of fs.createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
}

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const customizations = await Customization.find()
      .select('-storage_file_name')
      .sort({ createdAt: -1 })
      .lean();
    res.status(200).json({ customizations });
  })
);

router.post(
  '/upload',
  requireAdmin,
  upload.single('file'),
  asyncHandler(async (req, res) => {
    let saved = false;
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'A file field is required' });
      }
      const { name, category, version, target_path_relative: targetPath } = req.body;
      if (!isSafeTargetPath(targetPath)) {
        return res.status(400).json({ error: 'target_path_relative is invalid' });
      }

      // The checksum comes from the stored bytes, never from client-supplied metadata.
      const checksum = await sha256File(path.join(UPLOAD_DIRECTORY, req.file.filename));
      const baseURL = (process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 3000}`)
        .replace(/\/$/, '');
      const customization = await Customization.create({
        name,
        category,
        version,
        target_path_relative: targetPath,
        resource_url: `${baseURL}/uploads/assets/${encodeURIComponent(req.file.filename)}`,
        checksum_sha256: checksum,
        storage_file_name: req.file.filename,
      });
      saved = true;
      return res.status(201).json({ customization });
    } finally {
      // Remove an orphaned upload if validation or database persistence fails.
      if (!saved && req.file) {
        await fs.promises.unlink(path.join(UPLOAD_DIRECTORY, req.file.filename)).catch(() => {});
      }
    }
  })
);

router.post(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const {
      name, category, resource_url, checksum_sha256, version,
      target_path_relative, isActive,
    } = req.body;
    const customization = await Customization.create({
      name,
      category,
      resource_url,
      checksum_sha256,
      version,
      target_path_relative,
      ...(typeof isActive === 'boolean' ? { isActive } : {}),
    });
    res.status(201).json({ customization });
  })
);

module.exports = router;
