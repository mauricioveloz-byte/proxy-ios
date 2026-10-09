const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const UPLOAD_DIRECTORY = path.resolve(__dirname, '../../uploads/assets');
fs.mkdirSync(UPLOAD_DIRECTORY, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, UPLOAD_DIRECTORY),
  filename: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    callback(null, `${crypto.randomUUID()}${extension}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    if (!['.bin', '.json', '.zip'].includes(extension)) {
      const error = new Error('Only .bin, .json, and .zip files are supported');
      error.statusCode = 400;
      return callback(error);
    }
    return callback(null, true);
  },
});

module.exports = { upload, UPLOAD_DIRECTORY };