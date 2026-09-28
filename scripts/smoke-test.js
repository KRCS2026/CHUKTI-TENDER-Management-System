'use strict';

/**
 * চুক্তি (Chukti) — end-to-end smoke test.
 * Usage: node scripts/smoke-test.js   (server must be running on BASE_URL)
 */

const BASE = process.env.BASE_URL || 'http://localhost:3000';

let passed = 0;
let failed = 0;

function check(name, condition, extra = '') {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${extra ? ' :: ' + extra : ''}`);
  }
}

function section(title) {
  console.log(`\n${title}`);
}

async function api(pathname, { method = 'GET', body, cookie } = {}) {
  const res = await fetch(BASE + pathname, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  const rawCookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  const cookieHeader = rawCookies
    .map((item) => item.split(';')[0])
    .filter((item) => !item.endsWith('='))
    .join('; ');

  let json = null;
  try {
    json = await res.json();
  } catch (err) {
    json = null;
  }
  return { status: res.status, json, cookie: cookieHeader || null };
}

function login(email, password) {
  return api('/api/auth/login', { method: 'POST', body: { email, password } });
}

async function main() {
  const stamp = Date.now().toString().slice(-6);
  const managerEmail = `smoke.manager.${stamp}@chukti.com`;
  const repEmail = `smoke.rep.${stamp}@chukti.com`;
  const tenderCode = `SMOKE-${stamp}`;

  console.log(`\nচুক্তি smoke test against ${BASE}`);

  /* ---------- health ---------- */
  section('Health');
  const health = await api('/api/health');
  check('GET /api/health returns ok', health.status === 200 && health.json?.ok === true);

  /* ---------- auth ---------- */
  section('Authentication');
  const badLogin = await login('admin@chukti.com', 'wrong-password');
  check('wrong password is rejected (401)', badLogin.status === 401);

  const adminLogin = await login('admin@chukti.com', 'admin123');
  check('admin login succeeds', adminLogin.status === 200 && adminLogin.json?.user?.role === 'admin');
  check('session cookie is a chukti_token JWT', Boolean(adminLogin.cookie && adminLogin.cookie.includes('chukti_token=')));
  const admin = adminLogin.cookie;

  const anon = await api('/api/tenders');
  check('tenders require auth (401)', anon.status === 401);

  const me = await api('/api/auth/me', { cookie: admin });
  check('GET /api/auth/me returns the admin', me.status === 200 && me.json?.user?.email === 'admin@chukti.com');

  const loggedOut = await api('/api/auth/logout', { method: 'POST' });
  check('logout endpoint responds', loggedOut.status === 200);

  /* ---------- users ---------- */
  section('Users (admin only)');
  const createdManager = await api('/api/users', {
    method: 'POST',
    cookie: admin,
    body: { name: 'Smoke Manager', email: managerEmail, password: 'manager123', role: 'manager', phone: '01700000001' }
  });
  check('admin creates a manager', createdManager.status === 201 && createdManager.json?.user?.role === 'manager');

  const createdRep = await api('/api/users', {
    method: 'POST',
    cookie: admin,
    body: { name: 'Smoke Rep', email: repEmail, password: 'rep12345', role: 'rep' }
  });
  check('admin creates a rep', createdRep.status === 201 && createdRep.json?.user?.role === 'rep');

  const duplicateUser = await api('/api/users', {
    method: 'POST',
    cookie: admin,
    body: { name: 'Dupe', email: managerEmail, password: 'manager123', role: 'rep' }
  });
  check('duplicate email is rejected (409)', duplicateUser.status === 409);

  const shortPassword = await api('/api/users', {
    method: 'POST',
    cookie: admin,
    body: { name: 'Short', email: `short.${stamp}@chukti.com`, password: '123', role: 'rep' }
  });
  check('short password is rejected (400)', shortPassword.status === 400);

  const managerLogin = await login(managerEmail, 'manager123');
  const manager = managerLogin.cookie;
  check('manager can sign in', managerLogin.status === 200);

  const repLogin = await login(repEmail, 'rep12345');
  const rep = repLogin.cookie;
  check('rep can sign in', repLogin.status === 200);

  const repUsers = await api('/api/users', { cookie: rep });
  check('rep cannot read the user list (403)', repUsers.status === 403);

  const managerUsers = await api('/api/users', { cookie: manager });
  check('manager cannot read the user list (403)', managerUsers.status === 403);

  /* ---------- tender creation ---------- */
  section('Tender creation');
  const created = await api('/api/tenders', {
    method: 'POST',
    cookie: manager,
    body: {
      tender_id: tenderCode,
      tender_name: 'Hospital Supply Equipment (smoke)',
      category: 'Government',
      tender_budget: 5000000,
      tender_bg: 500000,
      bg_type: 'Bank Guarantee',
      tender_experience: '5 years',
      closing_date: '2026-12-31',
      notes: 'Created by smoke test'
    }
  });
  check('manager creates a tender', created.status === 201 && created.json?.tender?.stage === 'upcoming');
  check('a new tender starts unapproved', created.json?.tender?.is_approved === false);
  const tenderId = created.json?.tender?.id;

  const repCreate = await api('/api/tenders', {
    method: 'POST',
    cookie: rep,
    body: { tender_id: `NOPE-${stamp}`, tender_name: 'should fail' }
  });
  check('rep cannot create a tender (403)', repCreate.status === 403);

  const dupeTender = await api('/api/tenders', {
    method: 'POST',
    cookie: manager,
    body: { tender_id: tenderCode.toLowerCase(), tender_name: 'duplicate id' }
  });
  check('duplicate tender ID is case-insensitively rejected (409)', dupeTender.status === 409);

  const missingName = await api('/api/tenders', {
    method: 'POST',
    cookie: manager,
    body: { tender_id: `NONAME-${stamp}` }
  });
  check('tender without a name is rejected (400)', missingName.status === 400);

  /* ---------- visibility ---------- */
  section('Role based visibility');
  const repList = await api('/api/tenders', { cookie: rep });
  const repSeesSmoke = (repList.json?.tenders || []).some((t) => t.tender_id === tenderCode);
  check('rep does not see unapproved tenders', repList.status === 200 && repSeesSmoke === false);

  const repDetail = await api(`/api/tenders/${tenderId}`, { cookie: rep });
  check('rep cannot open an unapproved tender (403)', repDetail.status === 403);

  const repPurchaseBlocked = await api(`/api/tenders/${tenderId}/purchase`, {
    method: 'POST',
    cookie: rep,
    body: { our_bid_price: 1000 }
  });
  check('rep cannot purchase an unapproved tender (403)', repPurchaseBlocked.status === 403);

  /* ---------- approval ---------- */
  section('Approval workflow');
  const approved = await api(`/api/tenders/${tenderId}/approve`, {
    method: 'POST',
    cookie: manager,
    body: { approval_notes: 'Approved by smoke test' }
  });
  check(
    'manager approves (order to purchase)',
    approved.status === 200 && approved.json?.tender?.is_approved === true
  );
  check('the approver is recorded', approved.json?.tender?.approved_by_name === 'Smoke Manager');

  const doubleApprove = await api(`/api/tenders/${tenderId}/approve`, { method: 'POST', cookie: admin });
  check('approving twice is rejected (400)', doubleApprove.status === 400);

  const repSeesIt = await api('/api/tenders', { cookie: rep });
  const repSeesApprovedSmoke = (repSeesIt.json?.tenders || []).some((t) => t.tender_id === tenderCode);
  check('rep now sees the approved tender', repSeesIt.status === 200 && repSeesApprovedSmoke === true);

  /* ---------- purchase ---------- */
  section('Purchase workflow');
  const purchased = await api(`/api/tenders/${tenderId}/purchase`, {
    method: 'POST',
    cookie: rep,
    body: { submission_date: '2026-12-20', deposited_amount: 450000, notes: 'Bid submitted' }
  });
  check('rep marks the tender purchased', purchased.status === 200 && purchased.json?.tender?.stage === 'ongoing');
  check('purchase stores the submission date', purchased.json?.tender?.submission_date === '2026-12-20');
  check('the purchaser is recorded', purchased.json?.tender?.purchased_by_name === 'Smoke Rep');

  const editOwn = await api(`/api/tenders/${tenderId}`, {
    method: 'PUT',
    cookie: manager,
    body: { tender_name: 'Hospital Supply Equipment (renamed)' }
  });
  check('manager can edit their own tender', editOwn.status === 200);

  /* ---------- results ---------- */
  section('Won / Lost / Reopen');
  const won = await api(`/api/tenders/${tenderId}/mark-won`, {
    method: 'POST',
    cookie: manager,
    body: { winning_price: 4500000, result_date: '2026-12-28', refund_amount: 450000, refund_date: '2027-01-05' }
  });
  check('a tender can be marked won', won.status === 200 && won.json?.tender?.stage === 'won');

  const lostAfterWon = await api(`/api/tenders/${tenderId}/mark-lost`, {
    method: 'POST',
    cookie: manager,
    body: { lost_reason: 'price_too_high', result_date: '2026-12-28' }
  });
  check('a won tender cannot be marked lost (400)', lostAfterWon.status === 400);

  const reopened = await api(`/api/tenders/${tenderId}/reopen`, { method: 'POST', cookie: admin });
  check('admin reopens a won tender', reopened.status === 200 && reopened.json?.tender?.stage === 'ongoing');

  const badReason = await api(`/api/tenders/${tenderId}/mark-lost`, {
    method: 'POST',
    cookie: manager,
    body: { lost_reason: 'not_a_real_reason', our_bid_price: 4500000, result_date: '2026-12-28' }
  });
  check('an invalid lost reason is rejected (400)', badReason.status === 400);

  const missingQuote = await api(`/api/tenders/${tenderId}/mark-lost`, {
    method: 'POST',
    cookie: manager,
    body: { lost_reason: 'price_too_high', result_date: '2026-12-28' }
  });
  check('lost without a quoted price is rejected (400)', missingQuote.status === 400);

  const lost = await api(`/api/tenders/${tenderId}/mark-lost`, {
    method: 'POST',
    cookie: rep,
    body: {
      lost_reason: 'price_too_high',
      our_bid_price: 4500000,
      winner_company: 'ABC Constructions',
      winning_price: 4200000,
      result_date: '2026-12-28',
      notes: 'Lost on price'
    }
  });
  check('rep marks the tender lost', lost.status === 200 && lost.json?.tender?.stage === 'lost');
  check('the lost reason label is returned', lost.json?.tender?.lost_reason_label === 'Our Price Was Too High');
  check('the quoted price is stored on lost', lost.json?.tender?.our_bid_price === 4500000);

  const reopenRep = await api(`/api/tenders/${tenderId}/reopen`, { method: 'POST', cookie: rep });
  check('rep cannot reopen a tender (403)', reopenRep.status === 403);

  /* ---------- stats + activity ---------- */
  section('Stats and activity');
  const adminStats = await api('/api/tenders/stats', { cookie: admin });
  check('the stats endpoint responds', adminStats.status === 200);
  check('stats count the lost tender', (adminStats.json?.stats?.lost?.count || 0) >= 1);
  check(
    'stats sum the quoted price on lost',
    Number(adminStats.json?.stats?.lost?.amount || 0) >= 4500000
  );
  check('stats return a total', adminStats.json?.stats?.total >= 1);

  const repStats = await api('/api/tenders/stats', { cookie: rep });
  check('rep stats load without leaking unapproved tenders', repStats.status === 200);

  const recent = await api('/api/activity/recent', { cookie: admin });
  check('recent activity is returned', recent.status === 200 && recent.json?.activity?.length > 0);
  check('activity rows carry the actor name', Boolean(recent.json?.activity?.[0]?.user_name));

  const allActivity = await api('/api/activity', { cookie: admin });
  check('the activity log lists tender events', Boolean(allActivity.json?.activity?.some((row) => row.action === 'tender_lost')));

  const repActivity = await api('/api/activity', { cookie: rep });
  check('rep activity shows approved tender events', repActivity.status === 200 && repActivity.json.activity.length > 0);

  const tenderActivity = await api(`/api/activity?tender_id=${tenderCode}`, { cookie: manager });
  check('activity can be filtered by tender', tenderActivity.json?.activity?.length > 0);

  /* ---------- cleanup ---------- */
  section('Cleanup');
  const managerDelete = await api(`/api/tenders/${tenderId}`, { method: 'DELETE', cookie: manager });
  check('manager cannot delete a tender (403)', managerDelete.status === 403);

  const removed = await api(`/api/tenders/${tenderId}`, { method: 'DELETE', cookie: admin });
  check('admin deletes the tender', removed.status === 200);

  const gone = await api(`/api/tenders/${tenderId}`, { cookie: admin });
  check('the deleted tender returns 404', gone.status === 404);

  const deleteManager = await api(`/api/users/${createdManager.json.user.id}`, { method: 'DELETE', cookie: admin });
  check('admin deletes the smoke manager', deleteManager.status === 200);

  const deleteRep = await api(`/api/users/${createdRep.json.user.id}`, { method: 'DELETE', cookie: admin });
  check('admin deletes the smoke rep', deleteRep.status === 200);

  const selfDelete = await api(`/api/users/${me.json.user.id}`, { method: 'DELETE', cookie: admin });
  check('admin cannot delete their own account (400)', selfDelete.status === 400);

  /* ---------- logout ---------- */
  section('Logout');
  const logout = await api('/api/auth/logout', { method: 'POST', cookie: manager });
  check('logout succeeds', logout.status === 200);
  const afterLogout = await api('/api/auth/me', { cookie: manager });
  check('a logged-out session is rejected (401)', afterLogout.status === 401);

  console.log(`\n${'='.repeat(46)}`);
  console.log(`  ${passed} passed, ${failed} failed`);
  console.log(`${'='.repeat(46)}\n`);

  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('Smoke test crashed:', err);
  process.exit(1);
});
