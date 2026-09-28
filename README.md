# চুক্তি (Chukti) — Tender Management System

Tender lifecycle management with a role based approval workflow, built with **Node.js + Express**,
the built-in **`node:sqlite`** database and a **vanilla JS** frontend (no build step).

<p align="center">
  <img src="public/logo.svg" alt="চুক্তি logo" width="140" />
</p>

## Features

- **Full tender lifecycle** — Upcoming → Approval (order to purchase) → Ongoing (purchased) → Won / Lost, with reopen
- **Three roles** — Admin, Manager, Team member (Rep), enforced on the server for every request
- **JWT sessions** in an HttpOnly cookie (7 days with "remember me", otherwise a session cookie)
- **Dashboard** with stage statistics, pending approvals, recent activity and tenders closing within 7 days
- **Tender tabs** with search, category filter, sorting and CSV export
- **Users management** (admin) — create, edit, enable/disable, reset password, delete
- **Activity log** — every workflow step is recorded with actor and timestamp
- **Brand theme** — deep green `#0F4C3A`, gold `#D4AF37` on cream `#FDFBF7`, Inter + Hind Siliguri

## Requirements

- **Node.js 22.5 or newer** (uses the built-in `node:sqlite` module; developed and tested on Node 24)
- No database server, no build tooling and no global packages are required

```bash
node -v   # v22.5.0 or higher
```

## Getting started

```bash
npm install     # express, bcryptjs, jsonwebtoken, cookie-parser
npm start       # or: npm run dev   (auto restart on file changes)
```

Then open **http://localhost:3000**

### Default admin account

The database is created automatically on the first run and seeded with one admin:

| Email               | Password   | Role  |
| ------------------- | ---------- | ----- |
| `admin@chukti.com`  | `admin123` | admin |

> Change this password right after the first sign in (Users → Reset Password).

### Adding the logo

Drop your file at `public/logo.png`. Until then the bundled `public/logo.svg` is used
automatically as the fallback (see the `onerror` handler in the header markup).

## Roles and permissions

| Capability                                | Admin | Manager  | Rep |
| ----------------------------------------- | :---: | :------: | :-: |
| See every tender                          |  ✅   |    ✅    | Only approved tenders |
| Create a tender                           |  ✅   |    ✅    | ❌  |
| Edit a tender                             |  Any  | Own only | ❌  |
| Order to purchase (approve) / withdraw    |  ✅   |    ✅    | ❌  |
| Mark as purchased (moves to Ongoing)      |  ✅   |    ✅    | ✅  |
| Mark Won / Lost                           |  ✅   |    ✅    | ✅  |
| Reopen a won/lost tender                  |  ✅   |    ✅    | ❌  |
| Delete a tender                           |  ✅   |    ❌    | ❌  |
| Manage users                              |  ✅   |    ❌    | ❌  |

## Workflow

1. **Upcoming** — an admin or manager creates the tender (unapproved, amber stripe).
2. **Approval** — an admin or manager presses *Order to Purchase*; the tender becomes visible to reps.
3. **Ongoing** — any signed-in user presses *Purchased* and records submission date, bid price and deposit.
4. **Won / Lost** — the result is recorded (lost requires one of the ten reasons), and the tender can be
   reopened later if the result changes.

## Environment variables

| Variable     | Default         | Purpose |
| ------------ | --------------- | ------- |
| `PORT`       | `3000`          | HTTP port |
| `JWT_SECRET` | dev fallback    | **Required in production** — the server refuses to start with the development secret when `NODE_ENV=production` |
| `DB_PATH`    | `./database.db` | SQLite file location |
| `NODE_ENV`   | —               | `production` enables secure cookies and hides internal errors |

```powershell
# PowerShell
$env:JWT_SECRET = "your-long-random-secret"; npm start
```

## API

| Method | Endpoint | Access |
| ------ | -------- | ------ |
| POST | `/api/auth/login` | public |
| POST | `/api/auth/logout` | any |
| GET | `/api/auth/me` | any |
| GET | `/api/users` | admin |
| POST | `/api/users` | admin |
| PUT | `/api/users/:id` | admin |
| POST | `/api/users/:id/reset-password` | admin |
| DELETE | `/api/users/:id` | admin |
| GET | `/api/tenders` | role filtered (`stage`, `search`, `category`, `approval`, `sort`, `order`) |
| GET | `/api/tenders/stats` | role filtered |
| GET | `/api/tenders/:id` | role filtered (accepts numeric id or tender code) |
| POST | `/api/tenders` | admin, manager |
| PUT | `/api/tenders/:id` | admin (any), manager (own) |
| DELETE | `/api/tenders/:id` | admin |
| POST | `/api/tenders/:id/approve` | admin, manager |
| POST | `/api/tenders/:id/unapprove` | admin, manager |
| POST | `/api/tenders/:id/purchase` | any signed-in user |
| POST | `/api/tenders/:id/mark-won` | any signed-in user |
| POST | `/api/tenders/:id/mark-lost` | any signed-in user |
| POST | `/api/tenders/:id/reopen` | admin, manager |
| GET | `/api/activity` | role filtered (`tender_id`, `user_id`, `action`, `from`, `to`) |
| GET | `/api/activity/recent` | role filtered |
| GET | `/api/health` | public |

## Project structure

```
chukti-tender-management/
├── server.js              Express app, static hosting, startup
├── package.json
├── database.db            created on first run (git-ignored)
├── middleware/
│   └── auth.js            JWT cookie auth + requireRole
├── routes/
│   ├── auth.js            login / logout / me
│   ├── users.js           user management (admin only)
│   ├── tenders.js         CRUD, stats and the full workflow
│   └── activity.js        activity log queries
├── utils/
│   ├── config.js          env driven configuration
│   ├── constants.js       roles, stages, categories, lost reasons
│   ├── db.js              node:sqlite schema + default admin seed
│   └── audit.js           activity logging helper
├── scripts/
│   ├── smoke-test.js      end-to-end API tests (56 checks)
│   └── frontend-check.js  headless UI checks (40 checks)
└── public/
    ├── login.html         sign-in screen
    ├── index.html         app shell (header, nav, pages)
    ├── styles.css         brand theme
    ├── icons.js           inline SVG icons + shared UI constants
    ├── app.js             single page application
    ├── logo.svg           fallback logo
    └── logo.png           your logo (add it here)
```

## Testing

Both test scripts talk to a running server, so start it first (`npm start` in another terminal):

```bash
npm test          # API + permission checks: roles, workflow, validation, cleanup
npm run check:ui  # renders the real frontend against the live API in a headless fake DOM
```

The scripts clean up everything they create, so they are safe to run repeatedly.

## Security notes

- Passwords are hashed with **bcrypt** (10 rounds) and never returned by the API
- Sessions are **JWT** tokens in an **HttpOnly**, `SameSite=Lax` cookie (secure flag in production)
- Every query uses **parameterised statements** (`node:sqlite` prepared statements)
- All user supplied text is **HTML escaped** before it reaches the DOM
- Permissions are enforced in the API layer — the UI only hides actions it knows will be refused
- The last active admin cannot be demoted, disabled or deleted
