const mongoose = require('mongoose');

const customizationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    category: {
      type: String,
      required: true,
      enum: [
        'theme', 'wallpaper', 'icon', 'font', 'texture', 'model', 'config', 'other',
        '.cache', '.avatar', '.shaders',
      ],
    },
    resource_url: {
      type: String,
      required: true,
      trim: true,
      validate: {
        validator(value) {
          try {
            const url = new URL(value);
            return url.protocol === 'https:' ||
              (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname));
          } catch {
            return false;
          }
        },
        message: 'resource_url must be a valid HTTPS URL',
      },
    },
    checksum_sha256: {
      type: String,
      required: true,
      lowercase: true,
      match: /^[a-f0-9]{64}$/,
    },
    version: { type: String, required: true, trim: true, maxlength: 40 },
    target_path_relative: {
      type: String,
      required: true,
      trim: true,
      maxlength: 240,
      validate: {
        validator(value) {
          return value.split('/').every((part) =>
            /^(?!\.{1,2}$)[A-Za-z0-9_-][A-Za-z0-9._-]*$/.test(part)
          );
        },
        message: 'target_path_relative must be a safe relative path',
      },
    },
    storage_file_name: { type: String, trim: true, maxlength: 180 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

customizationSchema.index({ category: 1, isActive: 1 });

module.exports = mongoose.model('Customization', customizationSchema);
