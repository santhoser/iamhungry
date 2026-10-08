# Cafe77 application memory

## User decisions (source of truth)

- 2026-10-04: User changed the hosting plan to an Azure App Service demo with local SQLite and requested creation/deployment instructions using the VS Code Azure extension. Earlier staging/production requirement remains relevant. No paid tier or cloud provisioning authorized in this instructions-only request. SQLite on App Service's shared `/home` storage is documented as unsupported; proposed demo instructions use ephemeral `/tmp` SQLite, with data-loss limitations explicitly explained. Azure deployment changes are not yet implemented or verified.
- Single Indian restaurant, Cafe77; 12–15 tables and 50+ orders (period not confirmed). Standalone Phase 1, no multi-tenant work now.
- Free hosting only; build/test locally first, Cloudflare hosting later after explicit authorization.
- Supplied logo: `C:/Users/santhosh.ramesan/Downloads/cafe77-logo.jpg`; copied into public assets. Theme: deep red, warm gold, cream, espresso text.
- Table QR opens menu with table identifier. Grouped menu, today's specials, item details/images/optional YouTube, cart, separate order on every checkout.
- Name required. Email/phone optional in original requirement; notifications deferred. Keep optional contact fields for future use; no marketing messaging now.
- Counter payment only (cash or PhonePe accepted by staff); do not split these methods on dashboard. Future reporting counter vs app. UPI app switch must stay disabled until an actual integration exists.
- Owner manages menu/prices/groups/users/reports/config. Cashier manages orders/payment and item stock availability.
- Menu item flags: active=true, ranOut=false, todaySpecial=false, dashboardFav=false. Inactive hidden; sold-out visible but disabled. Optional code search.
- Statuses: New -> Accepted/InProgress/Cancelled; Accepted -> InProgress/Ready/Cancelled; InProgress -> Ready/Cancelled; Ready -> Closed/Cancelled; Cancelled -> New. Closed terminal.
- Only staff cancel; reason optional; ready/paid orders can be cancelled. Payment retained; manual refund recorded separately. Closed means served and paid, staff confirms.
- All status/payment changes audited. Closed removed from current orders; cancelled available in history and reopenable.
- Owner dashboard: date presets today/7 days/MTD/YTD/custom, orders/sales, dashboard favourites/top items quantities. No payment-channel breakdown for Phase 1.
- Order history descending/paged with ID/date/customer name/email/phone search.
- Config file for name/GSTIN/address/contact, GST rate **10% development value**, inclusive/exclusive flag (initial inclusive), QR base URL (supports short redirect URLs preserving table token), menu-code search. Confirm actual GST configuration before live launch.
- Receipts preserve original prices/tax/restaurant details. Inclusive ₹110 @10% => base ₹100, GST ₹10, total ₹110; exclusive => base ₹110, GST ₹11, total ₹121.
- New orders use `c77-yyMMddHHmmssttt-XXXX`: India time, 24-hour clock, 3-digit milliseconds and 4 cryptographically random uppercase alphanumeric characters. Existing order numbers remain unchanged; server retries a suffix collision before insertion.
- Payment action is labelled **Mark as Paid** and uses an in-app confirmation with order/table/amount, not a browser confirmation.
- Owner can soft-delete tables from QR page and discontinue menu items/groups. Rows and historical orders/receipts remain. Group deletion is blocked if any menu item record is linked (including inactive or discontinued items).
- Removed table QR links reject new orders. Re-adding its number revives the retained table record with a new QR token, so old stickers remain invalid. Already submitted orders can still be served/paid/closed.

## Architecture / implementation status

Local Phase 1 implemented. React/TypeScript/Vite frontend; local Express/TypeScript API and SQLite (Node built-in node:sqlite; Node >=22.13). Persistent storage in ignored data/ folder. Cloudflare Workers/D1 port is deferred; local Express server is not directly deployable to Workers.

- Public menu, grouped/category filtering/code search, specials, item detail modal, quantity/cart, required name and optional contact fields, counter-only checkout, random-token tracking, payment receipt and print/PDF via browser.
- Owner/cashier authentication, initial one-time owner setup link printed at startup, owner staff creation/deactivation/password reset. No default accounts in real database.
- Order current/history/search/pagination, server-enforced transitions, optimistic versions, payment/refund recording, status/payment audit timeline. Staff change events delivered immediately over authenticated SSE; 5-second polling fallback. Customer polls 5 seconds, menu 15 seconds.
- Owner dashboard includes orders/cancellations/completed orders, sales, daily order/sales graphs, top items and favourites.
- Owner menu/group editors including upload (PNG/JPEG/WebP ≤2 MB), images, YouTube, flags; cashier stock-only access. Stock toggle has optimistic feedback and rollback on failure.
- Fifteen tables seeded with random QR tokens. Owner can add tables, choose all/one for QR printing, and open table menu. Configurable base URL retains existing query parameters and appends table token.
- Config persists as `config/restaurant.json`; owner settings update it. Orders snapshot original restaurant/tax config and line prices. Generic GST development receipt; production Indian tax invoice requirements remain to be confirmed.
- Logo in public/cafe77-logo.jpg. Original SVG food illustrations in public/illustrations; regenerate with scripts/generate-assets.mjs. Seed menu is sample content, not Cafe77's actual menu.

### Key files

- `shared/domain.ts`: types, statuses/transitions, integer-paise GST math, QR URL builder.
- `server/db.ts`: SQLite schema, seeds, transaction helper, scrypt passwords, config loader.
- `server/app.ts`: API, sessions/roles, validators, orders, payments, dashboard, uploads, SSE.
- `server/index.ts`: loopback local server, Vite middleware/HMR on same HTTP server, startup setup link.
- `server/order-number.ts`: India timestamp and random order-number suffix.
- `src/ConfirmDialog.tsx`: reusable app confirmation, keyboard focus trap/Escape, busy-state protection.
- `src/App.tsx`: customer menu/cart/tracking/receipt, shared branding.
- `src/Admin.tsx`: staff screens and editors. `src/styles.css`: theme, responsive/print layouts.
- `tests/domain.test.ts`, `tests/api.test.ts`: domain/API tests.
- `tests/ui/cafe77.spec.ts`, `playwright.config.ts`, `scripts/browser-fixture.ts`: isolated browser checks using in-memory database and test-only accounts. Never use fixture credentials as real restaurant accounts.

## Commands

- `npm install`, `npm run dev` (local port 5173)
- `npm run build`, `npm test`
- `npm run format` (Prettier for readable source/config/docs).
- `npm run test:ui` (uses installed Chrome executable by default; CAFE77_BROWSER can override). UI fixture port 5174, in-memory DB; test screenshots in ignored test-results/.
- `npm run staff:create -- owner username` (interactive password), role cashier supported.

## Session continuity

Always update this file after application changes; AGENTS.md instructs future sessions to read it first. No secrets/customer data here.

## Verification / remaining work

Latest update completed: app payment confirmation, timestamp order numbers, owner-only soft-delete endpoints/UI and additive `deleted_at` migration for existing tables/groups/menu. Deleted records filtered from menu/management, rejected during stale checkout, stock/edit and cancelled-order reopening. Historical orders, payment receipts and references are retained. Build and 13 API/domain tests passed, including legacy-schema migration and India date/millisecond formatting. All 3 browser tests passed: owner soft deletion/app confirmation/linked-group protection, mobile customer-to-staff payment flow including cancellation of the Mark as Paid dialog, and cashier availability/role restrictions. Other existing status/refund browser confirmations were outside this request and remain unchanged.

2026-10-03: TypeScript/production build passed; 8 domain/API tests passed, with many assertions for GST math, idempotency, role authorization, status history, close-before-payment protection, duplicate payments, cancel/refund/reopen, snapshots, origin checks and one-time setup.
Both isolated browser tests passed: mobile table checkout → owner status changes → counter payment → receipt/print layout → close/history/dashboard; mobile cashier menu availability controls and restricted navigation. No horizontal overflow at 390px in tested menu/cashier screens. Initial browser checks found toggle hit-target/async-feedback and fixture HMR issues; fixed and verified. Desktop/mobile screenshots and receipt print screenshot visually reviewed. Final API regression and build passed after those fixes. Source formatted with Prettier and final build passed again. Actual local app at localhost:5173 also opened successfully in Chrome with no client errors; local Vite HMR attaches to the same HTTP server. No owner/cashier test credentials or test orders were added to the actual restaurant database. User creates the initial owner with the one-time URL printed by npm run dev (do not store that token here).
Browser tool itself could not initialize due to Windows sandbox helper ACL failure. Used isolated Playwright/installed Chrome fallback after reading browser skill. Shell commands needed escalation for same sandbox initialization problem.
No cloud resources provisioned; no external payment integration, messaging or marketing. Free-tier Cloudflare deploy adapters, object storage, deployment security/CSP/HTTPS, automated backups/restore verification, privacy retention/export and real menu/GSTIN/address/tax/invoice setup remain before live operation. Staff sessions expire after 8 hours; no MFA yet. Dashboard is operational sales reporting, not a full accounting ledger.

### 2026-10-04 public customer testing

User authorized a public site for customer testing. Prepared a free temporary Cloudflare Quick Tunnel after explaining its computer-dependent availability; permanent independent hosting still requires the deferred backend/storage port and hosting account access. This is a temporary testing URL, not a permanent Workers deployment.

Added opt-in `CAFE77_TRUST_LOCAL_PROXY=1` to trust loopback proxies for forwarded HTTPS protocol, secure cookies and same-origin API checks; rate limiting now uses Express's resolved client IP. Default direct local operation still leaves proxy trust disabled. Added `CAFE77_UPLOADS` for isolated upload storage. Regression covers proxy opt-in, secure cookies and rejection of foreign origins.

Built app runs in hidden background Node process at loopback port 5175; cloudflared runs as a hidden background process using HTTP/2. Separate test DB/config/uploads under ignored `data/public-test/`; official cloudflared executable under ignored `data/tools/`. Share origin/table URL files and process IDs are stored in that ignored directory. Owner setup link remains only in local server startup log, no default account created. Original local restaurant database/config were not published. Test config QR base updated to the temporary HTTPS origin. No customer records or credentials recorded here.

Verification: production build passed; all 14 API/domain tests and 3 existing browser tests passed. Public HTTPS page and Table 1 menu returned 200, unauthenticated staff orders returned 401, valid-origin invalid checkout reached schema validation (400). Headless installed Chrome rendered public customer menu at 390x844 with Table 1, no horizontal overflow and no client errors. Screenshot in ignored test directory. No smoke-test orders inserted in the public database.

Unfinished: permanent independent free hosting; production CSP/backups/privacy/real menu/tax readiness listed above. Temporary URL stops when computer sleeps/offline or either process stops, and changes when tunnel restarts. SSE unavailable through Quick Tunnels; existing staff polling fallback remains. See README for runtime environment and restart/stop notes. Do not print permanent QR stickers using this temporary origin.
