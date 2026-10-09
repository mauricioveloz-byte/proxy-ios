const httpProxy = require('http-proxy');
const ProxyRoute = require('../models/ProxyRoute');
const asyncHandler = require('./async-handler');

const proxy = httpProxy.createProxyServer({
  xfwd: true,
  proxyTimeout: 30000,
  timeout: 30000,
});

proxy.on('error', (error, _req, res) => {
  console.error('Upstream proxy request failed:', error.message);
  if (res.headersSent) return res.destroy(error);
  res.writeHead(502, { 'Content-Type': 'application/json' });
  return res.end(JSON.stringify({ error: 'Proxy target is unavailable' }));
});

const proxyGateway = asyncHandler(async (req, res, next) => {
  const requestURL = new URL(req.originalUrl, 'http://proxy.local');
  const routes = await ProxyRoute.find({ enabled: true })
    .select('pathPrefix targetUrl')
    .lean();
  const route = routes
    .filter(({ pathPrefix }) => requestURL.pathname === pathPrefix ||
      requestURL.pathname.startsWith(`${pathPrefix}/`))
    .sort((left, right) => right.pathPrefix.length - left.pathPrefix.length)[0];

  if (!route) return next();

  const upstreamPath = requestURL.pathname.slice(route.pathPrefix.length) || '/';
  req.url = `${upstreamPath}${requestURL.search}`;
  delete req.headers.authorization;

  return proxy.web(req, res, {
    target: route.targetUrl,
    changeOrigin: true,
  });
});

module.exports = proxyGateway;
