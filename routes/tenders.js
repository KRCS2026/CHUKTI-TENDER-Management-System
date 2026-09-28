'use strict';

/** চুক্তি (Chukti) — Tender CRUD + approval / purchase / result workflow. */

const express = require('express');

const { db } = require('../utils/db');
const { logActivity } = require('../utils/audit');
const {
  ACTIONS,
  STAGES,
  CATEGORIES,
  BG_TYPES,
  LOST_REASONS,
  LOST_REASON_MAP
} = require('../utils/constants');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

const SELECT_BASE = `SELECT t.*,
    cu.name AS created_by_name, cu.role AS created_by_role,
    au.name AS approved_by_name,
    pu.name AS purchased_by_name
  FROM Tenders t
  LEFT JOIN Users cu ON cu.id = t.created_by
  LEFT JOIN Users au ON au.id = t.approved_by
  LEFT JOIN Users pu ON pu.id = t.purchased_by`;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const nowIso = () => new Date().toISOString();
const toBool = (value) => Number(value) === 1;

function cleanText(value, max = 500) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  if (!text) return null;
  return text.slice(0, max);
}

function numOrNull(value) {
  if (value === undefined || value === null || value === '') return null;
  const num = Number(String(value).replace(/[,\s৳]/g, ''));
  if (!Number.isFinite(num) || num < 0) return null;
  return num;
}

function dateOrNull(value) {
  const text = cleanText(value, 10);
  if (!text) return null;
  return DATE_RE.test(text) ? text : null;
}

/** Whole days between today and a date (negative = already passed). */
function daysLeft(dateStr) {
  if (!dateStr) return null;
  const target = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function serialize(row) {
  if (!row) return null;
  const reason = row.lost_reason ? LOST_REASON_MAP[row.lost_reason] : null;

  return {
    id: row.id,
    tender_id: row.tender_id,
    tender_name: row.tender_name,
    category: row.category || null,
    stage: row.stage,

    is_approved: toBool(row.is_approved),
    approved_by: row.approved_by || null,
    approved_by_name: row.approved_by_name || null,
    approved_at: row.approved_at || null,
    approval_notes: row.approval_notes || null,

    purchased_by: row.purchased_by || null,
    purchased_by_name: row.purchased_by_name || null,
    purchased_at: row.purchased_at || null,
    purchase_notes: row.purchase_notes || null,

    tender_budget: row.tender_budget === null ? null : Number(row.tender_budget),
    tender_bg: row.tender_bg === null ? null : Number(row.tender_bg),
    bg_type: row.bg_type || null,
    tender_experience: row.tender_experience || null,

    closing_date: row.closing_date || null,
    submission_date: row.submission_date || null,
    result_date: row.result_date || null,
    days_left: row.stage === 'upcoming' ? daysLeft(row.closing_date) : null,

    our_bid_price: row.our_bid_price === null ? null : Number(row.our_bid_price),
    deposited_amount: row.deposited_amount === null ? null : Number(row.deposited_amount),

    winning_price: row.winning_price === null ? null : Number(row.winning_price),
    winner_company: row.winner_company || null,
    lost_reason: row.lost_reason || null,
    lost_reason_label: reason ? reason.label : null,
    lost_reason_icon: reason ? reason.icon : null,
    lost_notes: row.lost_notes || null,
    won_notes: row.won_notes || null,
    refund_amount: row.refund_amount === null ? null : Number(row.refund_amount),
    refund_date: row.refund_date || null,

    notes: row.notes || null,
    created_by: row.created_by || null,
    created_by_name: row.created_by_name || null,
    created_by_role: row.created_by_role || null,
    created_at: row.created_at,
    updated_at: row.updated_at || null
  };
}

/** Reps only see tenders that have been ordered to purchase. */
function visibilityClause(user) {
  return user.role === 'rep' ? ' WHERE t.is_approved = 1' : '';
}

function findTender(idOrCode) {
  const raw = String(idOrCode).trim();
  const numeric = Number(raw);

  if (Number.isInteger(numeric) && String(numeric) === raw) {
    return db.prepare(`${SELECT_BASE} WHERE t.id = ?`).get(numeric) || null;
  }
  return db.prepare(`${SELECT_BASE} WHERE LOWER(t.tender_id) = LOWER(?)`).get(raw) || null;
}

function buildStats(rows) {
  const stats = {
    upcoming: { count: 0, amount: 0, pending: 0, approved: 0 },
    ongoing: { count: 0, amount: 0 },
    won: { count: 0, amount: 0 },
    lost: { count: 0, amount: 0 },
    total: rows.length,
    closing_soon: []
  };

  rows.forEach((tender) => {
    const bucket = stats[tender.stage];
    if (!bucket) return;
    bucket.count += 1;

    if (tender.stage === 'upcoming') {
      bucket.amount += tender.tender_budget || 0;
      if (tender.is_approved) bucket.approved += 1;
      else bucket.pending += 1;

      const left = daysLeft(tender.closing_date);
      if (left !== null && left >= 0 && left <= 7) {
        stats.closing_soon.push({
          id: tender.id,
          tender_id: tender.tender_id,
          tender_name: tender.tender_name,
          closing_date: tender.closing_date,
          days_left: left,
          is_approved: tender.is_approved
        });
      }
    } else if (tender.stage === 'ongoing') {
      bucket.amount += tender.tender_budget || tender.our_bid_price || 0;
    } else if (tender.stage === 'won') {
      bucket.amount += tender.winning_price || tender.our_bid_price || 0;
    } else if (tender.stage === 'lost') {
      // Lost summary = sum of our quoted/submitted prices.
      bucket.amount += tender.our_bid_price || tender.winning_price || 0;
    }
  });

  stats.closing_soon.sort((a, b) => a.days_left - b.days_left);
  stats.closing_soon = stats.closing_soon.slice(0, 8);
  stats.pending_total = stats.upcoming.pending;

  return stats;
}

/* GET /api/tenders/stats — role scoped dashboard statistics */
router.get('/stats', (req, res) => {
  const rows = db.prepare(`${SELECT_BASE}${visibilityClause(req.user)}`).all();
  const stats = buildStats(rows);
  const isReviewer = req.user.role === 'admin' || req.user.role === 'manager';

  const allPending = rows.filter((row) => row.stage === 'upcoming' && !toBool(row.is_approved));
  const myPending = allPending.filter((row) => row.created_by === req.user.id);

  stats.pending_list = isReviewer
    ? allPending
        .sort((a, b) => (a.closing_date || '9999').localeCompare(b.closing_date || '9999'))
        .slice(0, 5)
        .map(serialize)
    : [];
  stats.my_pending_count = (isReviewer ? allPending : myPending).length;

  res.json({ stats });
});

/* GET /api/tenders?stage=&search=&category=&approval=&sort=&order= */
router.get('/', (req, res) => {
  const where = [];
  const params = [];

  if (req.user.role === 'rep') where.push('t.is_approved = 1');

  const stage = String(req.query.stage || '').trim();
  if (stage && STAGES.includes(stage)) {
    where.push('t.stage = ?');
    params.push(stage);
  }

  const approval = String(req.query.approval || '').trim();
  if (approval === 'pending') where.push('t.is_approved = 0');
  if (approval === 'approved') where.push('t.is_approved = 1');

  const category = String(req.query.category || '').trim();
  if (category && category !== 'all') {
    where.push('t.category = ?');
    params.push(category);
  }

  const search = String(req.query.search || '').trim();
  if (search) {
    where.push(
      '(LOWER(t.tender_id) LIKE ? OR LOWER(t.tender_name) LIKE ? OR LOWER(IFNULL(t.category, \'\')) LIKE ? OR LOWER(IFNULL(t.winner_company, \'\')) LIKE ?)'
    );
    const like = `%${search.toLowerCase()}%`;
    params.push(like, like, like, like);
  }

  const sortMap = {
    closing: 't.closing_date',
    budget: 't.tender_budget',
    created: 't.id',
    name: 't.tender_name COLLATE NOCASE'
  };
  const sortColumn = sortMap[String(req.query.sort || 'created')] || 't.id';
  const direction = String(req.query.order || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  const sql = `${SELECT_BASE}${where.length ? ' WHERE ' + where.join(' AND ') : ''}
    ORDER BY ${sortColumn} ${direction}`;

  const rows = db.prepare(sql).all(...params);
  res.json({
    tenders: rows.map(serialize),
    total: rows.length,
    filters: { category: CATEGORIES, bg_type: BG_TYPES, lost_reasons: LOST_REASONS }
  });
});

/* GET /api/tenders/:id */
router.get('/:id', (req, res) => {
  const tender = findTender(req.params.id);
  if (!tender) return res.status(404).json({ error: 'Tender not found.' });
  if (req.user.role === 'rep' && !toBool(tender.is_approved)) {
    return res.status(403).json({ error: 'Only approved tenders are visible to you.' });
  }

  const activity = db
    .prepare(
      `SELECT a.id, a.action, a.details, a.created_at, u.name AS user_name
       FROM ActivityLog a LEFT JOIN Users u ON u.id = a.user_id
       WHERE a.tender_id = ? ORDER BY a.id DESC LIMIT 25`
    )
    .all(tender.id);

  res.json({ tender: serialize(tender), activity });
});

/** Only admins may edit any tender; a manager may edit the ones they created. */
function isEditableBy(user, row) {
  if (user.role === 'admin') return true;
  if (user.role === 'manager') return row.created_by === user.id;
  return false;
}

/* POST /api/tenders */
router.post('/', requireRole('admin', 'manager'), (req, res) => {
  const code = cleanText(req.body?.tender_id, 40);
  const name = cleanText(req.body?.tender_name, 300);

  if (!code) return res.status(400).json({ error: 'Tender ID is required.' });
  if (!name) return res.status(400).json({ error: 'Tender name is required.' });

  const duplicate = db.prepare('SELECT id FROM Tenders WHERE LOWER(tender_id) = LOWER(?)').get(code);
  if (duplicate) return res.status(409).json({ error: `Tender ID "${code}" already exists.` });

  const stamp = nowIso();
  const result = db
    .prepare(
      `INSERT INTO Tenders (
         tender_id, tender_name, category, stage, is_approved,
         tender_budget, tender_bg, bg_type, tender_experience,
         closing_date, submission_date, notes, created_by, created_at, updated_at
       ) VALUES (?, ?, ?, 'upcoming', 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      code,
      name,
      cleanText(req.body?.category, 80),
      numOrNull(req.body?.tender_budget),
      numOrNull(req.body?.tender_bg),
      cleanText(req.body?.bg_type, 80),
      cleanText(req.body?.tender_experience, 120),
      dateOrNull(req.body?.closing_date),
      dateOrNull(req.body?.submission_date),
      cleanText(req.body?.notes, 2000),
      req.user.id,
      stamp,
      stamp
    );

  const created = findTender(Number(result.lastInsertRowid));

  logActivity({
    userId: req.user.id,
    action: ACTIONS.TENDER_CREATED,
    tenderId: created.id,
    details: `Created tender ${created.tender_id} · ${created.tender_name}`
  });

  return res.status(201).json({ tender: serialize(created) });
});

/* PUT /api/tenders/:id — descriptive fields only (workflow uses its own endpoints) */
router.put('/:id', requireRole('admin', 'manager'), (req, res) => {
  const existing = findTender(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Tender not found.' });
  if (!isEditableBy(req.user, existing)) {
    return res.status(403).json({ error: 'You can only edit tenders that you created.' });
  }

  const body = req.body || {};
  const code = body.tender_id === undefined ? existing.tender_id : cleanText(body.tender_id, 40);
  const name = body.tender_name === undefined ? existing.tender_name : cleanText(body.tender_name, 300);

  if (!code) return res.status(400).json({ error: 'Tender ID is required.' });
  if (!name) return res.status(400).json({ error: 'Tender name is required.' });

  const duplicate = db
    .prepare('SELECT id FROM Tenders WHERE LOWER(tender_id) = LOWER(?) AND id <> ?')
    .get(code, existing.id);
  if (duplicate) return res.status(409).json({ error: `Tender ID "${code}" already exists.` });

  const lostReason = cleanText(body.lost_reason, 40);
  const validReason = lostReason && LOST_REASON_MAP[lostReason] ? lostReason : null;

  const pick = (key, current) => (body[key] === undefined ? current : cleanText(body[key], 2000));
  const pickNum = (key, current) => (body[key] === undefined ? current : numOrNull(body[key]));
  const pickDate = (key, current) => (body[key] === undefined ? current : dateOrNull(body[key]));

  db.prepare(
    `UPDATE Tenders SET
       tender_id = ?, tender_name = ?, category = ?, bg_type = ?, tender_experience = ?,
       tender_budget = ?, tender_bg = ?, closing_date = ?, submission_date = ?,
       our_bid_price = ?, deposited_amount = ?, result_date = ?, winning_price = ?,
       winner_company = ?, lost_reason = ?, lost_notes = ?, won_notes = ?,
       refund_amount = ?, refund_date = ?, notes = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    code,
    name,
    pick('category', existing.category),
    pick('bg_type', existing.bg_type),
    pick('tender_experience', existing.tender_experience),
    pickNum('tender_budget', existing.tender_budget),
    pickNum('tender_bg', existing.tender_bg),
    pickDate('closing_date', existing.closing_date),
    pickDate('submission_date', existing.submission_date),
    pickNum('our_bid_price', existing.our_bid_price),
    pickNum('deposited_amount', existing.deposited_amount),
    pickDate('result_date', existing.result_date),
    pickNum('winning_price', existing.winning_price),
    pick('winner_company', existing.winner_company),
    body.lost_reason === undefined ? existing.lost_reason : validReason,
    pick('lost_notes', existing.lost_notes),
    pick('won_notes', existing.won_notes),
    pickNum('refund_amount', existing.refund_amount),
    pickDate('refund_date', existing.refund_date),
    pick('notes', existing.notes),
    nowIso(),
    existing.id
  );

  const changed = Object.keys(body).filter((key) => key !== 'lost_reason');
  logActivity({
    userId: req.user.id,
    action: ACTIONS.TENDER_UPDATED,
    tenderId: existing.id,
    details: `Updated tender ${code}${changed.length ? ' (' + changed.join(', ') + ')' : ''}`
  });

  return res.json({ tender: serialize(findTender(existing.id)) });
});

/* DELETE /api/tenders/:id — admin only */
router.delete('/:id', requireRole('admin'), (req, res) => {
  const existing = findTender(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Tender not found.' });

  const label = `${existing.tender_id} · ${existing.tender_name}`;

  // ActivityLog rows for this tender cascade away with it, so the deletion
  // itself is recorded without a tender reference (tenderId stays null).
  db.prepare('DELETE FROM Tenders WHERE id = ?').run(existing.id);

  logActivity({
    userId: req.user.id,
    action: ACTIONS.TENDER_DELETED,
    details: `Deleted tender ${label}`
  });

  return res.json({ ok: true });
});

/* ---------- Workflow: approval ---------- */

/* POST /api/tenders/:id/approve — "Order to Purchase" */
router.post('/:id/approve', requireRole('admin', 'manager'), (req, res) => {
  const tender = findTender(req.params.id);
  if (!tender) return res.status(404).json({ error: 'Tender not found.' });
  if (tender.stage !== 'upcoming') {
    return res.status(400).json({ error: 'Only upcoming tenders can be ordered to purchase.' });
  }
  if (toBool(tender.is_approved)) {
    return res.status(400).json({ error: 'This tender is already approved.' });
  }

  const stamp = nowIso();
  db.prepare(
    'UPDATE Tenders SET is_approved = 1, approved_by = ?, approved_at = ?, approval_notes = ?, updated_at = ? WHERE id = ?'
  ).run(req.user.id, stamp, cleanText(req.body?.approval_notes, 1000), stamp, tender.id);

  logActivity({
    userId: req.user.id,
    action: ACTIONS.TENDER_APPROVED,
    tenderId: tender.id,
    details: `Ordered to purchase ${tender.tender_id} · ${tender.tender_name}`
  });

  return res.json({ tender: serialize(findTender(tender.id)) });
});

/* POST /api/tenders/:id/unapprove */
router.post('/:id/unapprove', requireRole('admin', 'manager'), (req, res) => {
  const tender = findTender(req.params.id);
  if (!tender) return res.status(404).json({ error: 'Tender not found.' });
  if (!toBool(tender.is_approved)) {
    return res.status(400).json({ error: 'This tender is not approved.' });
  }
  if (tender.stage !== 'upcoming') {
    return res.status(400).json({ error: 'Approval cannot be withdrawn after purchase.' });
  }

  db.prepare(
    'UPDATE Tenders SET is_approved = 0, approved_by = NULL, approved_at = NULL, approval_notes = NULL, updated_at = ? WHERE id = ?'
  ).run(nowIso(), tender.id);

  logActivity({
    userId: req.user.id,
    action: ACTIONS.TENDER_UNAPPROVED,
    tenderId: tender.id,
    details: `Withdrew purchase approval for ${tender.tender_id}`
  });

  return res.json({ tender: serialize(findTender(tender.id)) });
});

/* ---------- Workflow: purchase (any signed-in user) ---------- */

/* POST /api/tenders/:id/purchase — bid price is optional now */
router.post('/:id/purchase', (req, res) => {
  const tender = findTender(req.params.id);
  if (!tender) return res.status(404).json({ error: 'Tender not found.' });
  if (!toBool(tender.is_approved)) {
    return res.status(403).json({ error: 'This tender has not been ordered to purchase yet.' });
  }
  if (tender.stage !== 'upcoming') {
    return res.status(400).json({ error: 'Only upcoming tenders can be marked as purchased.' });
  }

  const bidPrice = numOrNull(req.body?.our_bid_price);

  const stamp = nowIso();
  db.prepare(
    `UPDATE Tenders SET
       stage = 'ongoing', purchased_by = ?, purchased_at = ?, purchase_notes = ?,
       submission_date = ?, our_bid_price = ?, deposited_amount = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    req.user.id,
    stamp,
    cleanText(req.body?.notes, 1000),
    dateOrNull(req.body?.submission_date),
    bidPrice,
    numOrNull(req.body?.deposited_amount),
    stamp,
    tender.id
  );

  logActivity({
    userId: req.user.id,
    action: ACTIONS.TENDER_PURCHASED,
    tenderId: tender.id,
    details:
      bidPrice === null
        ? `Purchased ${tender.tender_id}`
        : `Purchased ${tender.tender_id} (bid: ৳ ${bidPrice.toLocaleString('en-IN')})`
  });

  return res.json({ tender: serialize(findTender(tender.id)) });
});

/* POST /api/tenders/:id/mark-won */
router.post('/:id/mark-won', (req, res) => {
  const tender = findTender(req.params.id);
  if (!tender) return res.status(404).json({ error: 'Tender not found.' });
  if (tender.stage !== 'ongoing') {
    return res.status(400).json({ error: 'Only ongoing tenders can be marked as won.' });
  }

  const winningPrice = numOrNull(req.body?.winning_price);
  const resultDate = dateOrNull(req.body?.result_date);
  if (winningPrice === null) return res.status(400).json({ error: 'Winning price is required.' });
  if (!resultDate) return res.status(400).json({ error: 'A valid result date is required.' });

  db.prepare(
    `UPDATE Tenders SET
       stage = 'won', winning_price = ?, result_date = ?, refund_amount = ?, refund_date = ?,
       won_notes = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    winningPrice,
    resultDate,
    numOrNull(req.body?.refund_amount),
    dateOrNull(req.body?.refund_date),
    cleanText(req.body?.notes, 1000),
    nowIso(),
    tender.id
  );

  logActivity({
    userId: req.user.id,
    action: ACTIONS.TENDER_WON,
    tenderId: tender.id,
    details: `Marked ${tender.tender_id} as Won (৳ ${winningPrice.toLocaleString('en-IN')})`
  });

  return res.json({ tender: serialize(findTender(tender.id)) });
});

/* POST /api/tenders/:id/mark-lost */
router.post('/:id/mark-lost', (req, res) => {
  const tender = findTender(req.params.id);
  if (!tender) return res.status(404).json({ error: 'Tender not found.' });
  if (tender.stage !== 'ongoing') {
    return res.status(400).json({ error: 'Only ongoing tenders can be marked as lost.' });
  }

  const reason = cleanText(req.body?.lost_reason, 40);
  if (!reason || !LOST_REASON_MAP[reason]) {
    return res.status(400).json({ error: 'A valid lost reason is required.' });
  }

  const resultDate = dateOrNull(req.body?.result_date);
  if (!resultDate) return res.status(400).json({ error: 'A valid result date is required.' });

  // our_bid_price = koto taka quote kore submission kora hoyeche (lost summary te dekhabe).
  const quotedPrice = numOrNull(req.body?.our_bid_price);
  if (quotedPrice === null) {
    return res.status(400).json({ error: 'Our quoted price is required.' });
  }

  db.prepare(
    `UPDATE Tenders SET
       stage = 'lost', lost_reason = ?, winner_company = ?, winning_price = ?, result_date = ?,
       our_bid_price = ?, lost_notes = ?, refund_amount = ?, refund_date = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    reason,
    cleanText(req.body?.winner_company, 200),
    numOrNull(req.body?.winning_price),
    resultDate,
    quotedPrice,
    cleanText(req.body?.notes, 1000),
    numOrNull(req.body?.refund_amount),
    dateOrNull(req.body?.refund_date),
    nowIso(),
    tender.id
  );

  logActivity({
    userId: req.user.id,
    action: ACTIONS.TENDER_LOST,
    tenderId: tender.id,
    details: `Marked ${tender.tender_id} as Lost (${LOST_REASON_MAP[reason].label}, quoted ৳ ${quotedPrice.toLocaleString('en-IN')})`
  });

  return res.json({ tender: serialize(findTender(tender.id)) });
});

/* POST /api/tenders/:id/reopen — back to ongoing (result kept for history) */
router.post('/:id/reopen', requireRole('admin', 'manager'), (req, res) => {
  const tender = findTender(req.params.id);
  if (!tender) return res.status(404).json({ error: 'Tender not found.' });
  if (tender.stage !== 'won' && tender.stage !== 'lost') {
    return res.status(400).json({ error: 'Only won or lost tenders can be reopened.' });
  }

  db.prepare("UPDATE Tenders SET stage = 'ongoing', updated_at = ? WHERE id = ?").run(nowIso(), tender.id);

  logActivity({
    userId: req.user.id,
    action: ACTIONS.TENDER_REOPENED,
    tenderId: tender.id,
    details: `Reopened ${tender.tender_id} (was ${tender.stage})`
  });

  return res.json({ tender: serialize(findTender(tender.id)) });
});

module.exports = router;
module.exports._helpers = { serialize, findTender, buildStats, visibilityClause, SELECT_BASE };
