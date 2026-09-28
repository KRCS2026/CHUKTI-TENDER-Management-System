# চুক্তি (Chukti) — System Architecture & File Guide

> README choto rakha hoyeche; ei file e full architecture, protita file er kaj,
> data model, API table, testing o deploy guide ache.

## 1. Architecture (request flow)

```
Browser SPA (public/) ──fetch JSON + HttpOnly cookie──▶ Express API (server.js)
   login.html · index.html · app.js · icons.js · styles.css   │  /api/auth /users /tenders /activity /health
                                                              │  middleware/auth.js (JWT + requireRole)
                                                              ▼
                                              node:sqlite (database.db, WAL)
                                              Users · Tenders · ActivityLog
                                              utils/db.js (schema+seed) · utils/audit.js
```

**Example — Mark as Lost:**

1. Rep clicks *Mark as Lost* → `lostModal()` in `public/app.js`
   (`Our Quoted Price *`, reason radio, winner, result date, refund, notes).
2. `POST /api/tenders/:id/mark-lost` + `chukti_token` cookie.
3. `requireAuth` verifies JWT → route checks `stage==='ongoing'`,
   validates reason + quoted price + result date.
4. `UPDATE Tenders SET stage='lost', our_bid_price=?, …` (parameterised) +
   `logActivity({action:'tender_lost'})`.
5. Dashboard `lost.amount` = **sum of `our_bid_price`** → Lost card e quoted total.

**Auth:** JWT 7-day, HttpOnly `SameSite=Lax` cookie (`Secure` in prod).
Remember-me = 7-day maxAge, nahole session cookie. Permission sob API layer e enforce.

## 2. Roles & workflow

| Capability | Admin | Manager | Rep |
| --- | :---: | :---: | :---: |
| See every tender | ✅ | ✅ | Only approved |
| Create tender | ✅ | ✅ | ❌ |
| Edit tender | Any | Own only | ❌ |
| Approve / withdraw | ✅ | ✅ | ❌ |
| Purchased (→Ongoing) | ✅ | ✅ | ✅ |
| Won / Lost | ✅ | ✅ | ✅ |
| Reopen | ✅ | ✅ | ❌ |
| Delete tender | ✅ | ❌ | ❌ |
| Manage users | ✅ | ❌ | ❌ |

Upcoming → Approval (Order to Purchase) → Ongoing (Purchased: submission date +
deposited; bid optional) → Won / Lost (Lost needs reason + **Our Quoted Price**;
Lost card sums quotes) → Reopen possible.

### utils/

| File | Kaj |
| --- | --- |
| `utils/config.js` | PORT, JWT_SECRET (prod e required), cookie, bcrypt rounds, default admin. |
| `utils/constants.js` | Roles, stages, categories, BG types, 10 lost reasons, action labels. |
| `utils/db.js` | SQLite: schema (Users/Tenders/ActivityLog+indexes), WAL/FK pragmas, column migration, lost-price backfill, default admin seed. |
| `utils/audit.js` | `logActivity()` + `recentActivity()`. |

### scripts/ (running server er against e; self-cleanup)

| File | Kaj |
| --- | --- |
| `scripts/smoke-test.js` | 58-check API test: auth/users/CRUD/visibility/approval/purchase/won-lost-reopen/stats/activity. |
| `scripts/frontend-check.js` | 40-check headless UI test (real app.js + fake DOM): shell/dashboard/tabs/modals/detail/users/activity. |

### public/ (no build)

| File | Kaj |
| --- | --- |
| `index.html` | App shell: header, nav, page containers, modal/toast roots. |
| `login.html` | Sign-in (logo.png → logo.svg fallback). |
| `app.js` | ~1700-line SPA: state/api/router/statCards/panels/tabs/search/CSV/cards/modals (purchase: no bid; lost: Our Quoted Price)/detail/users/activity/toasts. |
| `icons.js` | SVG icons + shared constants. |
| `styles.css` | Brand theme `#0F4C3A`/`#D4AF37`/`#FDFBF7`, Inter + Hind Siliguri. |
| `logo.svg` / `logo.png` | Fallback logo / apnar logo ekhane din. |

## 4. Data model

- **Users:** id, name, email(unique,lowercase), password_hash(bcrypt-10), role, phone, is_active, last_login, created_at
- **Tenders:** id, tender_id(unique,case-insensitive), tender_name, category, stage, is_approved, approved_by/at, approval_notes, purchased_by/at, purchase_notes, tender_budget, tender_bg, bg_type, tender_experience, closing_date, submission_date, result_date, **our_bid_price (=quoted price, Lost summary source)**, deposited_amount, winning_price, winner_company, lost_reason, lost_notes, won_notes, refund_amount/date, notes, created_by/at, updated_at
- **ActivityLog:** id, user_id(SET NULL), action, tender_id(CASCADE), details, created_at

## 5. API table

| Method | Endpoint | Access |
| --- | --- | --- |
| POST | `/api/auth/login` | public |
| POST | `/api/auth/logout` | any |
| GET | `/api/auth/me` | any |
| GET/POST | `/api/users` | admin |
| PUT | `/api/users/:id` | admin |
| POST | `/api/users/:id/reset-password` | admin |
| DELETE | `/api/users/:id` | admin |
| GET | `/api/tenders` | role filtered |
| GET | `/api/tenders/stats` | role filtered |
| GET | `/api/tenders/:id` | role filtered |
| POST | `/api/tenders` | admin, manager |
| PUT | `/api/tenders/:id` | admin(any), manager(own) |
| DELETE | `/api/tenders/:id` | admin |
| POST | `/api/tenders/:id/approve` | admin, manager |
| POST | `/api/tenders/:id/unapprove` | admin, manager |
| POST | `/api/tenders/:id/purchase` | any user |
| POST | `/api/tenders/:id/mark-won` | any user |
| POST | `/api/tenders/:id/mark-lost` | any user |
| POST | `/api/tenders/:id/reopen` | admin, manager |
| GET | `/api/activity`, `/api/activity/recent` | role filtered |
| GET | `/api/health` | public |

## 6. Testing

```bash
npm test          # 58 API checks
npm run check:ui  # 40 UI checks
```

## 7. Deploy — host kore public link pawa (free)

`render.yaml` + `Dockerfile` repo te ache. SQLite **persistent disk** e thake.

**Render (recommended):** dashboard.render.com → New → Blueprint → repo select →
`JWT_SECRET` Generate → Deploy → `https://chukti.onrender.com` → login
`admin@chukti.com`/`admin123` → password bodlan.

**Docker host (Sevalla/Railway/Fly.io):**
`docker build -t chukti .` →
`docker run -p 3000:3000 -e JWT_SECRET=... -v chukti-data:/app/data chukti`

Note: free tier 15 min idle e sleep → first request ~30s. Custom domain + free SSL
Render Settings e.


## 3. File-by-file (kon file er ki kaj)

### Root

| File | Kaj |
| --- | --- |
| `server.js` | Express boot: DB init + admin seed, JSON/cookie middleware, `/api/*` routers, static `public/`, SPA fallback, error handler, listen. |
| `package.json` | 4 deps (express, bcryptjs, jsonwebtoken, cookie-parser) + scripts `start/dev/test/check:ui`. |
| `render.yaml` | Render Blueprint: Node 24, `npm ci`, persistent disk, `JWT_SECRET` generate. |
| `Dockerfile` / `.dockerignore` | Container deploy (Node 24-slim, non-root, healthcheck). |
| `.gitignore` | DB, logs, `.env`, local helpers ignore. |
| `LICENSE` | MIT. |
| `database.db` | Git-ignored; first run e auto-create. Kokhono commit na. |

### middleware/

`middleware/auth.js` — `readToken` (cookie→Bearer), `signToken`, `setAuthCookie`/
`clearAuthCookie`, `requireAuth` (JWT verify + active check), `requireRole()`,
`findUserByEmail`, `loadUserById`.

### routes/ (sob `requireAuth` diye suru)

| File | Kaj |
| --- | --- |
| `routes/auth.js` | `POST login/logout`, `GET me`. bcrypt verify, last_login, JWT cookie, activity. |
| `routes/users.js` | Admin user CRUD + reset-password + delete (last-admin protection, FK detach). |
