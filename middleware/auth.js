'use strict';

/**
 * চুক্তি (Chukti) — JWT (HttpOnly cookie) authentication middleware.
 */

const jwt = require('jsonwebtoken');

const config = require('../utils/config');
const { db } = require('../utils/db');

const USER_FIELDS = 'id, name, email, role, phone, is_active, last_login, created_at';

function readToken(req) {
  const fromCookie = req.cookies ? req.cookies[config.COOKIE_NAME] : null;
  if (fromCookie) return fromCookie;

  const header = req.get('authorization') || '';
  if (header.toLowerCase().startsWith('bearer ')) return header.slice(7).trim();

  return null;
}

function loadUserById(id) {
  return db.prepare(`SELECT ${USER_FIELDS} FROM Users WHERE id = ?`).get(id) || null;
}

function findUserByEmail(email) {
  return (
    db
      .prepare('SELECT * FROM Users WHERE LOWER(email) = LOWER(?)')
      .get(String(email || '').trim()) || null
  );
}

function signToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, email: user.email },
    config.JWT_SECRET,
    { expiresIn: config.JWT_EXPIRES_IN }
  );
}

function setAuthCookie(res, token, remember) {
  const options = {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.IS_PROD,
    path: '/'
  };

  // "Remember me" keeps the session for 7 days, otherwise it ends with the browser session.
  if (remember) options.maxAge = config.COOKIE_MAX_AGE;

  res.cookie(config.COOKIE_NAME, token, options);
}

function clearAuthCookie(res) {
  res.clearCookie(config.COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.IS_PROD,
    path: '/'
  });
}

/** Blocks the request unless a valid, active session exists. */
function requireAuth(req, res, next) {
  const token = readToken(req);
  if (!token) return res.status(401).json({ error: 'Authentication required' });

  let payload;
  try {
    payload = jwt.verify(token, config.JWT_SECRET);
  } catch (err) {
    clearAuthCookie(res);
    return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
  }

  const user = loadUserById(payload.sub);
  if (!user) {
    clearAuthCookie(res);
    return res.status(401).json({ error: 'This account no longer exists.' });
  }
  if (!user.is_active) {
    clearAuthCookie(res);
    return res.status(403).json({ error: 'This account has been disabled.' });
  }

  req.user = user;
  return next();
}

/** Blocks the request unless the signed-in user has one of the given roles. */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have permission to perform this action.' });
    }
    return next();
  };
}

module.exports = {
  USER_FIELDS,
  readToken,
  loadUserById,
  findUserByEmail,
  signToken,
  setAuthCookie,
  clearAuthCookie,
  requireAuth,
  requireRole
};
