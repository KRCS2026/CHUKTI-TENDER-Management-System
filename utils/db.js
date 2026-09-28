'use strict';

/**
 * চুক্তি (Chukti) — database layer.
 * Uses the built-in `node:sqlite` module (Node.js 22.5+ / 24).
 * Every query in this project is parameterised to prevent SQL injection.
 */

const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcryptjs');

const config = require('./config');

const DB_PATH = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.join(__dirname, '..', 'database.db');

const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');
db.exec('PRAGMA busy_timeout = 5000');

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS Users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'rep',  -- 'admin' | 'manager' | 'rep'
  phone TEXT,
  is_active INTEGER DEFAULT 1,
  last_login TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS Tenders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tender_id TEXT UNIQUE NOT NULL,
  tender_name TEXT NOT NULL,
  category TEXT,
  stage TEXT NOT NULL DEFAULT 'upcoming',

  -- Approval workflow
  is_approved INTEGER DEFAULT 0,
  approved_by INTEGER,
  approved_at TEXT,
  approval_notes TEXT,

  -- Purchase
  purchased_by INTEGER,
  purchased_at TEXT,
  purchase_notes TEXT,

  -- Financial
  tender_budget REAL,
  tender_bg REAL,
  bg_type TEXT,

  -- Requirement
  tender_experience TEXT,

  -- Timeline
  closing_date TEXT,
  submission_date TEXT,
  result_date TEXT,

  -- Bid
  our_bid_price REAL,
  deposited_amount REAL,

  -- Won/Lost
  winning_price REAL,
  winner_company TEXT,
  lost_reason TEXT,
  lost_notes TEXT,
  won_notes TEXT,
  refund_amount REAL,
  refund_date TEXT,

  -- Common
  notes TEXT,
  created_by INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT,

  FOREIGN KEY (approved_by) REFERENCES Users(id),
  FOREIGN KEY (purchased_by) REFERENCES Users(id),
  FOREIGN KEY (created_by) REFERENCES Users(id)
);

CREATE TABLE IF NOT EXISTS ActivityLog (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  action TEXT NOT NULL,
  tender_id INTEGER,
  details TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE SET NULL,
  FOREIGN KEY (tender_id) REFERENCES Tenders(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tenders_stage ON Tenders(stage);
CREATE INDEX IF NOT EXISTS idx_tenders_approved ON Tenders(is_approved);
CREATE INDEX IF NOT EXISTS idx_tenders_created ON Tenders(created_by);
CREATE INDEX IF NOT EXISTS idx_activity_tender ON ActivityLog(tender_id);
CREATE INDEX IF NOT EXISTS idx_activity_user ON ActivityLog(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_created ON ActivityLog(created_at);
`;

/** Tender ID must be unique regardless of letter case. */
const TENDER_ID_INDEX_SQL =
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_tenders_tender_id_ci ON Tenders(LOWER(tender_id))';

function columnExists(table, column) {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all();
  return rows.some((row) => row.name === column);
}

/** Lightweight migration helper for columns added after the first release. */
function addColumnIfMissing(table, column, definition) {
  if (!columnExists(table, column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function initDatabase() {
  db.exec(SCHEMA_SQL);
  addColumnIfMissing('Tenders', 'approval_notes', 'TEXT');
  addColumnIfMissing('Tenders', 'purchase_notes', 'TEXT');
  addColumnIfMissing('Tenders', 'won_notes', 'TEXT');
  db.exec(TENDER_ID_INDEX_SQL);
  // Backfill: old lost tenders that never stored a quoted price (always 0 before)
  // now fall back to their winning price so the lost summary is correct.
  try {
    db.exec(
      `UPDATE Tenders SET our_bid_price = winning_price
       WHERE stage = 'lost' AND (our_bid_price IS NULL) AND winning_price IS NOT NULL`
    );
  } catch (err) {
    console.warn('[chukti] lost-price backfill skipped:', err.message);
  }
}

/** Creates the default Admin account on a brand-new database. */
function ensureDefaultAdmin() {
  const { total } = db.prepare('SELECT COUNT(*) AS total FROM Users').get();

  if (Number(total) > 0) return null;

  const { name, email, password, role } = config.DEFAULT_ADMIN;
  const passwordHash = bcrypt.hashSync(password, config.BCRYPT_ROUNDS);

  const result = db
    .prepare(
      'INSERT INTO Users (name, email, password_hash, role, phone, is_active) VALUES (?, ?, ?, ?, ?, 1)'
    )
    .run(name, email.toLowerCase(), passwordHash, role, null);

  return { id: Number(result.lastInsertRowid), email, password };
}

module.exports = {
  db,
  DB_PATH,
  initDatabase,
  ensureDefaultAdmin
};
