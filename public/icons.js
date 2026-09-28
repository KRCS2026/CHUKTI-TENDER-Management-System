/* চুক্তি (Chukti) — inline SVG icon set + shared UI constants.
   Loaded before app.js. Everything is plain ES5-compatible output. */

(function () {
  'use strict';

  function svg(paths) {
    return (
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths + '</svg>'
    );
  }

  window.ChuktiIcons = {
    dashboard: svg('<rect x="3" y="3" width="7" height="8" rx="2"/><rect x="14" y="3" width="7" height="5" rx="2"/><rect x="14" y="11" width="7" height="10" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/>'),
    tenders: svg('<path d="M14 3v5h5"/><path d="M19 8v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5Z"/><path d="M9 13h6"/><path d="M9 17h4"/>'),
    users: svg('<path d="M16 20v-1.5a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4V20"/><circle cx="9.5" cy="7" r="3.5"/><path d="M21 20v-1.5a4 4 0 0 0-3-3.87"/><path d="M16 3.6a4 4 0 0 1 0 7.3"/>'),
    activity: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 2"/>'),
    bell: svg('<path d="M18 8a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6"/><path d="M13.7 20a2 2 0 0 1-3.4 0"/>'),
    plus: svg('<path d="M12 5v14"/><path d="M5 12h14"/>'),
    search: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
    filter: svg('<path d="M4 5h16"/><path d="M7 12h10"/><path d="M10 19h4"/>'),
    download: svg('<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>'),
    edit: svg('<path d="M4 20h4l10-10a2.5 2.5 0 0 0-3.5-3.5L4.5 16.5 4 20Z"/><path d="m14.5 6.5 3 3"/>'),
    trash: svg('<path d="M4 7h16"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/>'),
    eye: svg('<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/>'),
    eyeOff: svg('<path d="M3 3l18 18"/><path d="M10.6 6.1A9.8 9.8 0 0 1 12 6c6 0 9.5 6 9.5 6a17 17 0 0 1-3.3 4"/><path d="M6.3 8.3A16.6 16.6 0 0 0 2.5 12S6 18 12 18a9.6 9.6 0 0 0 3.4-.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>'),
    check: svg('<circle cx="12" cy="12" r="9"/><path d="m8.5 12.5 2.4 2.4 4.6-5"/>'),
    close: svg('<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6"/><path d="m15 9-6 6"/>'),
    x: svg('<path d="M6 6l12 12"/><path d="M18 6 6 18"/>'),
    cart: svg('<circle cx="9" cy="20" r="1.6"/><circle cx="18" cy="20" r="1.6"/><path d="M3 4h2l2.4 10.4A2 2 0 0 0 9.4 16h8.2a2 2 0 0 0 2-1.6L21 7H6"/>'),
    trophy: svg('<path d="M8 4h8v5a4 4 0 0 1-8 0V4Z"/><path d="M16 5h3v2a3 3 0 0 1-3 3"/><path d="M8 5H5v2a3 3 0 0 0 3 3"/><path d="M12 13v4"/><path d="M9 21h6"/><path d="M10 17h4l1 4H9l1-4Z"/>'),
    refresh: svg('<path d="M20 11a8 8 0 0 0-13.7-5.2L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 13.7 5.2L20 16"/><path d="M20 20v-4h-4"/>'),
    calendar: svg('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4"/><path d="M16 3v4"/><path d="M3 10h18"/>'),
    money: svg('<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6 12h.01"/><path d="M18 12h.01"/>'),
    bank: svg('<path d="M3 10 12 4l9 6"/><path d="M5 10v9"/><path d="M19 10v9"/><path d="M9 10v9"/><path d="M15 10v9"/><path d="M3 21h18"/>'),
    doc: svg('<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/><path d="M10 13h6"/><path d="M10 17h4"/>'),
    clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 2"/>'),
    logout: svg('<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 8l-4 4 4 4"/><path d="M6 12h9"/>'),
    chevron: svg('<path d="m6 9 6 6 6-6"/>'),
    lock: svg('<rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>'),
    mail: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 7 8.5 6 8.5-6"/>'),
    key: svg('<circle cx="8" cy="14" r="4"/><path d="m11 12 8-8"/><path d="m16 7 2 2"/><path d="m14 9 2 2"/>'),
    shield: svg('<path d="M12 3l8 3v5.5c0 4.8-3.3 8.4-8 9.5-4.7-1.1-8-4.7-8-9.5V6l8-3Z"/><path d="m9 12 2 2 4-4"/>'),
    alert: svg('<path d="M12 4 3 19h18L12 4Z"/><path d="M12 10v4"/><path d="M12 17h.01"/>'),
    info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/>'),
    arrowRight: svg('<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>'),
    folder: svg('<path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/>'),
    ruler: svg('<rect x="3" y="8" width="18" height="8" rx="1.5"/><path d="M7.5 8v3"/><path d="M12 8v4"/><path d="M16.5 8v3"/>'),
    coins: svg('<circle cx="9" cy="9" r="5"/><path d="M15.9 5.4A5 5 0 0 1 15 15"/><path d="M6.5 13.9A5 5 0 0 0 15 15"/>'),
    refreshAlt: svg('<path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/>'),
    upload: svg('<path d="M12 20V8"/><path d="m7 12 5-5 5 5"/><path d="M5 4h14"/>'),
    hamburger: svg('<path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h16"/>')
  };

  /* Shared, non-security-critical UI lists (the API is the source of truth). */
  window.ChuktiConst = {
    CATEGORIES: [
      'Government',
      'Semi-Government',
      'Private',
      'Autonomous',
      'NGO / Development',
      'International',
      'Other'
    ],
    BG_TYPES: [
      'Bank Guarantee',
      'Pay Order',
      'Bank Draft',
      'Treasury Challan',
      'Insurance Guarantee',
      'No BG Required'
    ],
    LOST_REASONS: [
      { value: 'price_too_high', label: 'Our Price Was Too High', icon: '💰' },
      { value: 'price_too_low', label: 'Our Price Was Too Low', icon: '📉' },
      { value: 'experience_issue', label: 'Experience Requirement Not Met', icon: '📋' },
      { value: 'documentation_issue', label: 'Documentation Issue', icon: '📄' },
      { value: 'bg_issue', label: 'BG / Financial Issue', icon: '🏦' },
      { value: 'technical_issue', label: 'Technical Qualification Failed', icon: '⚙️' },
      { value: 'late_submission', label: 'Late Submission', icon: '⏰' },
      { value: 'cancelled', label: 'Tender Cancelled', icon: '🚫' },
      { value: 'competitor_relation', label: 'Competitor Had Better Relations', icon: '🤝' },
      { value: 'other', label: 'Other', icon: '📝' }
    ],
    STAGE_META: {
      upcoming: { label: 'Upcoming', icon: '📅' },
      ongoing: { label: 'Ongoing', icon: '🔄' },
      won: { label: 'Won', icon: '🏆' },
      lost: { label: 'Lost', icon: '❌' }
    },
    ROLE_META: {
      admin: { label: 'Admin', badge: 'badge-purple' },
      manager: { label: 'Manager', badge: 'badge-blue' },
      rep: { label: 'Rep', badge: 'badge-green' }
    },
    ACTION_META: {
      tender_created: { label: 'Tender Created', icon: '📋' },
      tender_updated: { label: 'Tender Updated', icon: '✏️' },
      tender_deleted: { label: 'Tender Deleted', icon: '🗑️' },
      tender_approved: { label: 'Order to Purchase', icon: '✅' },
      tender_unapproved: { label: 'Approval Withdrawn', icon: '↩️' },
      tender_purchased: { label: 'Purchased', icon: '🛒' },
      tender_won: { label: 'Won', icon: '🏆' },
      tender_lost: { label: 'Lost', icon: '❌' },
      tender_reopened: { label: 'Reopened', icon: '↻' },
      user_created: { label: 'User Created', icon: '👤' },
      user_updated: { label: 'User Updated', icon: '✏️' },
      user_deleted: { label: 'User Deleted', icon: '🗑️' },
      password_reset: { label: 'Password Reset', icon: '🔑' },
      login: { label: 'Signed In', icon: '🔓' },
      logout: { label: 'Signed Out', icon: '🔒' }
    }
  };
})();
