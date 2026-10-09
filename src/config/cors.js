const net = require('net');

function isPrivateIPv4(hostname) {
  if (!net.isIPv4(hostname)) return false;
  const [first, second] = hostname.split('.').map(Number);
  return first === 10 || first === 127 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 169 && second === 254);
}

function buildCorsOptions(environment = process.env) {
  const allowedOrigins = new Set(
    (environment.CORS_ORIGINS || environment.CORS_ORIGIN || '')
      .split(',')
      .map((origin) => origin.trim().replace(/\/$/, ''))
      .filter(Boolean)
  );

  return {
    origin(origin, callback) {
      if (!origin || allowedOrigins.has('*') || allowedOrigins.has(origin.replace(/\/$/, ''))) {
        return callback(null, true);
      }
      try {
        const { hostname } = new URL(origin);
        const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
        const isLocalHost = host === 'localhost' || host.endsWith('.localhost') ||
          host === '::1' || host.endsWith('.local');
        return callback(null, isLocalHost || isPrivateIPv4(host));
      } catch {
        return callback(null, false);
      }
    },
  };
}

module.exports = buildCorsOptions;