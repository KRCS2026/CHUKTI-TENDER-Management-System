'use strict';

/** চুক্তি (Chukti) — User management API (Admin only). */

const express = require('express');
const bcrypt = require('bcryptjs');

const config = require('../utils/config');
const { db } = require('../utils/db');
const { logActivity } = require('../utils/audit');
const { ACTIONS, ROLES, ROLE_LABELS } = require('../utils/constants');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth, requireRole('admin'));

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function serializeUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    role_label: ROLE_LABELS[row.role] || row.role,
    phone: row.phone || null,
    is_active: Number(row.is_active) === 1,
    last_login: row.last_login || null,
    created_at: row.created_at,
    tenders_created: row.tenders_created === undefined ? undefined : Number(row.tenders_created)
  };
}

function countActiveAdmins(excludeId = null) {
  const row = excludeId
    ? db
        .prepare("SELECT COUNT(*) AS total FROM Users WHERE role = 'admin' AND is_active = 1 AND id <> ?")
        .get(excludeId)
    : db.prepare("SELECT COUNT(*) AS total FROM Users WHERE role = 'admin' AND is_active = 1").get();
  return Number(row.total);
}

function emailTaken(email, excludeId = null) {
  const row = excludeId
    ? db.prepare('SELECT id FROM Users WHERE LOWER(email) = LOWER(?) AND id <> ?').get(email, excludeId)
    : db.prepare('SELECT id FROM Users WHERE LOWER(email) = LOWER(?)').get(email);
  return Boolean(row);
}

/* GET /api/users */
router.get('/', (req, res) => {
  const rows = db
    .prepare(
      `SELECT u.id, u.name, u.email, u.role, u.phone, u.is_active, u.last_login, u.created_at,
              (SELECT COUNT(*) FROM Tenders t WHERE t.created_by = u.id) AS tenders_created
       FROM Users u
       ORDER BY CASE u.role WHEN 'admin' THEN 0 WHEN 'manager' THEN 1 ELSE 2 END, u.name COLLATE NOCASE`
    )
    .all();

  res.json({ users: rows.map(serializeUser) });
});

/* POST /api/users */
router.post('/', (req, res) => {
  const name = String(req.body?.name || '').trim();
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const role = String(req.body?.role || 'rep').trim();
  const phone = String(req.body?.phone || '').trim() || null;

  if (!name) return res.status(400).json({ error: 'Name is required.' });
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'A valid email address is required.' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  if (!ROLES.includes(role)) return res.status(400).json({ error: 'Role must be admin, manager or rep.' });
  if (emailTaken(email)) return res.status(409).json({ error: 'That email address is already registered.' });

  const hash = bcrypt.hashSync(password, config.BCRYPT_ROUNDS);
  const result = db
    .prepare(
      'INSERT INTO Users (name, email, password_hash, role, phone, is_active, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)'
    )
    .run(name, email, hash, role, phone, new Date().toISOString());

  const created = db.prepare('SELECT * FROM Users WHERE id = ?').get(Number(result.lastInsertRowid));

  logActivity({
    userId: req.user.id,
    action: ACTIONS.USER_CREATED,
    details: `Created ${ROLE_LABELS[role]} account for ${name} (${email})`
  });

  return res.status(201).json({ user: serializeUser(created) });
});

/* PUT /api/users/:id */
router.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  const target = db.prepare('SELECT * FROM Users WHERE id = ?').get(id);
  if (!target) return res.status(404).json({ error: 'User not found.' });

  const name = req.body?.name === undefined ? target.name : String(req.body.name).trim();
  const email = req.body?.email === undefined ? target.email : String(req.body.email).trim().toLowerCase();
  const role = req.body?.role === undefined ? target.role : String(req.body.role).trim();
  const phone = req.body?.phone === undefined ? target.phone : String(req.body.phone).trim() || null;
  const isActive =
    req.body?.is_active === undefined ? Number(target.is_active) : req.body.is_active ? 1 : 0;

  if (!name) return res.status(400).json({ error: 'Name is required.' });
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'A valid email address is required.' });
  if (!ROLES.includes(role)) return res.status(400).json({ error: 'Role must be admin, manager or rep.' });
  if (emailTaken(email, id)) return res.status(409).json({ error: 'That email address is already registered.' });
  if (id === req.user.id && (role !== 'admin' || isActive !== 1)) {
    return res.status(400).json({ error: 'You cannot change your own role or disable your own account.' });
  }
  if (target.role === 'admin' && (role !== 'admin' || isActive !== 1) && countActiveAdmins(id) === 0) {
    return res.status(400).json({ error: 'At least one active admin must remain.' });
  }

  db.prepare('UPDATE Users SET name = ?, email = ?, role = ?, phone = ?, is_active = ? WHERE id = ?').run(
    name,
    email,
    role,
    phone,
    isActive,
    id
  );

  const changes = [];
  if (name !== target.name) changes.push(`name → ${name}`);
  if (email !== target.email) changes.push(`email → ${email}`);
  if (role !== target.role) changes.push(`role → ${ROLE_LABELS[role]}`);
  if (phone !== (target.phone || null)) changes.push('phone updated');
  if (isActive !== Number(target.is_active)) changes.push(isActive ? 'enabled' : 'disabled');

  logActivity({
    userId: req.user.id,
    action: ACTIONS.USER_UPDATED,
    details: `Updated ${name}${changes.length ? ' (' + changes.join(', ') + ')' : ''}`
  });

  return res.json({ user: serializeUser(db.prepare('SELECT * FROM Users WHERE id = ?').get(id)) });
});

/* POST /api/users/:id/reset-password */
router.post('/:id/reset-password', (req, res) => {
  const id = Number(req.params.id);
  const target = db.prepare('SELECT * FROM Users WHERE id = ?').get(id);
  if (!target) return res.status(404).json({ error: 'User not found.' });

  const password = String(req.body?.password || '');
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });

  const hash = bcrypt.hashSync(password, config.BCRYPT_ROUNDS);
  db.prepare('UPDATE Users SET password_hash = ? WHERE id = ?').run(hash, id);

  logActivity({
    userId: req.user.id,
    action: ACTIONS.PASSWORD_RESET,
    details: `Reset password for ${target.name} (${target.email})`
  });

  return res.json({ ok: true });
});

/* DELETE /api/users/:id */
router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const target = db.prepare('SELECT * FROM Users WHERE id = ?').get(id);
  if (!target) return res.status(404).json({ error: 'User not found.' });

  if (id === req.user.id) return res.status(400).json({ error: 'You cannot delete your own account.' });
  if (target.role === 'admin' && countActiveAdmins(id) === 0) {
    return res.status(400).json({ error: 'At least one active admin must remain.' });
  }

  // Detach the account from tenders so the tender history survives the deletion.
  db.prepare('UPDATE Tenders SET created_by = NULL WHERE created_by = ?').run(id);
  db.prepare('UPDATE Tenders SET approved_by = NULL WHERE approved_by = ?').run(id);
  db.prepare('UPDATE Tenders SET purchased_by = NULL WHERE purchased_by = ?').run(id);
  db.prepare('DELETE FROM Users WHERE id = ?').run(id);

  logActivity({
    userId: req.user.id,
    action: ACTIONS.USER_DELETED,
    details: `Deleted ${target.name} (${target.email})`
  });

  return res.json({ ok: true });
});

module.exports = router;
