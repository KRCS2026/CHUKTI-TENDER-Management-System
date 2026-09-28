'use strict';

/**
 * চুক্তি (Chukti) — Tender Management System
 * Express + built-in node:sqlite + JWT cookie sessions.
 */

const path = require('node:path');
const express = require('express');
const cookieParser = require('cookie-parser');

const config = require('./utils/config');
const { DB_PATH, initDatabase, ensureDefaultAdmin } = require('./utils/db');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const tenderRoutes = require('./routes/tenders');
const activityRoutes = require('./routes/activity');

/* ---------- database ---------- */
initDatabase();
const seeded = ensureDefaultAdmin();

/* ---------- app ---------- */
const app = express();

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

/* ---------- api ---------- */
app.get('/api/health', (req, res) => {
  res.json({ ok: true, name: config.APP_NAME, time: new Date().toISOString() });
});
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/tenders', tenderRoutes);
app.use('/api/activity', activityRoutes);

app.use('/api', (req, res) => res.status(404).json({ error: 'API endpoint not found.' }));

/* ---------- static frontend ---------- */
const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir, { extensions: ['html'] }));

// Unknown non-API routes fall back to the app shell, which redirects to the
// login page when there is no session.
app.use((req, res) => {
  res.status(404).sendFile(path.join(publicDir, 'index.html'));
});

/* ---------- error handling ---------- */
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[chukti] request failed:', err);
  if (res.headersSent) return;
  const status = err.status || 500;
  res.status(status).json({
    error: config.IS_PROD ? 'Something went wrong. Please try again.' : err.message
  });
});

/* ---------- start ---------- */
const server = app.listen(config.PORT, () => {
  console.log('');
  console.log(`  ${config.APP_NAME} — ${config.APP_SUBTITLE}`);
  console.log(`  Database : ${DB_PATH}`);
  console.log(`  Server   : http://localhost:${config.PORT}`);
  console.log('');
  if (seeded) {
    console.log('  Default admin created:');
    console.log(`    email    : ${seeded.email}`);
    console.log(`    password : ${seeded.password}`);
    console.log('  Change it after the first login.');
    console.log('');
  }
});

function shutdown(signal) {
  console.log(`\n[chukti] ${signal} received — closing down.`);
  server.close(() => process.exit(0));
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

module.exports = app;
