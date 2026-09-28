# চুক্তি (Chukti) — Tender Management System

Complete tender lifecycle management with a role-based approval workflow, built with
**Node.js + Express**, the built-in **`node:sqlite`** database and a **vanilla JS** frontend
(no build step, no bundler, no ORM).

[![Node >= 22.5](https://img.shields.io/badge/node-%3E%3D22.5-brightgreen)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-58%20API%20%2B%2040%20UI-success)](#testing)

> ### 🌐 Live demo (running now)
> **https://twins-receptor-heaven-pride.trycloudflare.com**
> 
>
> Hoisted temporarily through a Cloudflare quick tunnel to the local server
> (`node tunnel.js`, no account needed). The URL is **ephemeral** — it dies when the
> tunnel or the machine stops, and a restart creates a new one, so treat it as a
> preview link. For a permanent URL, follow [Deploy](#10-deploy--public-link-free).

**Contents**
[Architecture](#1-architecture) ·
[Roles](#2-roles--permissions) ·
[Workflow](#3-tender-workflow) ·
[Quick start](#4-quick-start) ·
[File-by-file guide](#5-file-by-file-guide) ·
[Data model](#6-data-model) ·
[API](#7-api) ·
[Testing](#8-testing) ·
[Environment](#9-environment-variables) ·
[Deploy](#10-deploy--public-link-free) ·
[Security](#11-security-notes)

---

## 1. Architecture

```
                    ┌──────────────────────────────────────────┐
                    │              Browser (SPA)               │
                    │  public/login.html  → sign-in screen     │
                    │  public/index.html  → app shell          │
                    │  public/app.js      → router, dashboard, │
                    │     tenders, users, activity, modals, CSV│
                    │  public/icons.js    → SVG + constants    │
                    │  public/styles.css  → brand theme        │
                    └───────────────┬──────────────────────────┘
                                    │ fetch JSON + HttpOnly cookie
                                    ▼
                    ┌──────────────────────────────────────────┐
                    │        Express API   (server.js)         │
                    │  /api/auth  /api/users  /api/tenders     │
                    │  /api/activity  /api/health              │
                    │  middleware/auth.js → JWT + requireRole  │
                    └───────────────┬──────────────────────────┘
                                    │ prepared statements
                                    ▼
                    ┌──────────────────────────────────────────┐
                    │  node:sqlite   (database.db, WAL mode)   │
                    │  Users · Tenders · ActivityLog           │
                    │  utils/db.js   → schema, seed, backfill  │
                    │  utils/audit.js → logActivity()          │
                    └──────────────────────────────────────────┘
```

**Example request — "Mark as Lost":**

1. The rep clicks *Mark as Lost* → `lostModal()` in `public/app.js` renders the form
   (**Our Quoted Price \***, reason, winner company, result date, refund, notes).
2. `POST /api/tenders/:id/mark-lost` is sent with JSON body + the `chukti_token` cookie.
3. `middleware/auth.js → requireAuth` verifies the JWT and re-loads the user, then the route
   checks `stage === 'ongoing'`, validates the reason, the quoted price and the result date.
4. `UPDATE Tenders SET stage='lost', our_bid_price=?, …` (parameterised), then
   `logActivity({ action: 'tender_lost', … })` writes the audit row.
5. The dashboard's `lost.amount` is the **sum of `our_bid_price`** (our quoted prices), so the
   *Lost* card shows the real quoted total instead of ৳ 0.

**Authentication:** JWT (`jsonwebtoken`, 7-day expiry) kept in an **HttpOnly, `SameSite=Lax`**
cookie named `chukti_token` (`Secure` when `NODE_ENV=production`). "Remember me" sets a 7-day
`maxAge`, otherwise a session cookie is used. Every permission is enforced **server-side** —
the UI only hides buttons it knows the API will refuse.

---

## 2. Roles & permissions

| Capability                              | Admin | Manager  | Rep |
| --------------------------------------- | :---: | :------: | :-: |
| See every tender                        |  ✅   |    ✅    | Only approved tenders |
| Create a tender                         |  ✅   |    ✅    | ❌ |
| Edit a tender                           |  Any  | Own only | ❌ |
| Order to purchase (approve) / withdraw  |  ✅   |    ✅    | ❌ |
| Mark as purchased (→ Ongoing)           |  ✅   |    ✅    | ✅ |
| Mark Won / Lost                         |  ✅   |    ✅    | ✅ |
| Reopen a won/lost tender                |  ✅   |    ✅    | ❌ |
| Delete a tender                         |  ✅   |    ❌    | ❌ |
| Manage users                            |  ✅   |    ❌    | ❌ |

## 3. Tender workflow

1. **Upcoming** — an admin/manager creates the tender (unapproved, amber stripe in the UI).
2. **Approval** — an admin/manager presses *Order to Purchase*; the tender then becomes visible to reps.
3. **Ongoing** — any signed-in user presses *Purchased* and records the submission date and the
   deposited amount. The bid price is **optional** here.
4. **Won / Lost** — the result is recorded. *Lost* requires one of the ten reasons **plus
   Our Quoted Price** (koto taka quote kore submission kora hoyeche) — the *Lost* dashboard card
   sums these quoted prices. *Reopen* sends the tender back to Ongoing if the result changes.

## 4. Quick start

**Requirements:** Node.js **22.5+** (uses the built-in `node:sqlite` module; developed on Node 24).
No database server, no build tool and no global packages are required.

```bash
node -v      # v22.5.0 or higher
npm install  # express, bcryptjs, jsonwebtoken, cookie-parser
npm start    # or: npm run dev  (auto-restart on file changes)
```

Open **http://localhost:3000**

### Default admin (seeded on first run)

| Email              | Password   | Role  |
| ------------------ | ---------- | ----- |
| `admin@chukti.com` | `admin123` | admin |

> Change this password right after the first sign in (Users → Reset Password).

### Logo

Drop your file at `public/logo.png`. Until then the bundled `public/logo.svg` is used automatically
(see the `onerror` fallback in the header markup).

---

## 5. File-by-file guide (kon file er ki kaj)

### Root

| File | Purpose |
| ---- | ------- |
| `server.js` | Express bootstrap: `initDb()` + default-admin seed, JSON & cookie middleware, mounts the `/api/*` routers, serves `public/` statically, SPA fallback to `index.html`, JSON error handler, `app.listen(PORT)`. |
| `package.json` | Metadata, the 4 runtime dependencies and the scripts `start`, `dev`, `test`, `check:ui`. |
| `package-lock.json` | Locked dependency tree for reproducible `npm ci` (used by the deploy build). |
| `render.yaml` | Render **Blueprint**: one-click free deploy — Node 24, `npm ci`, `/api/health` check, a persistent disk mounted for `database.db`, random `JWT_SECRET`. |
| `Dockerfile` | Optional container deploy (Node 24-slim, non-root `appuser`, `HEALTHCHECK`). |
| `.dockerignore` | Keeps the image small (excludes DB, logs, `node_modules`, `.git`). |
| `.gitignore` | Ignores the SQLite DB, logs, `.env`, local helper scripts and editor junk. |
| `LICENSE` | MIT license. |
| `database.db` | **Not committed.** Created on first run in WAL mode; never push it (real data would leak). |
| `health-check.txt` | Scratch note used while verifying the app boots — safe to delete. |

### `middleware/`

| File | Purpose |
| ---- | ------- |
| `middleware/auth.js` | The whole auth layer: `readToken` (cookie → `Authorization: Bearer` fallback), `signToken` (JWT, 7-day), `setAuthCookie` / `clearAuthCookie` (HttpOnly, `SameSite=Lax`, `Secure` in production), `requireAuth` (verify JWT → load user → reject disabled accounts), `requireRole(...roles)`, plus `findUserByEmail` and `loadUserById`. |

### `routes/` — every router starts with `requireAuth`

| File | Endpoints | Purpose |
| ---- | --------- | ------- |
| `routes/auth.js` | `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` | bcrypt password check, `last_login` update, JWT cookie issue/clear, login & logout audit entries. |
| `routes/users.js` | `GET/POST /api/users`, `PUT /api/users/:id`, `POST /api/users/:id/reset-password`, `DELETE /api/users/:id` | Admin-only user CRUD; guards the last active admin; detaches tender foreign keys before deleting a user. |
| `routes/tenders.js` | `GET /api/tenders`, `/stats`, `/:id`, `POST /`, `PUT /:id`, `DELETE /:id`, `POST /:id/approve`, `/unapprove`, `/purchase`, `/mark-won`, `/mark-lost`, `/reopen` | The complete tender lifecycle: rep visibility filter (`is_approved=1`), search / category / approval / sort filters, `buildStats()` (Lost = **sum of quoted prices**), purchase **without** a mandatory bid, lost **requiring** `our_bid_price`, plus audit logging for every transition. |
| `routes/activity.js` | `GET /api/activity`, `GET /api/activity/recent` | Audit-trail queries (reps only see activity of approved tenders) with `tender_id`, `user_id`, `action`, `from`, `to` filters. |

---

### `utils/`

| File | Purpose |
| ---- | ------- |
| `utils/config.js` | Env-driven configuration: `PORT`, `DB_PATH`, `NODE_ENV`, JWT secret + expiry (production **requires** a real `JWT_SECRET` — it refuses to boot with the dev fallback), cookie name/age, bcrypt rounds, default admin credentials. |
| `utils/constants.js` | Single source of domain truth shared with the UI: roles, stages, categories, bank-guarantee types, the 10 lost reasons (+ label map) and activity action labels. |
| `utils/db.js` | The data layer on `node:sqlite`: `DB_PATH` resolution, pragmas (WAL, foreign keys, `busy_timeout`), `CREATE TABLE IF NOT EXISTS` schema for `Users` / `Tenders` / `ActivityLog` with indexes, `addColumnIfMissing()` migrations, the **lost-price backfill** (empty quoted price → winning price) and `ensureDefaultAdmin()`. |
| `utils/audit.js` | `logActivity({ userId, action, tenderId, details })` plus `recentActivity(limit)` — a join helper that returns the audit feed with actor names. |

### `scripts/` — run against a live server, self-cleaning

| File | Purpose |
| ---- | ------- |
| `scripts/smoke-test.js` | **58-check** end-to-end API test: login/logout, user CRUD, tender CRUD, rep visibility, approval flow, purchase **without** a bid price, won/lost/reopen (lost requires the quoted price), stats (lost sums quotes), activity log, cleanup. |
| `scripts/frontend-check.js` | **40-check** headless UI test: loads the real `public/icons.js` + `public/app.js` into a fake DOM and asserts the shell, dashboard cards, tender tabs, approve/purchase/won/lost modals (including the quoted-price field), detail view, users and activity pages. |

### `public/` — no build step, plain HTML/CSS/JS

| File | Purpose |
| ---- | ------- |
| `public/index.html` | App shell: header (logo + user menu), nav tabs, page containers, modal & toast roots, script tags. |
| `public/login.html` | Sign-in screen (`logo.png`, with `logo.svg` fallback), remember-me checkbox, error box. |
| `public/app.js` | The ~1700-line SPA: app state, `api()` fetch helper, hash router, `statCards()`, dashboard panels, tender tabs/search/sort/CSV export, cards & stage badges, every modal (purchase **without** a bid field; lost **with** Our Quoted Price), the detail view, users page, activity page and toasts. |
| `public/icons.js` | Inline SVG icon set plus shared UI constants (`CATEGORIES`, `STAGE_META`, lost reasons …) that mirror `utils/constants.js`. |
| `public/styles.css` | Brand theme: deep green `#0F4C3A`, gold `#D4AF37`, cream `#FDFBF7`, Inter + Hind Siliguri, cards/tabs/modals/tables. |
| `public/logo.svg` | Bundled fallback logo (used automatically if `logo.png` is missing). |
| `public/logo.png` | **Add your own logo here** — it replaces the SVG fallback. |

## 6. Data model (SQLite)

- **`Users`** — `id`, `name`, `email` (unique, lower-cased), `password_hash` (bcrypt-10), `role`
  (`admin` | `manager` | `rep`), `phone`, `is_active`, `last_login`, `created_at`
- **`Tenders`** — `id`, `tender_id` (unique, case-insensitive), `tender_name`, `category`,
  `stage` (`upcoming` | `ongoing` | `won` | `lost`), `is_approved`, `approved_by`, `approved_at`,
  `approval_notes`, `purchased_by`, `purchased_at`, `purchase_notes`, `tender_budget`, `tender_bg`,
  `bg_type`, `tender_experience`, `closing_date`, `submission_date`, `result_date`,
  **`our_bid_price`** (= our quoted price — the source of the Lost summary), `deposited_amount`,
  `winning_price`, `winner_company`, `lost_reason`, `lost_notes`, `won_notes`, `refund_amount`,
  `refund_date`, `notes`, `created_by`, `created_at`, `updated_at`
- **`ActivityLog`** — `id`, `user_id` (→ `Users`, `ON DELETE SET NULL`), `action`, `tender_id`
  (→ `Tenders`, `ON DELETE CASCADE`), `details`, `created_at`

Detailed API table & deployment notes live in **[ARCHITECTURE.md](ARCHITECTURE.md)**.

---

## 7. API

| Method | Endpoint | Access |
| ------ | -------- | ------ |
| POST | `/api/auth/login` | public |
| POST | `/api/auth/logout` | any |
| GET | `/api/auth/me` | any |
| GET / POST | `/api/users` | admin |
| PUT | `/api/users/:id` | admin |
| POST | `/api/users/:id/reset-password` | admin |
| DELETE | `/api/users/:id` | admin |
| GET | `/api/tenders` | role filtered (`stage`, `search`, `category`, `approval`, `sort`, `order`) |
| GET | `/api/tenders/stats` | role filtered |
| GET | `/api/tenders/:id` | role filtered (numeric id **or** tender code) |
| POST | `/api/tenders` | admin, manager |
| PUT | `/api/tenders/:id` | admin (any), manager (own) |
| DELETE | `/api/tenders/:id` | admin |
| POST | `/api/tenders/:id/approve` / `unapprove` | admin, manager |
| POST | `/api/tenders/:id/purchase` | any signed-in user (bid price optional) |
| POST | `/api/tenders/:id/mark-won` | any signed-in user |
| POST | `/api/tenders/:id/mark-lost` | any signed-in user (quoted price required) |
| POST | `/api/tenders/:id/reopen` | admin, manager |
| GET | `/api/activity`, `/api/activity/recent` | role filtered |
| GET | `/api/health` | public |

## 8. Testing

Both scripts talk to a **running** server, so start it first (`npm start` in another terminal):

```bash
npm test          # 58 API + permission checks (roles, workflow, validation, cleanup)
npm run check:ui  # 40 headless UI checks against the live API
```

They clean up everything they create, so they are safe to run repeatedly.

## 9. Environment variables

| Variable     | Default         | Purpose |
| ------------ | --------------- | ------- |
| `PORT`       | `3000`          | HTTP port |
| `JWT_SECRET` | dev fallback    | **Required in production** — the server refuses to start with the development secret when `NODE_ENV=production` |
| `DB_PATH`    | `./database.db` | SQLite file location (point it at a persistent disk when hosting) |
| `NODE_ENV`   | —               | `production` enables secure cookies and hides internal error details |

```powershell
# PowerShell
$env:JWT_SECRET = "your-long-random-secret"; npm start
```

```bash
# Generate a secret
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

---

## 10. Deploy — public link (free)

The repo already contains a `render.yaml` Blueprint and a `Dockerfile`, so hosting takes ~5 minutes.
On Render the SQLite file lives on a **persistent disk**, so data survives redeploys.

### Option A — Render (recommended, free)

1. Push the repo (already done) → open https://dashboard.render.com
2. **New +** → **Blueprint** → pick `KRCS2026/CHUKTI-TENDER-Management-System`
3. Render reads `render.yaml` (`chukti` web service + `chukti-data` disk)
4. **Environment** → `JWT_SECRET` → **Generate** (random value)
5. **Deploy** → after 2–4 min your link is ready: `https://chukti.onrender.com`
   (rename it under Settings if you like)
6. Sign in with `admin@chukti.com` / `admin123` and **change the password**

### Option B — any Docker host (Sevalla / Railway / Fly.io / VPS)

```bash
docker build -t chukti .
docker run -p 3000:3000 -e JWT_SECRET=... -v chukti-data:/app/data chukti
```

Keep the SQLite file on a persistent volume, otherwise the data is lost on restart.

### Option C — temporary public link, no account (what the live demo uses)

```bash
node tunnel.js     # downloads cloudflared once, prints https://<random>.trycloudflare.com
```

- Points a Cloudflare quick tunnel at `http://localhost:3000` — works while this machine and
  the server are running, and **the URL changes every restart**
- Current preview link: **https://twins-receptor-heaven-pride.trycloudflare.com**
- Stop it with `Get-Process cloudflared | Stop-Process -Force` (Windows) or Ctrl+C

> ⚠️ A public tunnel exposes the app **and the data in `database.db`** to anyone with the link.
> Use it only for demos/short reviews, open only the ports you need, and change the default
> admin password first. The default-credentials hint is hidden automatically outside
> `localhost` (`public/login.html`).

### Notes

- Free tiers sleep after ~15 min idle — the first request can take ~30 s.
- `database.db` is git-ignored and never uploaded; production data lives on the disk/volume.
- Custom domain + free SSL: Render → Settings → Custom Domain.

## 11. Security notes

- Passwords are hashed with **bcrypt** (10 rounds) and never returned by the API
- Sessions are **JWT** tokens in an **HttpOnly**, `SameSite=Lax` cookie (`Secure` in production)
- Every query uses **parameterised prepared statements** (`node:sqlite`)
- All user-supplied text is **HTML-escaped** before it reaches the DOM
- Permissions are enforced in the API layer — the UI only hides actions it knows will be refused
- The last active admin cannot be demoted, disabled or deleted

## 12. License

MIT — see [LICENSE](LICENSE).





