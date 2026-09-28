'use strict';

/** Shared domain constants (backend enforced, mirrored by the UI). */

const ROLES = ['admin', 'manager', 'rep'];

const ROLE_LABELS = {
  admin: 'Admin',
  manager: 'Manager',
  rep: 'Rep'
};

const STAGES = ['upcoming', 'ongoing', 'won', 'lost'];

const STAGE_LABELS = {
  upcoming: 'Upcoming',
  ongoing: 'Ongoing',
  won: 'Won',
  lost: 'Lost'
};

const CATEGORIES = [
  'Government',
  'Semi-Government',
  'Private',
  'Autonomous',
  'NGO / Development',
  'International',
  'Other'
];

const BG_TYPES = [
  'Bank Guarantee',
  'Pay Order',
  'Bank Draft',
  'Treasury Challan',
  'Insurance Guarantee',
  'No BG Required'
];

const LOST_REASONS = [
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
];

const LOST_REASON_MAP = LOST_REASONS.reduce((acc, item) => {
  acc[item.value] = item;
  return acc;
}, {});

/** Activity actions used in the ActivityLog table. */
const ACTIONS = {
  TENDER_CREATED: 'tender_created',
  TENDER_UPDATED: 'tender_updated',
  TENDER_DELETED: 'tender_deleted',
  TENDER_APPROVED: 'tender_approved',
  TENDER_UNAPPROVED: 'tender_unapproved',
  TENDER_PURCHASED: 'tender_purchased',
  TENDER_WON: 'tender_won',
  TENDER_LOST: 'tender_lost',
  TENDER_REOPENED: 'tender_reopened',
  USER_CREATED: 'user_created',
  USER_UPDATED: 'user_updated',
  USER_DELETED: 'user_deleted',
  PASSWORD_RESET: 'password_reset',
  LOGIN: 'login',
  LOGOUT: 'logout'
};

const ACTION_LABELS = {
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
};

module.exports = {
  ROLES,
  ROLE_LABELS,
  STAGES,
  STAGE_LABELS,
  CATEGORIES,
  BG_TYPES,
  LOST_REASONS,
  LOST_REASON_MAP,
  ACTIONS,
  ACTION_LABELS
};
