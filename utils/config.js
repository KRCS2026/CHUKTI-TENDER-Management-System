'use strict';

/**
 * চুক্তি (Chukti) — central configuration.
 * All secrets come from environment variables with safe development defaults.
 */

const IS_PROD = process.env.NODE_ENV === 'production';
const DEV_SECRET = 'chukti-dev-secret-change-me';

let jwtSecret = process.env.JWT_SECRET || DEV_SECRET;

if (IS_PROD && jwtSecret === DEV_SECRET) {
  // Never run production with the development fallback secret.
  throw new Error(
    'JWT_SECRET environment variable is required in production. ' +
      'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"'
  );
}

module.exports = {
  APP_NAME: 'চুক্তি',
  APP_SUBTITLE: 'Tender Management System',
  PORT: Number(process.env.PORT || 3000),

  IS_PROD,
  JWT_SECRET: jwtSecret,
  JWT_EXPIRES_IN: '7d',
  COOKIE_NAME: 'chukti_token',
  COOKIE_MAX_AGE: 7 * 24 * 60 * 60 * 1000, // 7 days

  BCRYPT_ROUNDS: 10,

  DEFAULT_ADMIN: {
    name: 'Admin',
    email: 'admin@chukti.com',
    password: 'admin123',
    role: 'admin'
  }
};
