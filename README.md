# Cafe77

A local, mobile-friendly table-ordering application for Cafe77. React + TypeScript frontend, Express API and persistent SQLite. Counter payments only; no external services or cloud account required.

## Run locally

Requires Node.js 22.13 or later (verified on 22.15). Node's built-in SQLite may print an experimental warning on Node 22.

```sh
npm install
npm run dev
```

Open http://localhost:5173. When the first owner or admin is missing, the terminal prints separate one-time setup URLs. Use them privately to create each account with a password of 8–128 characters. No default staff password exists. Alternatively run `npm run staff:create -- admin|owner|cashier yourusername` and enter a password. Owners can create other owners and cashiers; admins can also create admins and reset owner passwords. Owner accounts cannot see or manage admin accounts.

Fresh databases start with **228 items in 25 groups from Item_Details_Report.xlsx**, with the supplied sell prices converted to integer paise. Numbered categories determine group order; item codes `I001`–`I228` come from the report's serial numbers. Names are preserved with surrounding whitespace removed. Eight today's picks and twelve dashboard favourites are selected initially and remain editable. Original cartoon-style SVG food illustrations in `public/illustrations/menu/` match the warm colours and flat artwork of the original Cafe77 menu. Each item has its own illustration, with matching group covers. Fifteen table records are seeded with unique QR tokens. Owner → Table QR codes → Open table menu is the easiest way to try customer checkout. Scanning a valid table QR is required to submit an order; `/` allows browsing.

The reviewed catalogue is `shared/menu-catalogue.json`. Run `node scripts/generate-menu-illustrations.mjs` to regenerate item/group artwork, then `node scripts/build-menu-seed.mjs` to update the menu portion of the existing `0001_cafe77.sql` baseline. The baseline has now been deployed; preserve it and use additive migrations for subsequent database changes. The local Express seed reads the same catalogue. Startup never overwrites an existing menu. For a fresh local Express instance, set `CAFE77_DB` to a new path before starting the server; do not remove a database while the server is running.

`npm run build` checks TypeScript and builds assets. `npm start` serves the built app locally. `npm test` runs tax/QR tests and isolated API integration tests. `npm run test:ui` runs isolated desktop/mobile browser checks with an in-memory database on port 5174. It uses installed Chrome on Windows; set CAFE77_BROWSER to an alternative Chromium executable if needed.

## Restaurant configuration

Edit `config/restaurant.json` or use Owner → Restaurant settings. CGST and SGST default to **2.5% each**, with tax-inclusive pricing enabled. Both rates support two decimal places and may be configured independently. Inclusive ₹105 = ₹100 taxable + ₹2.50 CGST + ₹2.50 SGST; exclusive ₹100 = ₹105 total. Amounts use integer paise. Inclusive combined tax rounds once, then is allocated between components with any one-paise remainder assigned to SGST so the receipt reconciles exactly. Exclusive tax components round individually. Existing combined-GST order snapshots retain their original GST line and totals; they are not recalculated.

The fresh D1 baseline seeds both rates at 2.5%. Runtime normalization retains support for historical receipt snapshots. No remote migration or deployment is performed automatically. GSTIN/address/contact still need configuring before live use.

Receipts now show CGST and SGST separately; actual tax applicability, invoice numbering and other Indian tax invoice requirements still need confirmation before live operation.

`qrBaseUrl` defaults to `http://localhost:5173/`. Table tokens are appended as `?table=...`, retaining existing query parameters. To test from a phone, set HOST to `0.0.0.0`, use your computer's LAN address in the QR URL, and permit the port through the firewall. A short domain/link needs a redirect that preserves the query string; this app does not create external short links. Prefer a stable owned domain before printing permanent stickers.

Menu-code search can be disabled. Online UPI is deliberately disabled until a verified provider integration is implemented. QR phone is required (ten digits); counter phone and all email fields are optional; order messages stay inside the app and no external messaging or marketing is sent. Menu items can have optional nutrition text and comma-separated ingredients, each hidden from customers unless its own display checkbox is enabled.

## Staff workflow

- Admin: all owner controls, including owner creation and password resets, plus admin account management.
- Owner: menu/groups/images/prices, settings, tables/QR printing, owner/cashier users, reporting and all cashier actions. Admin accounts are hidden.
- Cashier: current/history orders, payment/refund recording, allowed status changes, item availability only.
- Manage menu filters the loaded list as you type by item name, code or tag. Combine stock (in/out), active/inactive, today's special and dashboard favourite filters; items must match all selected filters. Matching counts, an empty-results message and Clear filters are provided. Groups without matching items are hidden while filtering; clearing restores all groups, including empty groups. Filters are available to all staff without changing editing permissions.
- Owner/cashier can cancel New, Accepted, InProgress and Ready. Paid cancellation preserves payment. Record a manual full refund only after it actually occurred. Reopening requires available menu items and keeps original order prices.
- “In progress” is now labelled **Preparing** throughout the app and reports. Existing stored `InProgress` values remain compatible.
- On a Ready order, **Complete Order** opens a payment confirmation. Choose **Cash** or **UPI** and confirm that payment was received and the order served. The server records any outstanding payment and closes the order atomically. Closed is terminal. UPI here records a payment received at the counter; it does not initiate an online payment.
- Current orders exclude Closed and Cancelled. Cancelled orders remain in history and can be reopened.
- On Current orders, click **Enable sound alerts** once to allow browser audio and hear a test bell. A short bell then alerts the counter to new orders and customer messages, including orders outside the displayed page. Existing orders/messages do not ring on page entry; staff replies, read receipts and unchanged refreshes do not ring. **Mute sound alerts** silences alerts. Monitoring stops outside Current orders; keep the page open and the device volume audible. Alerts use five-second polling with immediate refresh from Express server events when available.
- Owner and cashier can create orders from Current orders with the Add order button. Table 1 is selected by default; choose any active table, enter a required customer name and optional phone/email. Search available items by code or name, press Enter or choose a result, or use Today's picks and Dashboard favourites for quick selection; adjust quantities in the selected order list. The staff order dialog can copy the private customer tracking link.
- Customers can message the counter from their order tracking page; staff can read and reply from the order dialog. Unread customer messages highlight Current orders and flash the message icon until staff opens the order. A new staff message shows a fixed customer notification; tapping it scrolls to Messages and marks it read. Messages refresh with the existing five-second polling and stay with the order in history.
- Order history has a payment-mode filter (Cash, UPI, or not recorded/unpaid) alongside the existing date/search filters and Closed/Cancelled status checkboxes. Its Excel `.xlsx` export applies all filters and includes separate **CGST** and **SGST**, payment mode and order type. Historical receipts with only combined tax retain their original snapshots; unavailable CGST/SGST export cells are blank rather than estimated.
- Orders/payment/status events are persistent and audited. Authenticated server events refresh staff lists immediately, with 5-second polling fallback. Customer tracking refreshes every 5 seconds, public menu availability every 15 seconds.
- Dashboard orders count by placed date, sales/top-item quantities by Closed date, in India time. This is a basic operational dashboard, not an accounting ledger; refunds and cancelled payments remain visible on their orders.
- Customer receipt appears after payment; print dialog can save PDF. Owner QR printing supports all tables or one table.
- QR checkout requires a **10 digit phone number**; counter orders can omit it, but a supplied number must have ten digits. Both forms offer **Dine-in** (default) and **Take-away**, retained on the order, tracking page and receipt.
- Current order rows have a prominent status-coloured stripe, table marker and background: New amber, Accepted blue, Preparing purple and Ready green. Text status labels remain visible, and unread-message highlighting preserves the status colour.
- New order numbers use `c77-yyMMddHHmmssttt-XXXX` (India time, 24-hour clock, milliseconds, four random alphanumeric characters). Existing numbers are preserved.
- Owner can remove tables on the QR page and discontinue menu items/groups. Deletion is soft: records and historical receipts stay in the database. Existing databases receive an additive `deleted_at` migration automatically on startup.
- A group cannot be deleted while **any** item record is linked, including inactive/discontinued items. Discontinuing an item does not unlink its retained record. No physical deletion endpoints exist.
- Removed QR links stop accepting new orders; already submitted orders can still be completed. Re-adding a removed table number creates a fresh QR token and requires printing a new sticker.

## Data and security

Runtime data is in ignored `data/cafe77.sqlite` plus WAL/SHM sidecars and `data/uploads/`. Stop the server before copying the database and uploads for a consistent manual backup; preserve configuration too. Verify restore before relying on backups. There is no automated backup job yet.

Passwords use scrypt + random salt. Session tokens are random, stored hashed, expire after eight hours, and use HttpOnly SameSite Strict cookies (Secure on HTTPS). Server validates roles, stock, amounts, transitions, optimistic versions, and checkout idempotency. APIs enforce same-origin writes and local per-IP rate limits. Customer tracking uses a random 192-bit bearer token; keep links private. Contacts are optional and not verified. No card/bank credentials are collected.

Local host binding is loopback by default. Set `PORT`, `HOST`, `CAFE77_DB`, `CAFE77_CONFIG` as needed. `.env` is not loaded automatically; set environment variables in the shell. Set `CAFE77_UPLOADS` to isolate uploaded images for a testing instance. `CAFE77_TRUST_LOCAL_PROXY=1` opts into trusting loopback reverse proxies for HTTPS detection and client IP rate limits; leave it unset for normal local use, and keep the origin bound to loopback. Production CSP, distributed rate limiting, privacy retention/export, backups and provider payment checks need deployment-specific work.

## Workers/D1 staging backend

The Express/SQLite server remains available through `npm run dev`. The Workers port is in `workers/`, with staging configuration in `wrangler.jsonc`. The migration history was rebuilt for a from-scratch installation: **`migrations/0001_cafe77.sql` is the fresh baseline**, containing the complete current schema, restaurant settings, table QR records and imported menu. Additive `0002_order_checkout.sql` adds order type and payment-mode tracking to an existing installation; apply both migrations for a fresh database. No staff accounts are seeded. This baseline requires a new empty D1 database; replacing only the Worker does not reset its database. Before a separately authorized redeployment, update the staging database binding to the newly created database ID and set the restaurant QR base URL to the final origin. Existing hosted resources and local databases have not been reset by this rebuild.

Install dependencies, validate the application and initialize **local D1 only**:

```sh
npm install
npm run build:workers
node scripts/wrangler-local.mjs d1 migrations apply DB --env staging --local --persist-to data/d1-rebuild
```

The build command performs a deployment dry run only. The new local persistence directory isolates the fresh baseline from an older local D1 database. Use the same directory when running it:

```sh
node scripts/wrangler-local.mjs dev --env staging --local --port 8788 --persist-to data/d1-rebuild
```

Generate a random setup token with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Save it privately as `SETUP_TOKEN=...` in `.dev.vars.staging` (ignored by Git), using `.dev.vars.example` as the format reference. Start local Workers with the command above, then open `http://localhost:8788/admin?setup=<your-token>` to create the first owner or `http://localhost:8788/admin?setup-admin=<your-token>` to create the first admin. Each setup path works only once for its role. Remove the token file/value after setup. Set the QR base URL through owner settings before printing table links.

`npm run test:workers` builds the current Worker and runs SQL contract/concurrency tests plus actual workerd/D1 integration tests. `npm run test:ui:workers` builds and runs the browser flows against actual local workerd/D1 on port 5176. Tests create only isolated temporary databases and test accounts. On Windows, the local launcher copies the bundled workerd executable into ignored `data/tools/` because Windows can deny execution from the npm cache. Wrangler and Miniflare are pinned together.

D1 writes commit in atomic batches with read-snapshot guards, including audit/event records. Conflicting requests retry against fresh state (up to two retries), with stale order versions still rejected. Order reads and line inserts are grouped to avoid per-order/per-item query growth under the Free plan's 50-query invocation limit. Login and write rate limits use hashed client IP keys in D1. Read limits are best-effort per Worker isolate so five-second polling does not consume D1 write allowances.

Restaurant settings and menu image uploads persist in D1. Images keep the existing 2 MiB upload limit and are stored in 256 KiB chunks so no BLOB row exceeds D1's 2,000,000-byte row limit. This uses database storage and read/write allowances; D1 Free currently allows 500 MB per database, 5 GB account-wide. R2 can be considered later if image volume grows, but is not required or provisioned for this port.

Workers passwords use versioned, salted Web Crypto PBKDF2-SHA256 (100,000 iterations, compatible with the hosted Workers ceiling); local scrypt records are not imported. Sessions retain eight-hour expiry, hashed random tokens, HttpOnly/SameSite Strict cookies and Secure on HTTPS. New staging staff must create fresh accounts. Hosted CPU/KDF quotas still need a remote staging smoke test before public use.

Workers staff updates use the existing five-second polling. The authenticated SSE endpoint returns 204 so EventSource stops reconnecting; cross-isolate push delivery would require additional coordination infrastructure. Counter-only payments, server-side permissions/transitions, soft deletion, privacy filtering and integer-paise totals remain enforced.

For a new authorized deployment: run all local checks, create a new empty D1 database, update the binding, apply all pending migrations explicitly, set a fresh private setup secret, deploy the application, create staff accounts, remove the setup secret, configure the final QR URL and verify hosted authentication/checkout/payment/receipt flows. The menu is already included; no extra seed command is needed. Production resources, tax/contact configuration, backup/restore and privacy retention remain separate unfinished work.

## Project memory

Read `memory.md` for agreed scope and latest implementation status. `AGENTS.md` requires every future project session to update memory whenever application/configuration/setup/tests change. Do not write secrets or customer information into it.

## Optional temporary public testing

A free Cloudflare Quick Tunnel can expose an isolated local test instance. It depends on the computer remaining awake/online, stops with the local processes and gets a new URL when restarted. Quick Tunnels do not deliver SSE; staff screens have a polling fallback. No tunnel was started as part of the migration rebuild.

Earlier testing files may remain in ignored `data/public-test/`; their saved URLs/process IDs are historical and must not be assumed active. Use a fresh database/configuration/uploads path for a rebuilt test instance, create staff privately and set its QR base URL to the new tunnel origin. Do not print permanent QR stickers from a temporary URL.

For an explicitly authorized tunnel test, bind the isolated server to loopback, set `CAFE77_TRUST_LOCAL_PROXY=1` and use the selected local port in the cloudflared URL. Keep the one-time staff setup link private.

Check process identity before stopping any stored PID, since Windows can reuse process IDs.
