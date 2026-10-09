const jwt = require('jsonwebtoken');
const User = require('../models/User');
const asyncHandler = require('./async-handler');

const localAuthBypass = process.env.LOCAL_AUTH_BYPASS === 'true' && process.env.NODE_ENV !== 'production';

const authenticate = asyncHandler(async (req, res, next) => {
  if (localAuthBypass) {
    const user = await User.findOneAndUpdate(
      { email: 'local-bypass@localhost' },
      { $setOnInsert: { email: 'local-bypass@localhost', role: 'admin' } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    req.auth = { role: 'admin' };
    req.user = user;
    return next();
  }

  const [scheme, token] = (req.get('authorization') || '').split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'A Bearer token is required' });
  }
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is not configured');

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  if (typeof payload.sub !== 'string') {
    return res.status(401).json({ error: 'Token subject is invalid' });
  }
  req.auth = payload;

  const user = await User.findById(payload.sub)
    .select('_id email role keyAuthUsername activeCustomization');
  if (!user) return res.status(401).json({ error: 'User not found' });
  req.user = user;
  return next();
});

function requireAdmin(req, res, next) {
  const keyAuthAdmins = new Set(
    (process.env.KEYAUTH_ADMIN_USERNAMES || '')
      .split(',')
      .map((username) => username.trim().toLowerCase())
      .filter(Boolean)
  );
  if (
    req.auth?.role !== 'admin' &&
    req.user.role !== 'admin' &&
    !keyAuthAdmins.has(req.user.keyAuthUsername)
  ) {
    return res.status(403).json({ error: 'Administrator access is required' });
  }
  return next();
}

module.exports = { authenticate, requireAdmin, localAuthBypass };
