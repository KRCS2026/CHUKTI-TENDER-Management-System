'use strict';

/** চুক্তি (Chukti) — authentication routes: login / logout / me */

const express = require('express');
const bcrypt = require('bcryptjs');

const config = require('../utils/config');
const { db } = require('../utils/db');
const { logActivity } = require('../utils/audit');
const { ACTIONS } = require('../utils/constants');
const {
  USER_FIELDS,
  findUserByEmail,
  signToken,
  setAuthCookie,
  clearAuthCookie,
  requireAuth
} = require('../middleware/auth');

const router = express.Router();

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    phone: user.phone || null,
    is_active: Number(user.is_active) === 1,
    last_login: user.last_login || null,
    created_at: user.created_at
  };
}

/* POST /api/auth/login */
router.post('/login', (req, res) => {
  const email = String(req.body?.email || '').trim();
  const password = String(req.body?.password || '');

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const user = findUserByEmail(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }
  if (Number(user.is_active) !== 1) {
    return res.status(403).json({ error: 'This account has been disabled. Contact an administrator.' });
  }

  const now = new Date().toISOString();
  db.prepare('UPDATE Users SET last_login = ? WHERE id = ?').run(now, user.id);

  const token = signToken(user);
  setAuthCookie(res, token, Boolean(req.body?.remember));

  logActivity({
    userId: user.id,
    action: ACTIONS.LOGIN,
    details: `${user.name} signed in`
  });

  const fresh = db.prepare(`SELECT ${USER_FIELDS} FROM Users WHERE id = ?`).get(user.id);
  return res.json({ user: publicUser(fresh) });
});

/* POST /api/auth/logout */
router.post('/logout', (req, res) => {
  if (req.user) {
    logActivity({
      userId: req.user.id,
      action: ACTIONS.LOGOUT,
      details: `${req.user.name} signed out`
    });
  }
  clearAuthCookie(res);
  return res.json({ ok: true });
});

/* GET /api/auth/me */
router.get('/me', requireAuth, (req, res) => {
  return res.json({ user: publicUser(req.user) });
});

module.exports = router;
module.exports.publicUser = publicUser;
module.exports.config = config;
