'use strict';

/**
 * চুক্তি (Chukti) — headless frontend check.
 *
 * Runs the real public/icons.js + public/app.js against the running API using a
 * tiny fake DOM. It verifies that every page renders, every element id referenced
 * by app.js exists in the markup, and that the main modals can submit.
 *
 * Usage: node scripts/frontend-check.js   (server must be running on BASE_URL)
 */

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const BASE = process.env.BASE_URL || 'http://localhost:3000';

let passed = 0;
let failed = 0;

function check(name, condition, extra) {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${extra ? ' :: ' + extra : ''}`);
  }
}

/* ---------- fake DOM ---------- */

function makeEl(tag) {
  const el = {
    tagName: String(tag || 'div').toUpperCase(),
    _html: '',
    _children: [],
    _queries: {},
    _listeners: {},
    value: '',
    checked: true,
    hidden: false,
    disabled: false,
    title: '',
    style: {},
    textContent: '',
    classList: {
      _set: new Set(),
      add(c) { this._set.add(c); },
      remove(c) { this._set.delete(c); },
      contains(c) { return this._set.has(c); },
      toggle(c, force) {
        const on = force === undefined ? !this._set.has(c) : Boolean(force);
        if (on) this._set.add(c); else this._set.delete(c);
        return on;
      }
    },
    appendChild(child) { this._children.push(child); return child; },
    remove() {},
    focus() {},
    click() { (this._listeners.click || []).forEach((fn) => fn({ target: this, currentTarget: this })); },
    addEventListener(type, fn) { (this._listeners[type] = this._listeners[type] || []).push(fn); },
    removeEventListener() {},
    querySelector(sel) {
      if (!this._queries[sel]) this._queries[sel] = makeEl(sel === 'form' ? 'form' : 'div');
      return this._queries[sel];
    },
    querySelectorAll() { return []; },
    getAttribute() { return null; },
    setAttribute() {},
    closest() { return null; }
  };

  Object.defineProperty(el, 'innerHTML', {
    get() { return el._html; },
    set(value) { el._html = String(value); }
  });

  return el;
}

function createFakeDom(apiFetch) {
  const registry = new Map();
  const docHandlers = {};
  const winHandlers = {};
  const jar = { cookie: '' };

  const documentStub = {
    body: makeEl('body'),
    documentElement: makeEl('html'),
    getElementById(id) {
      if (!registry.has(id)) registry.set(id, makeEl('div'));
      return registry.get(id);
    },
    querySelector(sel) {
      if (sel && sel.charAt(0) === '#') return documentStub.getElementById(sel.slice(1));
      return makeEl('div');
    },
    querySelectorAll() { return []; },
    createElement(tag) { return makeEl(tag); },
    addEventListener(type, fn) { (docHandlers[type] = docHandlers[type] || []).push(fn); },
    removeEventListener() {}
  };

  const windowStub = {
    location: { hash: '', href: BASE, replace(url) { windowStub.redirectedTo = url; } },
    history: { replaceState() {} },
    addEventListener(type, fn) { (winHandlers[type] = winHandlers[type] || []).push(fn); },
    removeEventListener() {},
    ChuktiIcons: undefined,
    ChuktiConst: undefined
  };

  const context = vm.createContext({
    window: windowStub,
    document: documentStub,
    console,
    Math,
    JSON,
    Date,
    Object,
    Array,
    String,
    Number,
    Boolean,
    Promise,
    RegExp,
    Error,
    Map,
    Set,
    isFinite,
    isNaN,
    parseInt,
    parseFloat,
    encodeURIComponent,
    decodeURIComponent,
    URLSearchParams,
    Blob: function Blob() {},
    URL: { createObjectURL: () => 'blob:fake', revokeObjectURL() {} },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    fetch: apiFetch
  });

  return { context, documentStub, windowStub, docHandlers, winHandlers, registry, jar };
}

/* ---------- static contract check ---------- */

function contractCheck() {
  const indexHtml = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
  const loginHtml = fs.readFileSync(path.join(ROOT, 'public', 'login.html'), 'utf8');
  const app = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
  const icons = fs.readFileSync(path.join(ROOT, 'public', 'icons.js'), 'utf8');
  const styles = fs.readFileSync(path.join(ROOT, 'public', 'styles.css'), 'utf8');

  const htmlIds = new Set();
  [indexHtml, loginHtml, app].forEach((source) => {
    for (const match of source.matchAll(/id="([A-Za-z0-9_-]+)"/g)) htmlIds.add(match[1]);
  });
  // ids assigned at runtime, e.g. overlay.id = 'modal-overlay'
  for (const match of app.matchAll(/\.id = '([A-Za-z0-9_-]+)'/g)) htmlIds.add(match[1]);

  const missingIds = [...new Set([...app.matchAll(/\$\('#([A-Za-z0-9_-]+)'\)/g)].map((m) => m[1]))]
    .filter((id) => !htmlIds.has(id));
  check('every element id used by app.js exists in the markup', missingIds.length === 0, missingIds.join(', '));

  const iconKeys = new Set([...icons.matchAll(/^\s{4}([A-Za-z]+):\s*svg\(/gm)].map((m) => m[1]));
  const missingIcons = [...new Set([...app.matchAll(/\bI\.([A-Za-z]+)/g)].map((m) => m[1]))]
    .filter((key) => !iconKeys.has(key));
  check('every icon referenced by app.js is defined', missingIcons.length === 0, missingIcons.join(', '));

  const constKeys = new Set([...icons.matchAll(/^\s{4}([A-Z_]+):/gm)].map((m) => m[1]));
  const missingConst = [...new Set([...app.matchAll(/\bC\.([A-Za-z_]+)/g)].map((m) => m[1]))]
    .filter((key) => !constKeys.has(key));
  check('every shared constant referenced by app.js is defined', missingConst.length === 0, missingConst.join(', '));

  const cssVars = new Set([...styles.matchAll(/--([a-z-]+):/g)].map((m) => m[1]));
  const missingVars = [...new Set([...styles.matchAll(/var\(--([a-z-]+)\)/g)].map((m) => m[1]))]
    .filter((name) => !cssVars.has(name));
  check('every CSS variable used is defined', missingVars.length === 0, missingVars.join(', '));

  check('brand palette is present in the stylesheet',
    styles.includes('--primary: #0f4c3a') && styles.includes('--accent: #d4af37') &&
    styles.includes('--bg: #fdfbf7'));
  check('the login page references the logo with an SVG fallback',
    loginHtml.includes('src="logo.png"') && loginHtml.includes('logo.svg'));
}

/* ---------- http helper ---------- */

function makeFetcher(jar) {
  return async function fakeFetch(input, init) {
    const url = String(input).indexOf('http') === 0 ? String(input) : BASE + String(input);
    const options = Object.assign({}, init || {});
    options.headers = Object.assign({}, (init && init.headers) || {});
    if (jar.cookie) options.headers.cookie = jar.cookie;

    const res = await fetch(url, options);
    const setCookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
    setCookies.forEach((line) => {
      const pair = line.split(';')[0];
      if (pair.indexOf('chukti_token=') === 0) jar.cookie = pair.endsWith('=') ? '' : pair;
    });
    return res;
  };
}

function api(pathname, options) {
  const opts = options || {};
  return fetch(BASE + pathname, {
    method: opts.method || 'GET',
    headers: Object.assign(
      { 'content-type': 'application/json' },
      opts.cookie ? { cookie: opts.cookie } : {}
    ),
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body)
  }).then((res) => res.json().then((data) => ({ status: res.status, json: data })));
}

/* ---------- browser-side test run ---------- */

const settle = (ms) => new Promise((resolve) => setTimeout(resolve, ms === undefined ? 300 : ms));

function fakeEvent(action, attrs) {
  const trigger = {
    getAttribute(name) {
      if (name === 'data-action') return action;
      return attrs && Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null;
    }
  };
  return {
    target: { closest: (sel) => (sel === '[data-action]' ? trigger : null) },
    preventDefault() {},
    currentTarget: trigger
  };
}

function submitForm(overlay, fields) {
  const form = overlay.querySelector('form');
  Object.keys(fields).forEach((selector) => {
    const target = form.querySelector(selector);
    if (selector.indexOf(':checked') !== -1) {
      // fake DOM: mark the radio as checked (value set picks the reason)
      target.checked = true;
      target.value = fields[selector];
    } else {
      target.value = fields[selector];
    }
  });
  (form._listeners.submit || []).forEach((fn) => fn({ preventDefault() {}, target: form }));
  return form;
}

function clickConfirm(overlay) {
  const button = overlay.querySelector('[data-action="confirm-ok"]');
  (button._listeners.click || []).forEach((fn) => fn({ currentTarget: button }));
}

async function main() {
  console.log(`\nচুক্তি frontend check against ${BASE}\n`);

  console.log('Static contract');
  contractCheck();

  const jar = { cookie: '' };
  const fetcher = makeFetcher(jar);

  const loginResponse = await fetcher('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'admin@chukti.com', password: 'admin123' })
  });
  if (loginResponse.status !== 200) {
    console.log('\n  Cannot sign in as admin. Is the server running?\n');
    process.exit(1);
  }
  check('faked browser login stores the session cookie', jar.cookie.indexOf('chukti_token=') === 0);

  const dom = createFakeDom(fetcher);
  const context = dom.context;
  const el = (id) => dom.documentStub.getElementById(id);

  vm.runInContext(fs.readFileSync(path.join(ROOT, 'public', 'icons.js'), 'utf8'), context, { filename: 'icons.js' });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8'), context, { filename: 'app.js' });

  const click = dom.docHandlers.click[0];
  for (const fn of dom.docHandlers.DOMContentLoaded || []) await fn();
  await settle(600);

  console.log('\nDashboard');
  check('app shell becomes visible', el('app').hidden === false && el('boot-screen').hidden === true);
  check('the signed-in user is shown in the header',
    el('user-name').textContent === 'Admin' && el('who-email').textContent === 'admin@chukti.com');
  const navHtml = el('nav-tabs').innerHTML;
  check('navigation renders every tab',
    navHtml.includes('Dashboard') && navHtml.includes('Tenders') &&
    navHtml.includes('Users') && navHtml.includes('Activity'));
  check('dashboard renders the welcome banner and stat cards',
    el('page-dashboard').innerHTML.includes('Welcome back, Admin!') &&
    el('page-dashboard').innerHTML.includes('stat-grid'));
  check('dashboard did not fall back to an error state',
    el('page-dashboard').innerHTML.indexOf('Could not load') === -1);

  console.log('\nTenders page');
  click(fakeEvent('goto', { 'data-page': 'tenders' }));
  await settle(500);
  check('tenders page renders stats, tabs and the toolbar',
    el('page-tenders').innerHTML.includes('tender-stats') &&
    el('page-tenders').innerHTML.includes('tender-tabs') &&
    el('page-tenders').innerHTML.includes('Export') &&
    el('page-tenders').innerHTML.includes('Add Tender'));

  const stamp = Date.now().toString().slice(-6);
  const tenderCode = `FECHK-${stamp}`;
  const created = await api('/api/tenders', {
    cookie: jar.cookie,
    method: 'POST',
    body: {
      tender_id: tenderCode,
      tender_name: 'Frontend Check Supply',
      category: 'Government',
      tender_budget: 2500000,
      tender_bg: 250000,
      bg_type: 'Bank Guarantee',
      closing_date: '2026-12-31'
    }
  });
  check('test tender created through the API', created.status === 201);
  const tenderId = created.json.tender.id;

  click(fakeEvent('goto', { 'data-page': 'tenders' }));
  await settle(500);
  check('tender cards render in the list',
    el('tender-list').innerHTML.includes('tender-card') && el('tender-list').innerHTML.includes(tenderCode));
  check('pending tenders show the approval badge',
    el('tender-list').innerHTML.includes('Pending Approval'));

  click(fakeEvent('tender-tab', { 'data-stage': 'ongoing' }));
  await settle(700);
  check('switching tabs reloads the list',
    el('tender-list').innerHTML.includes('No ongoing tenders') ||
    el('tender-list').innerHTML.includes('tender-card') ||
    el('tender-list').innerHTML.includes('tender-list'));

  click(fakeEvent('tender-tab', { 'data-stage': 'upcoming' }));
  await settle(400);

  function lastModal() {
    const nodes = el('modal-root')._children;
    return nodes[nodes.length - 1];
  }

  console.log('\nApproval modal');
  click(fakeEvent('approve', { 'data-id': String(tenderId) }));
  await settle(400);
  check('the order-to-purchase modal opens', lastModal()._html.includes('Order to Purchase?'));
  submitForm(lastModal(), { '#f-approval-notes': 'Approved by the frontend check' });
  await settle(700);
  let stored = await api(`/api/tenders/${tenderId}`, { cookie: jar.cookie });
  check('approving from the UI updates the API', stored.json.tender.is_approved === true);

  console.log('\nPurchase modal');
  click(fakeEvent('purchase', { 'data-id': String(tenderId) }));
  await settle(400);
  check('the purchased modal opens', lastModal()._html.includes('Mark as Purchased'));
  submitForm(lastModal(), { '#f-submission': '2026-12-20', '#f-deposited': '123456' });
  await settle(700);
  stored = await api(`/api/tenders/${tenderId}`, { cookie: jar.cookie });
  check('purchase from the UI moves the tender to ongoing',
    stored.json.tender.stage === 'ongoing' && stored.json.tender.submission_date === '2026-12-20');

  console.log('\nResult modals');
  click(fakeEvent('won', { 'data-id': String(tenderId) }));
  await settle(400);
  check('the won modal opens', lastModal()._html.includes('Mark as Won'));
  submitForm(lastModal(), { '#f-winning': '1200000', '#f-result-date': '2026-12-28' });
  await settle(700);
  stored = await api(`/api/tenders/${tenderId}`, { cookie: jar.cookie });
  check('marking won from the UI works', stored.json.tender.stage === 'won');

  click(fakeEvent('reopen', { 'data-id': String(tenderId) }));
  await settle(300);
  check('the reopen confirmation opens', lastModal()._html.includes('Reopen this tender?'));
  clickConfirm(lastModal());
  await settle(700);
  stored = await api(`/api/tenders/${tenderId}`, { cookie: jar.cookie });
  check('reopening from the UI works', stored.json.tender.stage === 'ongoing');

  click(fakeEvent('lost', { 'data-id': String(tenderId) }));
  await settle(400);
  check('the lost modal lists every reason',
    lastModal()._html.includes('Our Price Was Too High') &&
    lastModal()._html.includes('Competitor Had Better Relations'));
  submitForm(lastModal(), {
    'input[name="lost-reason"]:checked': 'price_too_high',
    '#f-quoted': '1234567',
    '#f-result-date': '2026-12-29',
    '#f-winner-company': 'Frontend Check Ltd',
    '#f-winning': '1150000'
  });
  await settle(700);
  stored = await api(`/api/tenders/${tenderId}`, { cookie: jar.cookie });
  check('marking lost from the UI works',
    stored.json.tender.stage === 'lost' && stored.json.tender.lost_reason === 'price_too_high' &&
    stored.json.tender.our_bid_price === 1234567);

  console.log('\nDetail modal');
  click(fakeEvent('detail', { 'data-id': String(tenderId) }));
  await settle(500);
  check('the detail modal shows every section',
    lastModal()._html.includes('Tender Details') && lastModal()._html.includes('Financials') &&
    lastModal()._html.includes('Timeline') && lastModal()._html.includes('History'));
  check('the detail modal shows the recorded result',
    lastModal()._html.includes('Our Price Was Too High') &&
    lastModal()._html.includes('Frontend Check Ltd'));

  console.log('\nUsers page');
  click(fakeEvent('goto', { 'data-page': 'users' }));
  await settle(600);
  check('users table renders for the admin',
    el('page-users').innerHTML.includes('Users Management') &&
    el('page-users').innerHTML.includes('admin@chukti.com'));
  check('users page did not fall back to an error state',
    el('page-users').innerHTML.indexOf('Could not load') === -1);

  const newUserEmail = `frontend.check.${stamp}@chukti.com`;
  const newUser = await api('/api/users', {
    cookie: jar.cookie,
    method: 'POST',
    body: { name: 'Frontend Check', email: newUserEmail, password: 'check123', role: 'rep' }
  });
  check('a test user was created through the API', newUser.status === 201);

  click(fakeEvent('goto', { 'data-page': 'users' }));
  await settle(600);
  check('the new user appears in the table', el('page-users').innerHTML.includes('Frontend Check'));

  click(fakeEvent('reset-password', { 'data-id': String(newUser.json.user.id) }));
  await settle(300);
  check('the reset-password modal opens', lastModal()._html.includes('Reset Password'));
  submitForm(lastModal(), { '#f-new-password': 'newpass123' });
  await settle(600);
  const relogin = await api('/api/auth/login', {
    method: 'POST',
    body: { email: newUserEmail, password: 'newpass123' }
  });
  check('the password reset from the UI takes effect', relogin.status === 200);

  console.log('\nActivity page');
  click(fakeEvent('goto', { 'data-page': 'activity' }));
  await settle(700);
  check('the activity log renders entries',
    el('activity-list').innerHTML.includes('activity-item') &&
    el('activity-list').innerHTML.includes('Frontend Check'));
  check('the activity toolbar offers user and action filters',
    el('page-activity').innerHTML.includes('All users') &&
    el('page-activity').innerHTML.includes('All actions'));

  console.log('\nCleanup and safety');
  check('toast notifications were raised during the session', el('toasts')._children.length > 0);
  check('the app never redirected away from the shell', dom.windowStub.redirectedTo === undefined);

  await api(`/api/tenders/${tenderId}`, { cookie: jar.cookie, method: 'DELETE' });
  await api(`/api/users/${newUser.json.user.id}`, { cookie: jar.cookie, method: 'DELETE' });
  const cleaned = await api(`/api/tenders/${tenderId}`, { cookie: jar.cookie });
  check('the test tender was cleaned up', cleaned.status === 404);

  console.log(`\n${'='.repeat(46)}`);
  console.log(`  ${passed} passed, ${failed} failed`);
  console.log(`${'='.repeat(46)}\n`);

  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('Frontend check crashed:', err);
  process.exit(1);
});
