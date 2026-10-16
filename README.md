# Cafe77

A local, mobile-friendly table-ordering application for Cafe77. React + TypeScript frontend, Express API and persistent SQLite. Counter payments only; no external services or cloud account required.

## Run locally

Requires Node.js 22.13 or later (verified on 22.15). Node's built-in SQLite may print an experimental warning on Node 22.

```sh
npm install
npm run dev
```

Open http://localhost:5173. On the first run the terminal prints a one-time setup URL; open it to create your owner account. No default staff password exists. Alternatively run `npm run staff:create -- owner yourusername` and enter a password. Create cashier accounts through Staff accounts after owner login.

The initial menu is **sample content**, with original local SVG illustrations. Replace it with Cafe77's real menu/prices/photos. Fifteen table records are seeded with unique QR tokens. Owner → Table QR codes → Open table menu is the easiest way to try customer checkout. Scanning a valid table QR is required to submit an order; `/` allows browsing.

`npm run build` checks TypeScript and builds assets. `npm start` serves the built app locally. `npm test` runs tax/QR tests and isolated API integration tests. `npm run test:ui` runs isolated desktop/mobile browser checks with an in-memory database on port 5174. It uses installed Chrome on Windows; set CAFE77_BROWSER to an alternative Chromium executable if needed.

## Restaurant configuration

Edit `config/restaurant.json` or use Owner → Restaurant settings. CGST and SGST default to **2.5% each**, with tax-inclusive pricing enabled. Both rates support two decimal places and may be configured independently. Inclusive ₹105 = ₹100 taxable + ₹2.50 CGST + ₹2.50 SGST; exclusive ₹100 = ₹105 total. Amounts use integer paise. Inclusive combined tax rounds once, then is allocated between components with any one-paise remainder assigned to SGST so the receipt reconciles exactly. Exclusive tax components round individually. Existing combined-GST order snapshots retain their original GST line and totals; they are not recalculated.

Workers migration `0002_split_gst.sql` updates current D1 restaurant settings to the two new defaults without changing order snapshots. Runtime normalization also handles older settings until that migration is applied. No remote migration or deployment is performed automatically. GSTIN/address/contact still need configuring before live use.

Receipts now show CGST and SGST separately; actual tax applicability, invoice numbering and other Indian tax invoice requirements still need confirmation before live operation.

`qrBaseUrl` defaults to `http://localhost:5173/`. Table tokens are appended as `?table=...`, retaining existing query parameters. To test from a phone, set HOST to `0.0.0.0`, use your computer's LAN address in the QR URL, and permit the port through the firewall. A short domain/link needs a redirect that preserves the query string; this app does not create external short links. Prefer a stable owned domain before printing permanent stickers.

Menu-code search can be disabled. Online UPI is deliberately disabled until a verified provider integration is implemented. Email/phone are optional storage fields; order messages stay inside the app and no external messaging or marketing is sent. Menu items can have optional nutrition text and comma-separated ingredients, each hidden from customers unless its own display checkbox is enabled.

## Staff workflow

- Owner: menu/groups/images/prices, settings, tables/QR printing, users, reporting and all cashier actions.
- Cashier: current/history orders, payment/refund recording, allowed status changes, item availability only.
- Owner/cashier can cancel New, Accepted, InProgress and Ready. Paid cancellation preserves payment. Record a manual full refund only after it actually occurred. Reopening requires available menu items and keeps original order prices.
- Ready → Closed requires full recorded payment and confirmation that the order is served. Closed is terminal.
- Current orders exclude Closed and Cancelled. Cancelled orders remain in history and can be reopened.
- Owner and cashier can create orders from Current orders with the Add order button. Table 1 is selected by default; choose any active table, enter a required customer name and optional phone/email. Search available items by code or name, press Enter or choose a result, or use Today's picks and Dashboard favourites for quick selection; adjust quantities in the selected order list. The staff order dialog can copy the private customer tracking link.
- Customers can message the counter from their order tracking page; staff can read and reply from the order dialog. Unread customer messages highlight Current orders and flash the message icon until staff opens the order. A new staff message shows a fixed customer notification; tapping it scrolls to Messages and marks it read. Messages refresh with the existing five-second polling and stay with the order in history. Existing messages are marked read when the additive read-state migration runs.
- Order history exports all records matching the selected date range and search as an Excel `.xlsx` workbook with order ID, table number, name, item quantity, total, GST, India date/time and status.
- Orders/payment/status events are persistent and audited. Authenticated server events refresh staff lists immediately, with 5-second polling fallback. Customer tracking refreshes every 5 seconds, public menu availability every 15 seconds.
- Dashboard orders count by placed date, sales/top-item quantities by Closed date, in India time. This is a basic operational dashboard, not an accounting ledger; refunds and cancelled payments remain visible on their orders.
- Customer receipt appears after payment; print dialog can save PDF. Owner QR printing supports all tables or one table.
- **Mark as Paid** opens an app confirmation showing the order, table and amount. Cancelling the dialog makes no payment change.
- New order numbers use `c77-yyMMddHHmmssttt-XXXX` (India time, 24-hour clock, milliseconds, four random alphanumeric characters). Existing numbers are preserved.
- Owner can remove tables on the QR page and discontinue menu items/groups. Deletion is soft: records and historical receipts stay in the database. Existing databases receive an additive `deleted_at` migration automatically on startup.
- A group cannot be deleted while **any** item record is linked, including inactive/discontinued items. Discontinuing an item does not unlink its retained record. No physical deletion endpoints exist.
- Removed QR links stop accepting new orders; already submitted orders can still be completed. Re-adding a removed table number creates a fresh QR token and requires printing a new sticker.

## Data and security

Runtime data is in ignored `data/cafe77.sqlite` plus WAL/SHM sidecars and `data/uploads/`. Stop the server before copying the database and uploads for a consistent manual backup; preserve configuration too. Verify restore before relying on backups. There is no automated backup job yet.

Passwords use scrypt + random salt. Session tokens are random, stored hashed, expire after eight hours, and use HttpOnly SameSite Strict cookies (Secure on HTTPS). Server validates roles, stock, amounts, transitions, optimistic versions, and checkout idempotency. APIs enforce same-origin writes and local per-IP rate limits. Customer tracking uses a random 192-bit bearer token; keep links private. Contacts are optional and not verified. No card/bank credentials are collected.

Local host binding is loopback by default. Set `PORT`, `HOST`, `CAFE77_DB`, `CAFE77_CONFIG` as needed. `.env` is not loaded automatically; set environment variables in the shell. Set `CAFE77_UPLOADS` to isolate uploaded images for a testing instance. `CAFE77_TRUST_LOCAL_PROXY=1` opts into trusting loopback reverse proxies for HTTPS detection and client IP rate limits; leave it unset for normal local use, and keep the origin bound to loopback. Production CSP, distributed rate limiting, privacy retention/export, backups and provider payment checks need deployment-specific work.

## Workers/D1 staging backend

The original Express/SQLite server remains available through `npm run dev`. The Workers port is in `workers/`, with the staging-only application configuration in `wrangler.jsonc` and versioned schema in `migrations/`. The actual application and sample menu are deployed at https://cafe77-staging.santhoser.workers.dev. Initial staging migrations are applied. Remote migrations and future deployments still require authorization; the first owner has been created privately and the temporary setup secret removed, with no default accounts. Sign in at https://cafe77-staging.santhoser.workers.dev/admin.

Install dependencies, validate the application and initialize **local D1 only**:

```sh
npm install
npm run build:workers
npm run db:workers:local
```

The build command performs a deployment dry run only. Initial migration creates fifteen tables with random QR tokens, empty menu/user tables, and restaurant settings with the existing development tax value. It never imports the local restaurant database or passwords. To load the optional sample menu into a new, empty local menu:

```sh
node scripts/wrangler-local.mjs d1 execute DB --env staging --local --file cloudflare/seed-demo.sql
```

Generate a random setup token with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Save it privately as `SETUP_TOKEN=...` in `.dev.vars.staging` (ignored by Git), using `.dev.vars.example` as the format reference. Run `npm run dev:workers`, then open `http://localhost:8788/admin?setup=<your-token>` and choose your own owner credentials. There are no default accounts. Owner setup is rejected once an owner exists. Remove the token file/value after successful setup. Set the QR base URL to the local origin through owner settings when testing table links locally.

`npm run test:workers` builds the current Worker and runs SQL contract/concurrency tests plus actual workerd/D1 integration tests. `npm run test:ui:workers` builds and runs the browser flows against actual local workerd/D1 on port 5176. Tests create only isolated temporary databases and test accounts. On Windows, the local launcher copies the bundled workerd executable into ignored `data/tools/` because Windows can deny execution from the npm cache. Wrangler and Miniflare are pinned together.

D1 writes commit in atomic batches with read-snapshot guards, including audit/event records. Conflicting requests retry against fresh state (up to two retries), with stale order versions still rejected. Order reads and line inserts are grouped to avoid per-order/per-item query growth under the Free plan's 50-query invocation limit. Login and write rate limits use hashed client IP keys in D1. Read limits are best-effort per Worker isolate so five-second polling does not consume D1 write allowances.

Restaurant settings and menu image uploads persist in D1. Images keep the existing 2 MiB upload limit and are stored in 256 KiB chunks so no BLOB row exceeds D1's 2,000,000-byte row limit. This uses database storage and read/write allowances; D1 Free currently allows 500 MB per database, 5 GB account-wide. R2 can be considered later if image volume grows, but is not required or provisioned for this port.

Workers passwords use versioned, salted Web Crypto PBKDF2-SHA256 (100,000 iterations, compatible with the hosted Workers ceiling); local scrypt records are not imported. Sessions retain eight-hour expiry, hashed random tokens, HttpOnly/SameSite Strict cookies and Secure on HTTPS. New staging staff must create fresh accounts. Hosted CPU/KDF quotas still need a remote staging smoke test before public use.

Workers staff updates use the existing five-second polling. The authenticated SSE endpoint returns 204 so EventSource stops reconnecting; cross-isolate push delivery would require additional coordination infrastructure. Counter-only payments, server-side permissions/transitions, soft deletion, privacy filtering and integer-paise totals remain enforced.

For a new environment or subsequent authorized deployment: run all local checks, apply staging migrations explicitly, optionally load demo menu data, set a fresh private staging setup secret, deploy the application, create the owner, remove the setup secret, and verify the hosted authentication/checkout/payment/receipt flow. Production resources, real menu/tax configuration, backup/restore and privacy retention remain separate unfinished work.

## Project memory

Read `memory.md` for agreed scope and latest implementation status. `AGENTS.md` requires every future project session to update memory whenever application/configuration/setup/tests change. Do not write secrets or customer information into it.

## Public customer testing (2026-10-04)

A free temporary Cloudflare Quick Tunnel exposes the built app on loopback port 5175. This is a computer-hosted testing instance, not an independently hosted Workers deployment. Keep this computer awake and connected; stopping either process ends availability, and restarting the tunnel gives a new URL. Quick Tunnels do not deliver SSE, so staff screens use the existing five-second polling fallback.

The isolated database, configuration, uploads, process IDs and logs are in ignored `data/public-test/`. The current shareable Table 1 URL is in `data/public-test/customer-url.txt`; the origin URL is in `url.txt`. The owner setup link is printed only in the local `server.log`; use it privately to choose an owner username and password. Do not share that setup link with customers. The testing instance has sample menu data and development tax settings.

The official downloaded tunnel executable is at ignored `data/tools/cloudflared.exe`. The test server runs `node --import tsx server/index.ts --production` with `PORT=5175`, `HOST=127.0.0.1`, `CAFE77_DB=data/public-test/cafe77.sqlite`, `CAFE77_CONFIG=data/public-test/restaurant.json`, `CAFE77_UPLOADS=data/public-test/uploads`, and `CAFE77_TRUST_LOCAL_PROXY=1`. The tunnel runs `cloudflared tunnel --url http://127.0.0.1:5175 --no-autoupdate --protocol http2`. After restarting it, update the test configuration's `qrBaseUrl` to the new HTTPS origin before sharing QR links.

To stop sharing, stop the cloudflared process identified in `data/public-test/tunnel.pid`; then stop the Node process identified in `server.pid` if no longer needed. Check process identity before stopping stored PIDs, since Windows can reuse them.
