'use strict';

/** চুক্তি (Chukti) — activity log API. */

const express = require('express');

const { db } = require('../utils/db');
const { ACTION_LABELS } = require('../utils/constants');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

function serialize(row) {
  const meta = ACTION_LABELS[row.action] || { label: row.action, icon: '•' };
  return {
    id: row.id,
    user_id: row.user_id,
    user_name: row.user_name || 'System',
    user_role: row.user_role || null,
    action: row.action,
    action_label: meta.label,
    action_icon: meta.icon,
    tender_id: row.tender_id,
    tender_code: row.tender_code || null,
    tender_title: row.tender_title || null,
    details: row.details || null,
    created_at: row.created_at
  };
}

/**
 * Builds the shared query. Reps only ever see activity that belongs to an
 * approved tender, which is the only tenders they are allowed to see at all.
 */
function queryActivity(req, { recentOnly = false } = {}) {
  const where = [];
  const params = [];
  const isRep = req.user.role === 'rep';

  const join = `FROM ActivityLog a
     LEFT JOIN Users u ON u.id = a.user_id
     LEFT JOIN Tenders t ON t.id = a.tender_id`;

  if (isRep) {
    where.push('t.id IS NOT NULL', 't.is_approved = 1');
  }
  if (recentOnly) {
    // dashboard widget: only meaningful tender events
    where.push('a.tender_id IS NOT NULL');
    if (!isRep) where.push("a.action NOT IN ('login', 'logout')");
  }

  if (req.query.tender_id) {
    const code = String(req.query.tender_id).trim();
    const numeric = Number(code);
    if (Number.isInteger(numeric) && String(numeric) === code) {
      where.push('a.tender_id = ?');
      params.push(numeric);
    } else {
      where.push('LOWER(t.tender_id) = LOWER(?)');
      params.push(code);
    }
  }
  if (req.query.user_id) {
    where.push('a.user_id = ?');
    params.push(Number(req.query.user_id));
  }
  if (req.query.action) {
    where.push('a.action = ?');
    params.push(String(req.query.action));
  }
  if (req.query.from) {
    where.push('a.created_at >= ?');
    params.push(`${String(req.query.from).slice(0, 10)}T00:00:00.000Z`);
  }
  if (req.query.to) {
    where.push('a.created_at <= ?');
    params.push(`${String(req.query.to).slice(0, 10)}T23:59:59.999Z`);
  }

  const rawLimit = Number(req.query.limit);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 500) : recentOnly ? 8 : 200;

  const sql = `SELECT a.id, a.user_id, a.action, a.tender_id, a.details, a.created_at,
                      u.name AS user_name, u.role AS user_role,
                      t.tender_id AS tender_code, t.tender_name AS tender_title
               ${join}
               ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
               ORDER BY a.id DESC
               LIMIT ?`;

  return { sql, params: [...params, limit] };
}

/* GET /api/activity/recent */
router.get('/recent', (req, res) => {
  const { sql, params } = queryActivity(req, { recentOnly: true });
  res.json({ activity: db.prepare(sql).all(...params).map(serialize) });
});

/* GET /api/activity?tender_id=&user_id=&action=&from=&to= */
router.get('/', (req, res) => {
  const { sql, params } = queryActivity(req);
  res.json({ activity: db.prepare(sql).all(...params).map(serialize) });
});

module.exports = router;
