const crypto = require('crypto');
const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const asyncHandler = require('../middleware/async-handler');

const router = express.Router();

function resolveKeyAuthRole(info, environment = process.env) {
  const adminUsernames = new Set(
    (environment.KEYAUTH_ADMIN_USERNAMES || '')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean)
  );
  const adminSubscriptions = new Set(
    (environment.KEYAUTH_ADMIN_SUBSCRIPTIONS || '')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean)
  );
  const keyAuthUsername = typeof info?.username === 'string' ? info.username.trim().toLowerCase() : '';
  const subscriptionNames = Array.isArray(info?.subscriptions)
    ? info.subscriptions
      .map(({ subscription }) => typeof subscription === 'string' ? subscription.trim().toLowerCase() : '')
    : [];

  return adminUsernames.has(keyAuthUsername) ||
    subscriptionNames.some((subscription) => adminSubscriptions.has(subscription))
    ? 'admin'
    : 'user';
}

async function keyAuthRequest(fields) {
  const apiURL = process.env.KEYAUTH_API_URL || 'https://keyauth.win/api/1.2/';
  if (new URL(apiURL).protocol !== 'https:') {
    throw new Error('KEYAUTH_API_URL must use HTTPS');
  }
  const response = await fetch(apiURL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields),
    signal: AbortSignal.timeout(10000),
  });
  const body = await response.text();
  let result;
  try {
    result = JSON.parse(body);
  } catch {
    result = { success: false, message: body };
  }
  if (!response.ok) throw new Error(`KeyAuth returned HTTP ${response.status}`);
  return result;
}

router.post(
  '/login-keyauth',
  asyncHandler(async (req, res) => {
    const licenseKey = typeof req.body.licenseKey === 'string' ? req.body.licenseKey.trim() : '';
    if (!licenseKey || licenseKey.length > 256) {
      return res.status(400).json({ error: 'A valid License Key is required' });
    }
    const hwid = typeof req.body.hwid === 'string' ? req.body.hwid.trim() : '';
    if (!hwid || hwid.length > 128) {
      return res.status(400).json({ error: 'A valid device identifier is required' });
    }

    const {
      KEYAUTH_NAME: name,
      KEYAUTH_OWNER_ID: ownerid,
      KEYAUTH_VERSION: version,
    } = process.env;
    if (!name || !ownerid || !version) {
      return res.status(503).json({ error: 'KeyAuth application is not configured' });
    }

    let initialization;
    let authentication;
    try {
      // KeyAuth requires an application session before a license can be checked.
      initialization = await keyAuthRequest({ type: 'init', name, ownerid, version });
      if (initialization.success !== true || !initialization.sessionid) {
        return res.status(502).json({ error: 'Could not initialize KeyAuth application' });
      }
      authentication = await keyAuthRequest({
        type: 'license',
        name,
        ownerid,
        sessionid: initialization.sessionid,
        key: licenseKey,
        hwid,
      });
    } catch (error) {
      console.error('KeyAuth request failed:', error.message);
      return res.status(502).json({ error: 'KeyAuth authentication service is unavailable' });
    }

    if (authentication.success !== true) {
      const reason = typeof authentication.message === 'string' && authentication.message.trim();
      return res.status(401).json({
        error: reason ? `KeyAuth: ${reason}` : 'KeyAuth rechazó la licencia; revisa que esté activa y pertenezca a esta aplicación.',
      });
    }

    const username = authentication.info?.username;
    if (typeof username !== 'string' || !username.trim()) {
      return res.status(502).json({ error: 'KeyAuth response did not include a user identity' });
    }
    const keyAuthUsername = username.trim().toLowerCase();
    const role = resolveKeyAuthRole(authentication.info);
    const emailHash = crypto.createHash('sha256').update(keyAuthUsername).digest('hex');
    const user = await User.findOneAndUpdate(
      { keyAuthUsername },
      {
        $set: { keyAuthUsername },
        $setOnInsert: { email: `keyauth-${emailHash}@local.invalid`, role: 'user' },
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );

    // Return a short-lived local token; never expose KeyAuth app credentials or session ID.
    const token = jwt.sign(
      { sub: user._id.toString(), role, keyAuthUsername },
      process.env.JWT_SECRET,
      { expiresIn: '4h', issuer: 'customization-hub' }
    );
    return res.status(200).json({
      token,
      tokenType: 'Bearer',
      expiresIn: 14400,
      user: { username, role },
    });
  })
);

module.exports = router;
module.exports.resolveKeyAuthRole = resolveKeyAuthRole;
