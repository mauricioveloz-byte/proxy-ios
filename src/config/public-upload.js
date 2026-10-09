const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const PUBLIC_UPLOAD_DIRECTORY = path.resolve(
  PROJECT_ROOT,
  process.env.UPLOADS_DIR || path.join(PROJECT_ROOT, 'public', 'uploads')
);
fs.mkdirSync(PUBLIC_UPLOAD_DIRECTORY, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, PUBLIC_UPLOAD_DIRECTORY),
    filename: (_req, _file, callback) => callback(null, `${crypto.randomUUID()}.part`),
  }),
  limits: { fileSize: 100 * 1024 * 1024, files: 1 },
});

module.exports = { upload, PUBLIC_UPLOAD_DIRECTORY };