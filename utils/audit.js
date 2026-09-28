'use strict';

/**
 * চুক্তি (Chukti) — activity / audit trail.
 * Every state changing action is written to ActivityLog.
 */

const { db } = require('./db');

const INSERT_ACTIVITY = `
  INSERT INTO ActivityLog (user_id, action, tender_id, details, created_at)
  VALUES (?, ?, ?, ?, ?)
`;

/**
 * Writes one activity row.
 * @param {{ userId?: number|null, action: string, tenderId?: number|null, details?: string|null }} entry
 */
function logActivity({ userId = null, action, tenderId = null, details = null }) {
  if (!action) throw new Error('logActivity requires an action');

  db.prepare(INSERT_ACTIVITY).run(
    userId ?? null,
    String(action),
    tenderId ?? null,
    details ?? null,
    new Date().toISOString()
  );
}

/** Convenience helper used by the activity API. */
function recentActivity(limit = 10) {
  return db
    .prepare(
      `SELECT a.*, u.name AS user_name, u.role AS user_role,
              t.tender_id AS tender_code, t.tender_name AS tender_title
       FROM ActivityLog a
       LEFT JOIN Users u ON u.id = a.user_id
       LEFT JOIN Tenders t ON t.id = a.tender_id
       ORDER BY a.id DESC
       LIMIT ?`
    )
    .all(Number(limit));
}

module.exports = { logActivity, recentActivity };
