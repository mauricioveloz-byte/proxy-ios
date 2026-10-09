const mongoose = require('mongoose');

const proxyRouteSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    pathPrefix: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      match: /^\/gateway(?:\/[A-Za-z0-9_-]+)+$/,
    },
    targetUrl: {
      type: String,
      required: true,
      trim: true,
      validate: {
        validator(value) {
          try {
            const url = new URL(value);
            return ['http:', 'https:'].includes(url.protocol) &&
              !url.username && !url.password && url.pathname === '/' &&
              !url.search && !url.hash;
          } catch {
            return false;
          }
        },
        message: 'targetUrl must be an HTTP(S) origin without credentials or path',
      },
    },
    enabled: { type: Boolean, default: true },
  },
  { timestamps: true }
);

proxyRouteSchema.index({ enabled: 1, pathPrefix: 1 });

module.exports = mongoose.model('ProxyRoute', proxyRouteSchema);
