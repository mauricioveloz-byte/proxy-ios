require('dotenv').config();

const express = require('express');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const buildCorsOptions = require('./src/config/cors');
const { connectDatabase, closeDatabase } = require('./src/config/database');
const customizationRoutes = require('./src/routes/customizations');
const userRoutes = require('./src/routes/users');
const keyAuthRoutes = require('./src/routes/keyauth');
const proxyRouteAdminRoutes = require('./src/routes/proxy-routes');
const uploadRoutes = require('./src/routes/uploads');
const { UPLOAD_DIRECTORY } = require('./src/config/upload');
const { PUBLIC_UPLOAD_DIRECTORY } = require('./src/config/public-upload');
const { notFound, errorHandler } = require('./src/middleware/error-handler');
const { authenticate, localAuthBypass } = require('./src/middleware/auth');
const proxyGateway = require('./src/middleware/proxy-gateway');

const app = express();
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS) || 1);

const requiredKeyAuthEnvironment = [
  'KEYAUTH_NAME',
  'KEYAUTH_OWNER_ID',
  'KEYAUTH_VERSION',
  'KEYAUTH_API_URL',
  'JWT_SECRET',
];
const missingEnvironment = requiredKeyAuthEnvironment.filter((key) => !process.env[key]?.trim());

if (missingEnvironment.length > 0) {
  console.error(`Missing required environment variables: ${missingEnvironment.join(', ')}`);
  process.exit(1);
}

let keyAuthApiURL;
try {
  keyAuthApiURL = new URL(process.env.KEYAUTH_API_URL);
} catch {
  console.error('KEYAUTH_API_URL must be a valid HTTPS URL');
  process.exit(1);
}
if (keyAuthApiURL.protocol !== 'https:') {
  console.error('KEYAUTH_API_URL must use HTTPS');
  process.exit(1);
}

app.use(helmet());
app.use(cors(buildCorsOptions()));
app.use('/gateway', authenticate, proxyGateway);
app.use(express.json({ limit: '1mb' }));
app.use('/uploads/assets', express.static(UPLOAD_DIRECTORY, { dotfiles: 'deny', index: false }));
app.use('/uploads', express.static(PUBLIC_UPLOAD_DIRECTORY, { dotfiles: 'deny', index: false }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (_req, res) => res.status(200).json({ status: 'ok' }));
app.get('/api/v1/session-mode', (_req, res) => res.json({ localAuthBypass }));
app.use('/api/v1/customizations', customizationRoutes);
app.use('/api/v1/user', userRoutes);
app.use('/api/v1/proxy-routes', proxyRouteAdminRoutes);
app.use('/api/v1', keyAuthRoutes);
app.use('/api/v1/upload', uploadRoutes);
app.use(notFound);
app.use(errorHandler);

const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || '0.0.0.0';

connectDatabase()
  .then(() => {
    console.log(`KeyAuth configured for application "${process.env.KEYAUTH_NAME}" (${process.env.KEYAUTH_VERSION})`);
    const server = app.listen(port, host, () => {
      console.log(`API and dashboard listening on ${host}:${port}`);
    });
    const shutdown = async () => {
      server.close(async () => {
        await closeDatabase().catch((error) => console.error('Database shutdown failed:', error.message));
        process.exit(0);
      });
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  })
  .catch((error) => {
    console.error('Unable to start API:', error.message);
    process.exit(1);
  });

module.exports = app;
