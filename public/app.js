/* ==========================================================================
   চুক্তি (Chukti) — Tender Management System · frontend
   Vanilla JS, no build step. Talks to the REST API with cookie sessions.
   ========================================================================== */

(function () {
  'use strict';

  var I = window.ChuktiIcons;
  var C = window.ChuktiConst;

  /* ---------- state ---------- */

  var state = {
    user: null,
    page: 'dashboard',
    stats: null,
    pending: [],
    ready: [],
    tenders: [],
    users: [],
    activity: [],
    recent: [],
    filters: { search: '', category: 'all', sort: 'newest', stage: 'upcoming' },
    activityFilters: { user_id: '', action: '', from: '', to: '' },
    loading: false
  };

  /* ---------- helpers ---------- */

  function $(selector, root) {
    return (root || document).querySelector(selector);
  }

  function esc(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  var TAKA = '\u09F3';

  function money(value) {
    if (value === null || value === undefined || value === '') return '—';
    var num = Number(value);
    if (!isFinite(num)) return '—';
    return TAKA + ' ' + num.toLocaleString('en-IN', { maximumFractionDigits: 2 });
  }

  function moneyCompact(value) {
    if (value === null || value === undefined) return TAKA + ' 0';
    var num = Number(value) || 0;
    var abs = Math.abs(num);
    if (abs >= 10000000) return TAKA + ' ' + trim(num / 10000000) + ' Cr';
    if (abs >= 100000) return TAKA + ' ' + trim(num / 100000) + ' L';
    if (abs >= 1000) return TAKA + ' ' + trim(num / 1000) + 'K';
    return TAKA + ' ' + num.toLocaleString('en-IN');
  }

  function trim(num) {
    var rounded = Math.round(num * 100) / 100;
    return String(rounded);
  }

  function dateLabel(value) {
    if (!value) return '—';
    var date = new Date(String(value).length <= 10 ? value + 'T00:00:00' : value);
    if (isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function dateTimeLabel(value) {
    if (!value) return '—';
    var date = new Date(value);
    if (isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) +
      ', ' + date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }

  function relative(value) {
    if (!value) return '';
    var then = new Date(value).getTime();
    if (isNaN(then)) return '';
    var diff = Date.now() - then;
    var mins = Math.round(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + (mins === 1 ? ' minute ago' : ' minutes ago');
    var hours = Math.round(mins / 60);
    if (hours < 24) return hours + (hours === 1 ? ' hour ago' : ' hours ago');
    var days = Math.round(hours / 24);
    if (days === 1) return 'yesterday';
    if (days < 30) return days + ' days ago';
    return dateLabel(value);
  }

  function daysPill(days) {
    if (days === null || days === undefined) return '';
    if (days < 0) return '<span class="pill urgent">' + Math.abs(days) + ' days overdue</span>';
    if (days === 0) return '<span class="pill urgent">closes today</span>';
    if (days === 1) return '<span class="pill urgent">1 day left</span>';
    if (days <= 3) return '<span class="pill urgent">' + days + ' days left</span>';
    if (days <= 7) return '<span class="pill soon">' + days + ' days left</span>';
    return '<span class="pill">' + days + ' days left</span>';
  }

  function initials(name) {
    var parts = String(name || '?').trim().split(/\s+/);
    if (!parts.length) return '?';
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }

  function toast(kind, title, text) {
    var icons = { success: '✅', error: '⚠️', info: 'ℹ️' };
    var el = document.createElement('div');
    el.className = 'toast ' + (kind || 'info');
    el.innerHTML = '<span class="t-icon">' + (icons[kind] || 'ℹ️') + '</span>' +
      '<div><strong>' + esc(title) + '</strong>' + (text ? '<span>' + esc(text) + '</span>' : '') + '</div>';
    $('#toasts').appendChild(el);
    setTimeout(function () {
      el.style.transition = 'opacity .25s ease';
      el.style.opacity = '0';
      setTimeout(function () { el.remove(); }, 260);
    }, kind === 'error' ? 5200 : 3600);
  }

  function debounce(fn, wait) {
    var timer = null;
    return function () {
      var args = arguments;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(null, args); }, wait);
    };
  }

  function skeletonList(count) {
    var out = '<div class="loading-block">';
    for (var i = 0; i < (count || 3); i++) out += '<div class="skeleton"></div>';
    return out + '</div>';
  }

  function emptyState(icon, title, text) {
    return '<div class="empty"><div class="big">' + icon + '</div><h4>' + esc(title) + '</h4>' +
      '<p>' + esc(text) + '</p></div>';
  }

  /* ---------- api ---------- */

  function api(path, options) {
    var opts = options || {};
    var init = {
      method: opts.method || 'GET',
      credentials: 'same-origin',
      headers: {}
    };

    if (opts.body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(opts.body);
    }

    return fetch('/api' + path, init).then(function (res) {
      if (res.status === 401) {
        window.location.replace('/login.html');
        throw new Error('Your session has expired.');
      }
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) throw new Error(data.error || 'Request failed (' + res.status + ')');
        return data;
      });
    });
  }

  /* ---------- permissions ---------- */

  function perms() {
    var user = state.user || { role: 'rep' };
    var role = user.role;
    return {
      role: role,
      isAdmin: role === 'admin',
      isManager: role === 'manager',
      isRep: role === 'rep',
      canCreate: role === 'admin' || role === 'manager',
      canReview: role === 'admin' || role === 'manager',
      canDelete: role === 'admin',
      canViewUsers: role === 'admin',
      canEdit: function (tender) {
        if (!tender) return false;
        if (role === 'admin') return true;
        if (role === 'manager') return tender.created_by === user.id;
        return false;
      }
    };
  }

  /* ---------- shell ---------- */

  function renderShell() {
    var user = state.user;
    var p = perms();

    $('#user-avatar').textContent = initials(user.name);
    $('#user-name').textContent = user.name;
    $('#user-role').textContent = (C.ROLE_META[user.role] || {}).label || user.role;
    $('#who-name').textContent = user.name;
    $('#who-email').textContent = user.email;

    var tabs = [
      { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
      { id: 'tenders', label: 'Tenders', icon: 'tenders' }
    ];
    if (p.canViewUsers) tabs.push({ id: 'users', label: 'Users', icon: 'users' });
    tabs.push({ id: 'activity', label: 'Activity', icon: 'activity' });

    $('#nav-tabs').innerHTML = tabs
      .map(function (tab) {
        var count = '';
        if (tab.id === 'tenders' && state.stats && p.canReview && state.stats.upcoming.pending) {
          count = '<span class="count">' + state.stats.upcoming.pending + '</span>';
        }
        return '<button class="nav-tab' + (state.page === tab.id ? ' active' : '') +
          '" data-action="goto" data-page="' + tab.id + '" data-nav="' + tab.id + '">' +
          I[tab.icon] + '<span>' + tab.label + '</span>' + count + '</button>';
      })
      .join('');

    $('#app').hidden = false;
    $('#boot-screen').hidden = true;
    refreshBell();
  }

  function refreshBell() {
    var p = perms();
    var pending = state.stats ? state.stats.upcoming.pending : 0;
    var bell = $('#bell-btn');
    var badge = $('#bell-count');

    if (!p.canReview || !pending) {
      bell.hidden = true;
      return;
    }
    bell.hidden = false;
    badge.hidden = false;
    badge.textContent = pending;
  }

  function setPage(page, options) {
    var opts = options || {};

    var p = perms();
    if (page === 'users' && !p.canViewUsers) page = 'dashboard';
    state.page = page;

    ['dashboard', 'tenders', 'users', 'activity'].forEach(function (name) {
      var section = $('#page-' + name);
      if (section) section.hidden = name !== page;
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-nav]'), function (el) {
      el.classList.toggle('active', el.getAttribute('data-nav') === page);
    });

    if (window.location.hash !== '#' + page && !opts.skipHash) {
      window.history.replaceState(null, '', '#' + page);
    }
    closeUserMenu();

    if (page === 'dashboard') return loadDashboard();
    if (page === 'tenders') return loadTenders();
    if (page === 'users') return loadUsers();
    if (page === 'activity') return loadActivity();
  }

  function closeUserMenu() {
    var dropdown = $('#user-dropdown');
    if (dropdown) dropdown.classList.remove('open');
  }

  /* ---------- boot ---------- */

  function boot() {
    return api('/auth/me')
      .then(function (data) {
        state.user = data.user;
        renderShell();
        var hash = (window.location.hash || '').replace('#', '');
        var start = ['dashboard', 'tenders', 'users', 'activity'].indexOf(hash) >= 0 ? hash : 'dashboard';
        return setPage(start, { skipHash: false });
      })
      .catch(function (err) {
        console.error('[chukti] boot failed:', err);
      });
  }

  /* ---------- shared view pieces ---------- */

  function statCards(stats) {
    var s = stats || { upcoming: {}, ongoing: {}, won: {}, lost: {} };
    function card(key, emoji, label, bucket, foot) {
      return '<div class="stat-card ' + key + '">' +
        '<div class="stat-label"><span>' + emoji + '</span>' + label + '</div>' +
        '<div class="stat-value">' + (bucket.count || 0) + '</div>' +
        '<div class="stat-amount">' + moneyCompact(bucket.amount || 0) + '</div>' +
        '<div class="stat-foot">' + (foot || '') + '</div>' +
        '</div>';
    }

    var pendingFoot = s.upcoming.pending
      ? '<span class="badge badge-amber">Pending: ' + s.upcoming.pending + '</span>'
      : '<span class="badge badge-green">All approved</span>';

    return '<div class="stat-grid">' +
      card('upcoming', '📅', 'Upcoming', s.upcoming, pendingFoot) +
      card('ongoing', '🔄', 'Ongoing', s.ongoing, '<span class="pill">' + (s.ongoing.count || 0) + ' in progress</span>') +
      card('won', '✅', 'Won', s.won, '<span class="badge badge-green">' + (s.won.count || 0) + ' results</span>') +
      card('lost', '❌', 'Lost', s.lost, '<span class="badge badge-red">' + (s.lost.count || 0) + ' results</span>') +
      '</div>';
  }

  function activityItem(row) {
    var meta = C.ACTION_META[row.action] || { label: row.action, icon: '•' };
    var roleMeta = C.ROLE_META[row.user_role] || {};
    return '<div class="activity-item">' +
      '<div class="activity-icon">' + meta.icon + '</div>' +
      '<div class="activity-body">' +
      '<div class="activity-who"><strong>' + esc(row.user_name || 'System') + '</strong>' +
      (row.user_role ? '<span class="badge ' + (roleMeta.badge || 'badge-gray') + '">' +
        esc(roleMeta.label || row.user_role) + '</span>' : '') +
      '<time title="' + esc(dateTimeLabel(row.created_at)) + '">' + esc(relative(row.created_at)) + '</time></div>' +
      '<div class="activity-text">' + meta.icon + ' ' + esc(row.details || meta.label) +
      (row.tender_code && String(row.details || '').indexOf(row.tender_code) === -1
        ? ' · <span class="hl">' + esc(row.tender_code) + '</span>' : '') + '</div>' +
      '</div></div>';
  }

  /* ---------- dashboard ---------- */

  function loadDashboard() {
    var p = perms();
    var box = $('#page-dashboard');
    box.innerHTML = '<div class="page-head"><div><h2 class="page-title">Welcome back, ' +
      esc(state.user.name.split(' ')[0]) + '! 👋</h2>' +
      '<div class="page-sub">Here is your tender overview.</div></div></div>' + skeletonList(4);

    var requests = [api('/tenders/stats'), api('/activity/recent')];
    requests.push(p.canReview
      ? api('/tenders?stage=upcoming&approval=pending')
      : api('/tenders?stage=upcoming&approval=approved'));

    return Promise.all(requests)
      .then(function (results) {
        state.stats = results[0].stats;
        state.recent = results[1].activity || [];
        if (p.canReview) state.pending = results[2].tenders || [];
        else state.ready = results[2].tenders || [];

        renderShell();
        box.innerHTML = renderDashboard();
      })
      .catch(function (err) {
        box.innerHTML = emptyState('⚠️', 'Could not load the dashboard', err.message);
      });
  }

  /* ---------- dashboard view ---------- */

  function dashboardPanel() {
    var p = perms();
    var rows = p.canReview ? state.pending : state.ready;
    var title = p.canReview ? '⚠️ Pending Approvals' : '🛒 Ready to Purchase';

    var body = rows.length
      ? rows.map(function (t) {
          return '<div class="activity-item"><div class="activity-icon">📋</div>' +
            '<div class="activity-body">' +
            '<div class="activity-who"><strong>' + esc(t.tender_id) + '</strong>' +
            (t.is_approved ? '<span class="badge badge-green">Approved</span>'
              : '<span class="badge badge-amber">Pending</span>') + '</div>' +
            '<div class="activity-text">' + esc(t.tender_name) + '</div>' +
            '<div class="activity-text">Budget: <strong>' + money(t.tender_budget) + '</strong>' +
            (t.closing_date ? ' · closing ' + esc(dateLabel(t.closing_date)) : '') + '</div>' +
            '<div class="flex gap-8 wrap mt-16">' +
            (p.canReview && !t.is_approved
              ? '<button class="btn btn-primary btn-sm" data-action="approve" data-id="' + t.id + '">' +
                I.check + ' Order to Purchase</button>'
              : '<button class="btn btn-primary btn-sm" data-action="purchase" data-id="' + t.id + '">' +
                I.cart + ' Purchased</button>') +
            '<button class="btn btn-ghost btn-sm" data-action="detail" data-id="' + t.id + '">' +
            I.eye + ' View</button>' +
            '</div></div></div>';
        }).join('')
      : emptyState('✨',
          p.canReview ? 'Nothing waiting for approval' : 'Nothing to purchase right now',
          p.canReview ? 'Tenders created by your team will show up here.'
            : 'Approved tenders that you can purchase will show up here.');

    return '<div class="card"><div class="card-head"><h3>' + title +
      (rows.length ? ' (' + rows.length + ')' : '') + '</h3>' +
      '<button class="btn btn-ghost btn-sm" data-action="goto" data-page="tenders">See all</button>' +
      '</div><div class="card-body">' + body + '</div></div>';
  }

  function closingSoonPanel() {
    var closing = (state.stats && state.stats.closing_soon) || [];
    var body = closing.length
      ? '<div class="activity-list">' + closing.map(function (t) {
          return '<div class="activity-item"><div class="activity-icon">⏳</div>' +
            '<div class="activity-body"><div class="activity-who"><strong>' + esc(t.tender_id) + '</strong>' +
            daysPill(t.days_left) + '</div>' +
            '<div class="activity-text">' + esc(t.tender_name) + ' · closing ' +
            esc(dateLabel(t.closing_date)) + '</div></div>' +
            '<button class="btn btn-ghost btn-sm" data-action="detail" data-id="' + t.id + '">View</button>' +
            '</div>';
        }).join('') + '</div>'
      : '<p class="muted tiny">No tenders closing in the next 7 days.</p>';

    return '<div class="card mt-16"><div class="card-head"><h3>📅 Closing Soon</h3>' +
      '<span class="sub">next 7 days</span></div><div class="card-body">' + body + '</div></div>';
  }

  function renderDashboard() {
    var head = '<div class="page-head"><div><h2 class="page-title">Welcome back, ' +
      esc(state.user.name.split(' ')[0]) + '! 👋</h2>' +
      '<div class="page-sub">Here is your tender overview.</div></div>' +
      '<button class="btn btn-secondary" data-action="refresh">' + I.refresh + ' Refresh</button></div>';

    return head + statCards(state.stats) +
      '<div class="two-col">' + dashboardPanel() +
      '<div class="card"><div class="card-head"><h3>📜 Recent Activity</h3>' +
      '<button class="btn btn-ghost btn-sm" data-action="goto" data-page="activity">Full log</button></div>' +
      '<div class="card-body"><div class="activity-list">' +
      (state.recent.length ? state.recent.map(activityItem).join('')
        : '<p class="muted tiny">No activity yet.</p>') +
      '</div></div></div></div>' + closingSoonPanel();
  }

  /* ---------- tenders page ---------- */

  var SORT_OPTIONS = [
    { value: 'newest', label: 'Newest first', sort: 'created', order: 'desc' },
    { value: 'closing', label: 'Closing date', sort: 'closing', order: 'asc' },
    { value: 'budget', label: 'Budget (high → low)', sort: 'budget', order: 'desc' },
    { value: 'name', label: 'Name (A → Z)', sort: 'name', order: 'asc' }
  ];

  function selectOptions(list, selected, allLabel) {
    var html = allLabel ? '<option value="all">' + esc(allLabel) + '</option>' : '';
    return html + list.map(function (item) {
      var value = typeof item === 'string' ? item : item.value;
      var label = typeof item === 'string' ? item : item.label;
      return '<option value="' + esc(value) + '"' + (String(value) === String(selected) ? ' selected' : '') +
        '>' + esc(label) + '</option>';
    }).join('');
  }

  function tenderTabCount(stage) {
    if (!state.stats || !state.stats[stage]) return 0;
    return state.stats[stage].count || 0;
  }

  function tenderTabsHTML() {
    return ['upcoming', 'ongoing', 'won', 'lost'].map(function (stage) {
      var meta = C.STAGE_META[stage];
      return '<button class="tab' + (state.filters.stage === stage ? ' active' : '') +
        '" data-action="tender-tab" data-stage="' + stage + '">' +
        meta.icon + ' ' + meta.label + ' <span class="count">' + tenderTabCount(stage) + '</span></button>';
    }).join('');
  }

  function tenderChrome() {
    var p = perms();
    var head = '<div class="page-head"><div><h2 class="page-title">📋 Tenders</h2>' +
      '<div class="page-sub">' + (p.isRep
        ? 'Approved tenders you can purchase and follow up.'
        : 'Manage the full tender lifecycle in one place.') + '</div></div>' +
      (p.canCreate
        ? '<button class="btn btn-primary" data-action="add-tender">' + I.plus + ' Add Tender</button>'
        : '') + '</div>';

    var toolbar = '<div class="toolbar">' +
      '<div class="search">' + I.search +
      '<input type="search" id="tender-search" placeholder="Search by ID, name, category or winner…" value="' +
      esc(state.filters.search) + '" />' +
      '</div>' +
      '<select id="tender-category" title="Category">' +
      selectOptions(C.CATEGORIES, state.filters.category, 'All categories') + '</select>' +
      '<select id="tender-sort" title="Sort">' +
      selectOptions(SORT_OPTIONS.map(function (s) { return { value: s.value, label: s.label }; }),
        state.filters.sort, '') + '</select>' +
      '<button class="btn btn-secondary" data-action="export">' + I.download + ' Export</button>' +
      '</div>';

    return head + '<div id="tender-stats">' + statCards(state.stats) + '</div>' +
      '<div class="tabs" id="tender-tabs">' + tenderTabsHTML() + '</div>' +
      toolbar + '<div id="tender-list"></div>';
  }

  function loadTenders(options) {
    var opts = options || {};
    var box = $('#page-tenders');

    if (!opts.keepChrome || !$('#tender-list')) {
      box.innerHTML = tenderChrome();
    }

    var listBox = $('#tender-list');
    listBox.innerHTML = skeletonList(3);

    var params = new URLSearchParams();
    params.set('stage', state.filters.stage);
    if (state.filters.search) params.set('search', state.filters.search);
    if (state.filters.category && state.filters.category !== 'all') params.set('category', state.filters.category);

    var sortOption = SORT_OPTIONS.filter(function (s) { return s.value === state.filters.sort; })[0] || SORT_OPTIONS[0];
    params.set('sort', sortOption.sort);
    params.set('order', sortOption.order);

    return Promise.all([api('/tenders?' + params.toString()), api('/tenders/stats')])
      .then(function (results) {
        state.tenders = results[0].tenders || [];
        state.stats = results[1].stats;

        var statsBox = $('#tender-stats');
        var tabsBox = $('#tender-tabs');
        if (statsBox) statsBox.innerHTML = statCards(state.stats);
        if (tabsBox) tabsBox.innerHTML = tenderTabsHTML();
        renderShell();

        var p = perms();
        listBox.innerHTML = state.tenders.length
          ? '<div class="tender-list">' + state.tenders.map(tenderCard).join('') + '</div>'
          : emptyState('📭', 'No ' + state.filters.stage + ' tenders',
              p.canCreate ? 'Use “Add Tender” to create one, or adjust your filters.'
                : 'Approved tenders will appear here once an admin orders them to purchase.');
      })
      .catch(function (err) {
        listBox.innerHTML = emptyState('⚠️', 'Could not load tenders', err.message);
      });
  }

  /* ---------- tender card ---------- */

  function metaItem(key, value, cls) {
    return '<div class="meta"><span class="k">' + esc(key) + '</span>' +
      '<span class="v ' + (cls || '') + '">' + value + '</span></div>';
  }

  function stageBadges(t) {
    var out = '';
    if (t.stage === 'upcoming') {
      out += t.is_approved
        ? '<span class="badge badge-green">🟢 Approved</span>'
        : '<span class="badge badge-amber">🟡 Pending Approval</span>';
      if (t.is_approved && t.approved_by_name) {
        out += '<span class="badge badge-gray">✅ ' + esc(t.approved_by_name) +
          (t.approved_at ? ' · ' + esc(relative(t.approved_at)) : '') + '</span>';
      }
    } else if (t.stage === 'ongoing') {
      out += '<span class="badge badge-blue">🔄 Ongoing</span>';
    } else if (t.stage === 'won') {
      out += '<span class="badge badge-green">🏆 Won</span>';
    } else {
      out += '<span class="badge badge-red">❌ Lost</span>';
    }

    if (t.category) out += '<span class="badge badge-gold">' + esc(t.category) + '</span>';
    if (t.stage === 'upcoming' && t.days_left !== null && t.days_left !== undefined) {
      out += daysPill(t.days_left);
    }
    return out;
  }

  function stageMetas(t) {
    if (t.stage === 'upcoming') {
      return metaItem('Budget', money(t.tender_budget), 'money') +
        metaItem('Tender BG', money(t.tender_bg) + (t.bg_type ? ' · ' + esc(t.bg_type) : ''), 'money') +
        metaItem('Experience', esc(t.tender_experience || '—')) +
        metaItem('Closing date', esc(dateLabel(t.closing_date))) +
        metaItem('Created by', esc(t.created_by_name || '—'), 'muted');
    }

    if (t.stage === 'ongoing') {
      return metaItem('Budget', money(t.tender_budget), 'money') +
        metaItem('Submitted', esc(dateLabel(t.submission_date))) +
        metaItem('Deposited', money(t.deposited_amount), 'money') +
        metaItem('Purchased by', esc(t.purchased_by_name || '—') +
          (t.purchased_at ? ' · ' + esc(relative(t.purchased_at)) : ''), 'muted');
    }

    if (t.stage === 'won') {
      return metaItem('Winning price', money(t.winning_price), 'money') +
        metaItem('Our bid', money(t.our_bid_price), 'money') +
        metaItem('Result date', esc(dateLabel(t.result_date))) +
        metaItem('Refund', money(t.refund_amount), 'money') +
        metaItem('Refund date', esc(dateLabel(t.refund_date)));
    }

    return metaItem('Our quoted price', money(t.our_bid_price), 'money') +
      metaItem('Winning price', money(t.winning_price), 'money') +
      metaItem('Winner', esc(t.winner_company || '—')) +
      metaItem('Lost reason', esc((t.lost_reason_icon ? t.lost_reason_icon + ' ' : '') +
        (t.lost_reason_label || '—'))) +
      metaItem('Result date', esc(dateLabel(t.result_date)));
  }

  function stageActions(t, p) {
    var buttons = [];
    var edit = p.canEdit(t);
    var review = p.canReview;

    if (t.stage === 'upcoming') {
      if (t.is_approved) {
        buttons.push('<button class="btn btn-primary btn-sm" data-action="purchase" data-id="' + t.id + '">' +
          I.cart + ' Purchased</button>');
      } else if (review) {
        buttons.push('<button class="btn btn-primary btn-sm" data-action="approve" data-id="' + t.id + '">' +
          I.check + ' Order to Purchase</button>');
      }
      if (review && t.is_approved) {
        buttons.push('<button class="btn btn-ghost btn-sm" data-action="unapprove" data-id="' + t.id + '">' +
          '↩️ Withdraw</button>');
      }
    } else if (t.stage === 'ongoing') {
      buttons.push('<button class="btn btn-success btn-sm" data-action="won" data-id="' + t.id + '">' +
        I.trophy + ' Mark as Won</button>');
      buttons.push('<button class="btn btn-danger btn-sm" data-action="lost" data-id="' + t.id + '">' +
        I.close + ' Mark as Lost</button>');
    } else if (review) {
      buttons.push('<button class="btn btn-secondary btn-sm" data-action="reopen" data-id="' + t.id + '">' +
        I.refresh + ' Reopen</button>');
    }

    buttons.push('<button class="btn btn-ghost btn-sm" data-action="detail" data-id="' + t.id + '">' +
      I.eye + ' View</button>');

    if (edit && t.stage !== 'won' && t.stage !== 'lost') {
      buttons.push('<button class="btn btn-ghost btn-sm" data-action="edit-tender" data-id="' + t.id + '">' +
        I.edit + ' Edit</button>');
    }
    if (p.canDelete) {
      buttons.push('<button class="btn btn-danger-ghost btn-sm" data-action="delete-tender" data-id="' + t.id + '">' +
        I.trash + ' Delete</button>');
    }
    return buttons.join('');
  }

  function tenderCard(t) {
    var p = perms();
    var cls = 'tender-card ' + (t.stage === 'upcoming' ? (t.is_approved ? 'approved' : 'pending') : t.stage);

    return '<article class="' + cls + '">' +
      '<div class="tender-top"><div class="tender-title">' +
      '<span class="tender-code">' + esc(t.tender_id) + '</span>' +
      '<span class="tender-name">' + esc(t.tender_name) + '</span>' +
      '</div><div class="tender-meta">' + stageBadges(t) + '</div></div>' +
      '<div class="meta-grid">' + stageMetas(t) + '</div>' +
      (t.notes ? '<div class="notes-box mt-16">' + esc(t.notes) + '</div>' : '') +
      '<div class="tender-actions">' + stageActions(t, p) + '</div>' +
      '</article>';
  }

  /* ---------- csv export ---------- */

  var EXPORT_COLUMNS = [
    ['tender_id', 'Tender ID'], ['tender_name', 'Tender Name'], ['category', 'Category'],
    ['stage', 'Stage'], ['is_approved', 'Approved'], ['tender_budget', 'Budget'],
    ['tender_bg', 'Tender BG'], ['bg_type', 'BG Type'], ['tender_experience', 'Experience'],
    ['closing_date', 'Closing Date'], ['submission_date', 'Submission Date'],
    ['our_bid_price', 'Our Quoted Price'], ['deposited_amount', 'Deposited'],
    ['winning_price', 'Winning Price'], ['winner_company', 'Winner Company'],
    ['lost_reason_label', 'Lost Reason'], ['result_date', 'Result Date'],
    ['refund_amount', 'Refund Amount'], ['refund_date', 'Refund Date'],
    ['created_by_name', 'Created By'], ['created_at', 'Created At'], ['notes', 'Notes']
  ];

  function csvCell(value) {
    var text = value === null || value === undefined ? '' : String(value);
    return '"' + text.replace(/"/g, '""') + '"';
  }

  function exportCsv() {
    if (!state.tenders.length) {
      toast('info', 'Nothing to export', 'There are no tenders in this view.');
      return;
    }

    var lines = [EXPORT_COLUMNS.map(function (c) { return csvCell(c[1]); }).join(',')];
    state.tenders.forEach(function (t) {
      lines.push(EXPORT_COLUMNS.map(function (c) {
        var value = c[0] === 'is_approved' ? (t.is_approved ? 'Yes' : 'No') : t[c[0]];
        return csvCell(value);
      }).join(','));
    });

    var blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = 'chukti-tenders-' + state.filters.stage + '-' +
      new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast('success', 'Export ready', state.tenders.length + ' tenders exported to CSV.');
  }

  /* ---------- users page (admin) ---------- */

  function roleBadge(role) {
    var meta = C.ROLE_META[role] || { label: role, badge: 'badge-gray' };
    return '<span class="badge ' + meta.badge + '">' + esc(meta.label) + '</span>';
  }

  function loadUsers() {
    var box = $('#page-users');
    box.innerHTML = '<div class="page-head"><div><h2 class="page-title">👥 Users Management</h2>' +
      '<div class="page-sub">Create accounts and control who can do what.</div></div></div>' + skeletonList(4);

    return api('/users')
      .then(function (data) {
        state.users = data.users || [];
        box.innerHTML = renderUsers();
      })
      .catch(function (err) {
        box.innerHTML = emptyState('⚠️', 'Could not load users', err.message);
      });
  }

  function renderUsers() {
    var p = perms();
    var rows = state.users.map(function (u) {
      var isMe = state.user && u.id === state.user.id;
      var actions = '<button class="btn btn-ghost btn-sm" data-action="edit-user" data-id="' + u.id + '">' +
        I.edit + ' Edit</button>' +
        '<button class="btn btn-ghost btn-sm" data-action="reset-password" data-id="' + u.id + '">' +
        I.key + ' Reset Password</button>';

      if (!isMe) {
        actions += '<button class="btn btn-ghost btn-sm" data-action="toggle-user" data-id="' + u.id + '">' +
          (u.is_active ? '⏸️ Disable' : '▶️ Enable') + '</button>' +
          '<button class="btn btn-danger-ghost btn-sm" data-action="delete-user" data-id="' + u.id + '">' +
          I.trash + ' Delete</button>';
      }

      return '<tr>' +
        '<td><div class="cell-user"><span class="avatar">' + esc(initials(u.name)) + '</span>' +
        '<div><strong>' + esc(u.name) + (isMe ? ' <span class="tiny muted">(you)</span>' : '') + '</strong>' +
        '<small>' + esc(u.email) + '</small></div></div></td>' +
        '<td>' + roleBadge(u.role) + '</td>' +
        '<td>' + esc(u.phone || '—') + '</td>' +
        '<td>' + (u.is_active ? '<span class="badge badge-green">🟢 Active</span>'
          : '<span class="badge badge-red">🔴 Disabled</span>') + '</td>' +
        '<td>' + (u.tenders_created || 0) + '</td>' +
        '<td class="tiny muted">' + (u.last_login ? esc(relative(u.last_login)) : 'never') + '</td>' +
        '<td><div class="row-actions">' + actions + '</div></td>' +
        '</tr>';
    }).join('');

    return '<div class="page-head"><div><h2 class="page-title">👥 Users Management</h2>' +
      '<div class="page-sub">' + state.users.length + ' account' + (state.users.length === 1 ? '' : 's') +
      ' · admins run the system, managers create and approve, reps purchase and report results.</div></div>' +
      (p.canViewUsers
        ? '<button class="btn btn-primary" data-action="add-user">' + I.plus + ' Add User</button>' : '') +
      '</div>' +
      '<div class="card"><div class="table-wrap"><table>' +
      '<thead><tr><th>User</th><th>Role</th><th>Phone</th><th>Status</th><th>Tenders</th>' +
      '<th>Last login</th><th>Actions</th></tr></thead>' +
      '<tbody>' + (rows || '<tr><td colspan="7" class="muted">No users yet.</td></tr>') + '</tbody>' +
      '</table></div></div>';
  }

  /* ---------- activity page ---------- */

  function activityFiltersHTML() {
    var p = perms();
    var actions = Object.keys(C.ACTION_META).map(function (key) {
      return { value: key, label: C.ACTION_META[key].label };
    });

    return '<div class="toolbar">' +
      (p.canViewUsers
        ? '<select id="activity-user" title="User"><option value="">All users</option>' +
          selectOptions(state.users.map(function (u) { return { value: u.id, label: u.name }; }),
            state.activityFilters.user_id, '') + '</select>'
        : '') +
      '<select id="activity-action" title="Action"><option value="">All actions</option>' +
      selectOptions(actions, state.activityFilters.action, '') + '</select>' +
      '<input type="date" id="activity-from" value="' + esc(state.activityFilters.from) + '" title="From date" />' +
      '<input type="date" id="activity-to" value="' + esc(state.activityFilters.to) + '" title="To date" />' +
      '<button class="btn btn-ghost btn-sm" data-action="clear-activity-filters">' + I.x + ' Clear</button>' +
      '</div>';
  }

  function loadActivity(options) {
    var opts = options || {};
    var box = $('#page-activity');

    if (!opts.keepChrome || !$('#activity-list')) {
      box.innerHTML = '<div class="page-head"><div><h2 class="page-title">📜 Activity Log</h2>' +
        '<div class="page-sub">Every workflow step, who did it and when.</div></div></div>' +
        '<div id="activity-filters">' + activityFiltersHTML() + '</div>' +
        '<div id="activity-list"></div>';
    }

    var listBox = $('#activity-list');
    listBox.innerHTML = skeletonList(4);

    var params = new URLSearchParams();
    var f = state.activityFilters;
    if (f.user_id) params.set('user_id', f.user_id);
    if (f.action) params.set('action', f.action);
    if (f.from) params.set('from', f.from);
    if (f.to) params.set('to', f.to);

    var requests = [api('/activity' + (params.toString() ? '?' + params.toString() : ''))];
    requests.push(perms().canViewUsers ? api('/users') : Promise.resolve({ users: [] }));

    return Promise.all(requests)
      .then(function (results) {
        state.activity = results[0].activity || [];
        if (perms().canViewUsers && results[1].users) {
          state.users = results[1].users;
          var filtersBox = $('#activity-filters');
          if (filtersBox) filtersBox.innerHTML = activityFiltersHTML();
        }

        listBox.innerHTML = state.activity.length
          ? '<div class="card"><div class="card-body"><div class="activity-list">' +
            state.activity.map(activityItem).join('') + '</div></div></div>'
          : emptyState('🕓', 'No activity found', 'Try clearing the filters or widening the date range.');
      })
      .catch(function (err) {
        listBox.innerHTML = emptyState('⚠️', 'Could not load the activity log', err.message);
      });
  }

  /* ---------- modal infrastructure ---------- */

  var modalKeyHandler = null;

  function openModal(config) {
    closeModal();

    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'modal-overlay';

    var head = '<div class="modal-head"><div>' +
      '<h3>' + (config.icon ? config.icon + ' ' : '') + esc(config.title) + '</h3>' +
      (config.sub ? '<div class="sub">' + esc(config.sub) + '</div>' : '') + '</div>' +
      '<button class="modal-close" type="button" data-action="close-modal" aria-label="Close">✕</button></div>';

    var body = '<div class="modal-body">' + config.body + '</div>';
    var foot = '<div class="modal-foot">' + config.foot + '</div>';

    overlay.innerHTML = '<div class="modal' + (config.narrow ? ' narrow' : '') + '">' +
      head + (config.formId ? '<form id="' + config.formId + '" novalidate>' + body + foot + '</form>'
        : body + foot) + '</div>';

    document.getElementById('modal-root').appendChild(overlay);

    overlay.addEventListener('mousedown', function (event) {
      if (event.target === overlay) closeModal();
    });

    var form = overlay.querySelector('form');
    if (form && typeof config.onSubmit === 'function') {
      form.addEventListener('submit', function (event) {
        event.preventDefault();
        var button = form.querySelector('[data-submit]');
        config.onSubmit(form, button);
      });
    }

    if (typeof config.onOpen === 'function') config.onOpen(overlay);

    modalKeyHandler = function (event) {
      if (event.key === 'Escape') closeModal();
    };
    document.addEventListener('keydown', modalKeyHandler);

    var firstField = overlay.querySelector('input, select, textarea');
    if (firstField) firstField.focus();

    return overlay;
  }

  function closeModal() {
    var overlay = $('#modal-overlay');
    if (overlay) overlay.remove();
    if (modalKeyHandler) {
      document.removeEventListener('keydown', modalKeyHandler);
      modalKeyHandler = null;
    }
  }

  function field(label, inputHtml, required, hint) {
    return '<div class="field"><label>' + esc(label) +
      (required ? ' <span class="req">*</span>' : '') + '</label>' + inputHtml +
      (hint ? '<span class="hint">' + esc(hint) + '</span>' : '') + '</div>';
  }

  function inputText(id, value, placeholder, type) {
    return '<input type="' + (type || 'text') + '" id="' + id + '" value="' + esc(value === null ||
      value === undefined ? '' : value) + '" placeholder="' + esc(placeholder || '') + '" />';
  }

  function inputDate(id, value) {
    return '<input type="date" id="' + id + '" value="' + esc(value || '') + '" />';
  }

  function inputNumber(id, value, placeholder) {
    return '<input type="number" min="0" step="0.01" id="' + id + '" value="' +
      esc(value === null || value === undefined ? '' : value) + '" placeholder="' + esc(placeholder || '0') + '" />';
  }

  function textarea(id, value, placeholder) {
    return '<textarea id="' + id + '" placeholder="' + esc(placeholder || '') + '">' +
      esc(value || '') + '</textarea>';
  }

  function tenderInfoBox(t) {
    return '<div class="info-box"><span class="code">' + esc(t.tender_id) + '</span> · ' +
      '<span class="name">' + esc(t.tender_name) + '</span>' +
      '<p>Budget: <strong>' + money(t.tender_budget) + '</strong>' +
      (t.closing_date ? ' · closing ' + esc(dateLabel(t.closing_date)) : '') + '</p></div>';
  }

  function readValue(form, id) {
    var el = form.querySelector('#' + id);
    if (!el) return undefined;
    var value = String(el.value || '').trim();
    return value === '' ? null : value;
  }

  function readNumber(form, id) {
    var value = readValue(form, id);
    if (value === null) return null;
    var num = Number(value.replace(/[,\s]/g, ''));
    return isFinite(num) ? num : null;
  }

  function submitState(button, busy, label) {
    if (!button) return;
    button.disabled = busy;
    button.innerHTML = busy ? '<span class="spinner"></span> Working…' : label;
  }

  /* generic yes/no dialog */
  function confirmModal(config) {
    openModal({
      narrow: true,
      title: config.title,
      icon: config.icon || '❓',
      sub: config.sub,
      body: config.body || '',
      foot: '<button class="btn btn-secondary" type="button" data-action="close-modal">Cancel</button>' +
        '<button class="btn ' + (config.confirmClass || 'btn-primary') + '" type="button" data-action="confirm-ok"' +
        ' data-submit>' + esc(config.confirmLabel || 'Confirm') + '</button>',
      onOpen: function (overlay) {
        overlay.querySelector('[data-action="confirm-ok"]').addEventListener('click', function (event) {
          var button = event.currentTarget;
          button.disabled = true;
          Promise.resolve(config.onConfirm())
            .then(function () { closeModal(); })
            .catch(function (err) {
              button.disabled = false;
              toast('error', 'Action failed', err.message);
            });
        });
      }
    });
  }

  /* ---------- tender modals ---------- */

  function refreshAfterChange() {
    if (state.page === 'tenders') return loadTenders({ keepChrome: true });
    if (state.page === 'activity') return loadActivity({ keepChrome: true });
    return loadDashboard();
  }

  function tenderFormModal(tender) {
    var editing = Boolean(tender);
    var t = tender || {};

    openModal({
      formId: 'tender-form',
      title: editing ? 'Edit Tender' : 'Add New Tender',
      icon: editing ? '✏️' : '📋',
      sub: editing ? t.tender_id : 'Fields marked with * are required',
      body:
        '<div class="grid-2">' +
        field('Tender ID', inputText('f-tender-id', t.tender_id, 'TDR-2026-001'), true) +
        field('Tender Name', inputText('f-tender-name', t.tender_name, 'Hospital Supply Equipment'), true) +
        '</div>' +
        '<div class="grid-2">' +
        field('Category', '<select id="f-category">' +
          selectOptions(C.CATEGORIES, t.category || '', 'Select category') + '</select>') +
        field('Experience Requirement', inputText('f-experience', t.tender_experience, '5 years')) +
        '</div>' +
        '<div class="grid-2">' +
        field('Tender Budget (' + TAKA + ')', inputNumber('f-budget', t.tender_budget, '5000000')) +
        field('Tender BG (' + TAKA + ')', inputNumber('f-bg', t.tender_bg, '500000')) +
        '</div>' +
        '<div class="grid-2">' +
        field('BG Type', '<select id="f-bg-type">' +
          selectOptions(C.BG_TYPES, t.bg_type || '', 'Select BG type') + '</select>') +
        field('Closing Date', inputDate('f-closing', t.closing_date), true) +
        '</div>' +
        field('Notes', textarea('f-notes', t.notes, 'Anything the team should know about this tender')),
      foot:
        '<button class="btn btn-secondary" type="button" data-action="close-modal">Cancel</button>' +
        '<button class="btn btn-primary" type="submit" data-submit>' +
        (editing ? 'Save Changes' : 'Add Tender') + '</button>',
      onSubmit: function (form, button) {
        var payload = {
          tender_id: readValue(form, 'f-tender-id'),
          tender_name: readValue(form, 'f-tender-name'),
          category: readValue(form, 'f-category'),
          tender_experience: readValue(form, 'f-experience'),
          tender_budget: readNumber(form, 'f-budget'),
          tender_bg: readNumber(form, 'f-bg'),
          bg_type: readValue(form, 'f-bg-type'),
          closing_date: readValue(form, 'f-closing'),
          notes: readValue(form, 'f-notes')
        };

        if (!payload.tender_id || !payload.tender_name) {
          toast('error', 'Missing details', 'Tender ID and tender name are required.');
          return;
        }

        submitState(button, true);
        var request = editing
          ? api('/tenders/' + t.id, { method: 'PUT', body: payload })
          : api('/tenders', { method: 'POST', body: payload });

        request.then(function () {
          closeModal();
          toast('success', editing ? 'Tender updated' : 'Tender created',
            payload.tender_id + ' · ' + payload.tender_name);
          return refreshAfterChange();
        }).catch(function (err) {
          submitState(button, false, editing ? 'Save Changes' : 'Add Tender');
          toast('error', 'Could not save the tender', err.message);
        });
      }
    });
  }

  function approveModal(t) {
    openModal({
      formId: 'approve-form',
      narrow: true,
      title: 'Order to Purchase?',
      icon: '✅',
      body: tenderInfoBox(t) +
        '<p class="tiny muted">Approve this tender so the team can see it and mark it as purchased.</p>' +
        field('Approval notes (optional)', textarea('f-approval-notes', '', 'e.g. go ahead, budget confirmed')),
      foot: '<button class="btn btn-secondary" type="button" data-action="close-modal">Cancel</button>' +
        '<button class="btn btn-primary" type="submit" data-submit>' + I.check + ' Approve</button>',
      onSubmit: function (form, button) {
        submitState(button, true);
        api('/tenders/' + t.id + '/approve', {
          method: 'POST',
          body: { approval_notes: readValue(form, 'f-approval-notes') }
        }).then(function () {
          closeModal();
          toast('success', 'Order to purchase placed', t.tender_id + ' is now visible to the team.');
          return refreshAfterChange();
        }).catch(function (err) {
          submitState(button, false, 'Approve');
          toast('error', 'Could not approve', err.message);
        });
      }
    });
  }

  function unapproveModal(t) {
    confirmModal({
      title: 'Withdraw approval?',
      icon: '↩️',
      confirmLabel: 'Withdraw approval',
      confirmClass: 'btn-danger',
      body: tenderInfoBox(t) +
        '<p class="tiny muted">The team will no longer see this tender until it is approved again.</p>',
      onConfirm: function () {
        return api('/tenders/' + t.id + '/unapprove', { method: 'POST' }).then(function () {
          toast('info', 'Approval withdrawn', t.tender_id + ' is back to pending.');
          return refreshAfterChange();
        });
      }
    });
  }

  function reopenModal(t) {
    confirmModal({
      title: 'Reopen this tender?',
      icon: '↻',
      confirmLabel: 'Reopen',
      body: tenderInfoBox(t) +
        '<p class="tiny muted">The tender moves back to <strong>Ongoing</strong> so the result can be recorded again. ' +
        'Existing result data is kept until a new result is saved.</p>',
      onConfirm: function () {
        return api('/tenders/' + t.id + '/reopen', { method: 'POST' }).then(function () {
          toast('success', 'Tender reopened', t.tender_id + ' is ongoing again.');
          return refreshAfterChange();
        });
      }
    });
  }

  function deleteTenderModal(t) {
    confirmModal({
      title: 'Delete this tender?',
      icon: '🗑️',
      confirmLabel: 'Delete tender',
      confirmClass: 'btn-danger',
      body: tenderInfoBox(t) +
        '<p class="tiny muted">This permanently removes the tender and its activity history. ' +
        'It cannot be undone.</p>',
      onConfirm: function () {
        return api('/tenders/' + t.id, { method: 'DELETE' }).then(function () {
          toast('success', 'Tender deleted', t.tender_id + ' was removed.');
          return refreshAfterChange();
        });
      }
    });
  }

  function todayIso() {
    return new Date().toISOString().slice(0, 10);
  }

  function purchaseModal(t) {
    openModal({
      formId: 'purchase-form',
      title: 'Mark as Purchased',
      icon: '🛒',
      sub: 'This moves the tender to Ongoing',
      body: tenderInfoBox(t) +
        '<div class="grid-2">' +
        field('Submission Date', inputDate('f-submission', t.submission_date || todayIso()), true) +
        field('Deposited Amount (' + TAKA + ')', inputNumber('f-deposited', t.deposited_amount)) +
        '</div>' +
        field('Notes', textarea('f-purchase-notes', t.purchase_notes, 'e.g. documents submitted at 11:00 AM')),
      foot: '<button class="btn btn-secondary" type="button" data-action="close-modal">Cancel</button>' +
        '<button class="btn btn-primary" type="submit" data-submit>' + I.cart + ' Move to Ongoing</button>',
      onSubmit: function (form, button) {
        var submissionDate = readValue(form, 'f-submission');
        if (!submissionDate) {
          toast('error', 'Submission date required', 'Enter the date we submitted.');
          return;
        }

        submitState(button, true);
        api('/tenders/' + t.id + '/purchase', {
          method: 'POST',
          body: {
            submission_date: submissionDate,
            deposited_amount: readNumber(form, 'f-deposited'),
            notes: readValue(form, 'f-purchase-notes')
          }
        }).then(function () {
          closeModal();
          toast('success', 'Moved to Ongoing', t.tender_id + ' is now ongoing.');
          return refreshAfterChange();
        }).catch(function (err) {
          submitState(button, false, 'Move to Ongoing');
          toast('error', 'Could not mark as purchased', err.message);
        });
      }
    });
  }

  function wonModal(t) {
    openModal({
      formId: 'won-form',
      title: 'Mark as Won',
      icon: '🏆',
      sub: t.tender_id + ' · ' + t.tender_name,
      body: tenderInfoBox(t) +
        '<div class="grid-2">' +
        field('Winning Price (' + TAKA + ')', inputNumber('f-winning', t.winning_price || t.our_bid_price), true) +
        field('Result Date', inputDate('f-result-date', t.result_date || todayIso()), true) +
        '</div>' +
        '<div class="grid-2">' +
        field('Refund Amount (' + TAKA + ')', inputNumber('f-refund', t.refund_amount || t.deposited_amount)) +
        field('Refund Date', inputDate('f-refund-date', t.refund_date)) +
        '</div>' +
        field('Notes', textarea('f-won-notes', t.won_notes, 'e.g. work order received')),
      foot: '<button class="btn btn-secondary" type="button" data-action="close-modal">Cancel</button>' +
        '<button class="btn btn-success" type="submit" data-submit>' + I.trophy + ' Mark as Won</button>',
      onSubmit: function (form, button) {
        var price = readNumber(form, 'f-winning');
        var resultDate = readValue(form, 'f-result-date');
        if (price === null || !resultDate) {
          toast('error', 'Missing details', 'Winning price and result date are required.');
          return;
        }

        submitState(button, true);
        api('/tenders/' + t.id + '/mark-won', {
          method: 'POST',
          body: {
            winning_price: price,
            result_date: resultDate,
            refund_amount: readNumber(form, 'f-refund'),
            refund_date: readValue(form, 'f-refund-date'),
            notes: readValue(form, 'f-won-notes')
          }
        }).then(function () {
          closeModal();
          toast('success', 'Marked as Won', t.tender_id + ' · ' + money(price));
          return refreshAfterChange();
        }).catch(function (err) {
          submitState(button, false, 'Mark as Won');
          toast('error', 'Could not mark as won', err.message);
        });
      }
    });
  }

  function lostModal(t) {
    var reasons = C.LOST_REASONS.map(function (reason) {
      return '<label class="radio-row" data-reason="' + esc(reason.value) + '">' +
        '<input type="radio" name="lost-reason" value="' + esc(reason.value) + '"' +
        (t.lost_reason === reason.value ? ' checked' : '') + ' />' +
        '<span>' + reason.icon + ' ' + esc(reason.label) + '</span></label>';
    }).join('');

    openModal({
      formId: 'lost-form',
      title: 'Mark as Lost',
      icon: '❌',
      sub: t.tender_id + ' · ' + t.tender_name,
      body: tenderInfoBox(t) +
        field('Lost Reason', '<div class="radio-list">' + reasons + '</div>', true) +
        '<div class="grid-2">' +
        field('Our Quoted Price (' + TAKA + ')', inputNumber('f-quoted', t.our_bid_price), true) +
        field('Winner Company (optional)', inputText('f-winner-company', t.winner_company, 'ABC Constructions')) +
        '</div>' +
        '<div class="grid-2">' +
        field('Winning Price (' + TAKA + ', optional)', inputNumber('f-winning', t.winning_price)) +
        field('Result Date', inputDate('f-result-date', t.result_date || todayIso()), true) +
        '</div>' +
        '<div class="grid-2">' +
        field('Refund Amount (' + TAKA + ')', inputNumber('f-refund', t.refund_amount || t.deposited_amount)) +
        field('Refund Date', inputDate('f-refund-date', t.refund_date)) +
        '</div>' +
        field('Notes', textarea('f-lost-notes', t.lost_notes, 'Anything learned from this loss')),
      foot: '<button class="btn btn-secondary" type="button" data-action="close-modal">Cancel</button>' +
        '<button class="btn btn-danger" type="submit" data-submit>' + I.close + ' Mark as Lost</button>',
      onOpen: function (overlay) {
        var rows = overlay.querySelectorAll('.radio-row');
        Array.prototype.forEach.call(rows, function (row) {
          if (row.querySelector('input').checked) row.classList.add('selected');
          row.addEventListener('click', function () {
            Array.prototype.forEach.call(rows, function (other) { other.classList.remove('selected'); });
            row.classList.add('selected');
            row.querySelector('input').checked = true;
          });
        });
      },
      onSubmit: function (form, button) {
        var selected = form.querySelector('input[name="lost-reason"]:checked');
        var resultDate = readValue(form, 'f-result-date');
        var quoted = readNumber(form, 'f-quoted');

        if (!selected) {
          toast('error', 'Lost reason required', 'Pick the reason this tender was lost.');
          return;
        }
        if (quoted === null) {
          toast('error', 'Quoted price required', 'Amra koto taka quote kore submission korsilam seta din.');
          return;
        }
        if (!resultDate) {
          toast('error', 'Result date required', 'Enter the date the result was published.');
          return;
        }

        submitState(button, true);
        api('/tenders/' + t.id + '/mark-lost', {
          method: 'POST',
          body: {
            lost_reason: selected.value,
            our_bid_price: quoted,
            winner_company: readValue(form, 'f-winner-company'),
            winning_price: readNumber(form, 'f-winning'),
            result_date: resultDate,
            refund_amount: readNumber(form, 'f-refund'),
            refund_date: readValue(form, 'f-refund-date'),
            notes: readValue(form, 'f-lost-notes')
          }
        }).then(function () {
          closeModal();
          toast('success', 'Marked as Lost', t.tender_id + ' · quoted ' + money(quoted));
          return refreshAfterChange();
        }).catch(function (err) {
          submitState(button, false, 'Mark as Lost');
          toast('error', 'Could not mark as lost', err.message);
        });
      }
    });
  }

  /* ---------- tender detail modal ---------- */

  function detailActions(t, p) {
    var buttons = [];
    if (t.stage === 'upcoming') {
      if (!t.is_approved && p.canReview) {
        buttons.push('<button class="btn btn-primary btn-sm" data-action="approve" data-id="' + t.id + '">' +
          I.check + ' Order to Purchase</button>');
      }
    } else if (t.stage === 'ongoing') {
      buttons.push('<button class="btn btn-success btn-sm" data-action="won" data-id="' + t.id + '">' +
        I.trophy + ' Mark as Won</button>');
      buttons.push('<button class="btn btn-danger btn-sm" data-action="lost" data-id="' + t.id + '">' +
        I.close + ' Mark as Lost</button>');
    } else if (p.canReview) {
      buttons.push('<button class="btn btn-secondary btn-sm" data-action="reopen" data-id="' + t.id + '">' +
        I.refresh + ' Reopen</button>');
    }
    return buttons.join('');
  }

  function detailModal(t, activity) {
    var p = perms();
    var stageMeta = C.STAGE_META[t.stage] || { label: t.stage, icon: '•' };

    var overview = metaItem('Tender ID', esc(t.tender_id)) +
      metaItem('Tender name', esc(t.tender_name)) +
      metaItem('Category', esc(t.category || '—')) +
      metaItem('Stage', stageMeta.icon + ' ' + esc(stageMeta.label)) +
      metaItem('Created by', esc(t.created_by_name || '—')) +
      metaItem('Created at', esc(dateTimeLabel(t.created_at)));

    var financials = metaItem('Tender budget', money(t.tender_budget), 'money') +
      metaItem('Tender BG', money(t.tender_bg), 'money') +
      metaItem('BG type', esc(t.bg_type || '—')) +
      metaItem('Experience required', esc(t.tender_experience || '—')) +
      metaItem('Our quoted price', money(t.our_bid_price), 'money') +
      metaItem('Deposited', money(t.deposited_amount), 'money');

    var timeline = metaItem('Closing date', esc(dateLabel(t.closing_date))) +
      metaItem('Submission date', esc(dateLabel(t.submission_date))) +
      metaItem('Result date', esc(dateLabel(t.result_date)));

    var workflow = metaItem('Approved', t.is_approved ? 'Yes — order to purchase' : 'No') +
      metaItem('Approved by', esc(t.approved_by_name || '—') +
        (t.approved_at ? ' · ' + esc(relative(t.approved_at)) : '')) +
      metaItem('Purchased by', esc(t.purchased_by_name || '—') +
        (t.purchased_at ? ' · ' + esc(relative(t.purchased_at)) : ''));

    var result = '';
    if (t.stage === 'won' || t.stage === 'lost') {
      result = '<div class="section-label">Result</div><div class="detail-grid">' +
        metaItem('Winning price', money(t.winning_price), 'money') +
        (t.stage === 'lost'
          ? metaItem('Winner company', esc(t.winner_company || '—')) +
            metaItem('Lost reason', esc((t.lost_reason_icon ? t.lost_reason_icon + ' ' : '') +
              (t.lost_reason_label || '—')))
          : '') +
        metaItem('Result date', esc(dateLabel(t.result_date))) +
        metaItem('Refund amount', money(t.refund_amount), 'money') +
        metaItem('Refund date', esc(dateLabel(t.refund_date))) +
        '</div>';
    }

    var noteParts = [];
    if (t.notes) noteParts.push(t.notes);
    if (t.approval_notes) noteParts.push('Approval: ' + t.approval_notes);
    if (t.purchase_notes) noteParts.push('Purchase: ' + t.purchase_notes);
    if (t.won_notes) noteParts.push('Won: ' + t.won_notes);
    if (t.lost_notes) noteParts.push('Lost: ' + t.lost_notes);

    openModal({
      title: 'Tender Details',
      icon: '📄',
      sub: t.tender_id + ' · ' + t.tender_name,
      body:
        '<div class="tender-meta" style="margin-bottom:16px">' + stageBadges(t) + '</div>' +
        '<div class="section-label">Overview</div><div class="detail-grid">' + overview + '</div>' +
        '<div class="section-label">Financials &amp; requirement</div><div class="detail-grid">' + financials + '</div>' +
        '<div class="section-label">Timeline</div><div class="detail-grid">' + timeline + '</div>' +
        '<div class="section-label">Workflow</div><div class="detail-grid">' + workflow + '</div>' +
        result +
        (noteParts.length
          ? '<div class="section-label">Notes</div><div class="notes-box">' + esc(noteParts.join('\n\n')) + '</div>'
          : '') +
        '<div class="section-label">History</div>' + detailHistory(activity),
      foot: '<button class="btn btn-secondary" type="button" data-action="close-modal">Close</button>' +
        detailActions(t, p)
    });
  }

  function detailHistory(activity) {
    if (!activity || !activity.length) {
      return '<div class="activity-list"><p class="muted tiny">No history yet.</p></div>';
    }
    return '<div class="activity-list">' + activity.map(function (row) {
      var meta = C.ACTION_META[row.action] || { label: row.action, icon: '•' };
      return '<div class="activity-item"><div class="activity-icon">' + meta.icon + '</div>' +
        '<div class="activity-body"><div class="activity-who"><strong>' + esc(row.user_name || 'System') +
        '</strong><time>' + esc(dateTimeLabel(row.created_at)) + '</time></div>' +
        '<div class="activity-text">' + esc(row.details || meta.label) + '</div></div></div>';
    }).join('') + '</div>';
  }

  /* ---------- action dispatcher ---------- */

  function runTenderAction(action, id) {
    if (action === 'add-tender') return tenderFormModal(null);

    return api('/tenders/' + id).then(function (data) {
      var t = data.tender;
      if (action === 'detail') return detailModal(t, data.activity);
      if (action === 'approve') return approveModal(t);
      if (action === 'unapprove') return unapproveModal(t);
      if (action === 'purchase') return purchaseModal(t);
      if (action === 'won') return wonModal(t);
      if (action === 'lost') return lostModal(t);
      if (action === 'reopen') return reopenModal(t);
      if (action === 'edit-tender') return tenderFormModal(t);
      if (action === 'delete-tender') return deleteTenderModal(t);
      return undefined;
    }).catch(function (err) {
      toast('error', 'Could not open the tender', err.message);
    });
  }

  /* ---------- user modals ---------- */

  function userFormModal(user) {
    var editing = Boolean(user);
    var u = user || {};

    openModal({
      formId: 'user-form',
      narrow: true,
      title: editing ? 'Edit User' : 'Add User',
      icon: editing ? '✏️' : '👤',
      sub: editing ? u.email : 'The user signs in with this email and password',
      body:
        field('Name', inputText('f-user-name', u.name, 'Rahul Sharma'), true) +
        field('Email', inputText('f-user-email', u.email, 'rahul@chukti.com', 'email'), true) +
        (editing ? '' : field('Temporary Password',
          inputText('f-user-password', '', 'At least 6 characters'), true,
          'Share it with the user and ask them to change it.')) +
        field('Role', '<select id="f-user-role">' +
          ['admin', 'manager', 'rep'].map(function (role) {
            return '<option value="' + role + '"' + (u.role === role ? ' selected' : '') + '>' +
              C.ROLE_META[role].label + '</option>';
          }).join('') + '</select>', true) +
        field('Phone (optional)', inputText('f-user-phone', u.phone, '01700000000')) +
        (editing ? '<label class="check"><input type="checkbox" id="f-user-active"' +
          (u.is_active ? ' checked' : '') + ' /> <span>Account is active</span></label>' : ''),
      foot: '<button class="btn btn-secondary" type="button" data-action="close-modal">Cancel</button>' +
        '<button class="btn btn-primary" type="submit" data-submit>' +
        (editing ? 'Save Changes' : 'Create User') + '</button>',
      onSubmit: function (form, button) {
        var payload = {
          name: readValue(form, 'f-user-name'),
          email: readValue(form, 'f-user-email'),
          role: readValue(form, 'f-user-role'),
          phone: readValue(form, 'f-user-phone')
        };

        if (!payload.name || !payload.email) {
          toast('error', 'Missing details', 'Name and email are required.');
          return;
        }

        var password = readValue(form, 'f-user-password');
        if (editing) {
          var activeBox = form.querySelector('#f-user-active');
          payload.is_active = activeBox ? activeBox.checked : true;
        } else {
          if (!password || password.length < 6) {
            toast('error', 'Password too short', 'Use at least 6 characters.');
            return;
          }
          payload.password = password;
        }

        submitState(button, true);
        var request = editing
          ? api('/users/' + u.id, { method: 'PUT', body: payload })
          : api('/users', { method: 'POST', body: payload });

        request.then(function () {
          closeModal();
          toast('success', editing ? 'User updated' : 'User created', payload.name + ' · ' + payload.email);
          if (editing && state.user && u.id === state.user.id) {
            return api('/auth/me').then(function (data) {
              state.user = data.user;
              renderShell();
              return loadUsers();
            });
          }
          return loadUsers();
        }).catch(function (err) {
          submitState(button, false, editing ? 'Save Changes' : 'Create User');
          toast('error', 'Could not save the user', err.message);
        });
      }
    });
  }

  function resetPasswordModal(user) {
    openModal({
      formId: 'reset-form',
      narrow: true,
      title: 'Reset Password',
      icon: '🔑',
      sub: user.name + ' · ' + user.email,
      body: field('New password', inputText('f-new-password', '', 'At least 6 characters'), true,
        'The user keeps the same email and role.'),
      foot: '<button class="btn btn-secondary" type="button" data-action="close-modal">Cancel</button>' +
        '<button class="btn btn-primary" type="submit" data-submit>' + I.key + ' Set Password</button>',
      onSubmit: function (form, button) {
        var password = readValue(form, 'f-new-password');
        if (!password || password.length < 6) {
          toast('error', 'Password too short', 'Use at least 6 characters.');
          return;
        }

        submitState(button, true);
        api('/users/' + user.id + '/reset-password', { method: 'POST', body: { password: password } })
          .then(function () {
            closeModal();
            toast('success', 'Password updated', 'Share the new password with ' + user.name + '.');
          })
          .catch(function (err) {
            submitState(button, false, 'Set Password');
            toast('error', 'Could not reset the password', err.message);
          });
      }
    });
  }

  function toggleUserActive(user) {
    api('/users/' + user.id, { method: 'PUT', body: { is_active: !user.is_active } })
      .then(function () {
        toast('success', user.is_active ? 'Account disabled' : 'Account enabled', user.name);
        return loadUsers();
      })
      .catch(function (err) {
        toast('error', 'Could not change the account', err.message);
      });
  }

  function deleteUserModal(user) {
    confirmModal({
      title: 'Delete this user?',
      icon: '🗑️',
      confirmLabel: 'Delete user',
      confirmClass: 'btn-danger',
      body: '<div class="info-box"><span class="name">' + esc(user.name) + '</span>' +
        '<p>' + esc(user.email) + ' · ' + esc((C.ROLE_META[user.role] || {}).label || user.role) + '</p></div>' +
        '<p class="tiny muted">Tenders created by this user are kept for history, but the account can no ' +
        'longer sign in. Consider disabling the account instead.</p>',
      onConfirm: function () {
        return api('/users/' + user.id, { method: 'DELETE' }).then(function () {
          toast('success', 'User deleted', user.name + ' was removed.');
          return loadUsers();
        });
      }
    });
  }

  /* ---------- events ---------- */

  var debouncedSearch = debounce(function () {
    var input = $('#tender-search');
    state.filters.search = input ? input.value.trim() : '';
    loadTenders({ keepChrome: true });
  }, 350);

  function logout() {
    api('/auth/logout', { method: 'POST' })
      .catch(function () { /* ignore */ })
      .then(function () { window.location.replace('/login.html'); });
  }

  document.addEventListener('click', function (event) {
    var trigger = event.target.closest ? event.target.closest('[data-action]') : null;

    if (!trigger) {
      if (!event.target.closest('#user-dropdown')) closeUserMenu();
      return;
    }

    var action = trigger.getAttribute('data-action');
    var id = trigger.getAttribute('data-id');
    var page = trigger.getAttribute('data-page');
    var found = null;

    function userById() {
      return state.users.filter(function (u) { return String(u.id) === String(id); })[0] || null;
    }

    switch (action) {
      case 'goto':
        setPage(page);
        break;
      case 'goto-pending':
        state.filters.stage = 'upcoming';
        setPage('tenders');
        if (state.stats && state.stats.upcoming.pending) {
          toast('info', state.stats.upcoming.pending + ' tender(s) awaiting approval',
            'Pending tenders show an amber stripe.');
        }
        break;
      case 'toggle-user-menu':
        event.preventDefault();
        $('#user-dropdown').classList.toggle('open');
        break;
      case 'logout':
        logout();
        break;
      case 'refresh':
        refreshAfterChange();
        toast('info', 'Refreshed', 'Latest data loaded.');
        break;
      case 'close-modal':
        closeModal();
        break;
      case 'tender-tab':
        state.filters.stage = trigger.getAttribute('data-stage');
        loadTenders({ keepChrome: true });
        break;
      case 'export':
        exportCsv();
        break;
      case 'clear-activity-filters':
        state.activityFilters = { user_id: '', action: '', from: '', to: '' };
        loadActivity();
        break;
      case 'add-user':
        userFormModal(null);
        break;
      case 'edit-user':
        found = userById();
        if (found) userFormModal(found);
        break;
      case 'reset-password':
        found = userById();
        if (found) resetPasswordModal(found);
        break;
      case 'toggle-user':
        found = userById();
        if (found) toggleUserActive(found);
        break;
      case 'delete-user':
        found = userById();
        if (found) deleteUserModal(found);
        break;
      default:
        if (['add-tender', 'detail', 'approve', 'unapprove', 'purchase', 'won', 'lost', 'reopen',
          'edit-tender', 'delete-tender'].indexOf(action) >= 0) {
          runTenderAction(action, id);
        }
        break;
    }
  });

  document.addEventListener('input', function (event) {
    if (event.target && event.target.id === 'tender-search') debouncedSearch();
  });

  document.addEventListener('change', function (event) {
    var id = event.target && event.target.id;
    if (!id) return;

    if (id === 'tender-category') {
      state.filters.category = event.target.value;
      loadTenders({ keepChrome: true });
    } else if (id === 'tender-sort') {
      state.filters.sort = event.target.value;
      loadTenders({ keepChrome: true });
    } else if (id === 'activity-user') {
      state.activityFilters.user_id = event.target.value;
      loadActivity({ keepChrome: true });
    } else if (id === 'activity-action') {
      state.activityFilters.action = event.target.value;
      loadActivity({ keepChrome: true });
    } else if (id === 'activity-from') {
      state.activityFilters.from = event.target.value;
      loadActivity({ keepChrome: true });
    } else if (id === 'activity-to') {
      state.activityFilters.to = event.target.value;
      loadActivity({ keepChrome: true });
    }
  });

  window.addEventListener('hashchange', function () {
    var page = (window.location.hash || '').replace('#', '');
    if (['dashboard', 'tenders', 'users', 'activity'].indexOf(page) >= 0 && page !== state.page) {
      setPage(page, { skipHash: true });
    }
  });

  document.addEventListener('DOMContentLoaded', boot);
})();

