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

Edit `config/restaurant.json` or use Owner → Restaurant settings. Changes apply to new orders. With manual file edits, refresh the page to see changes. GST rate defaults to **10% for development**; inclusive defaults true. GSTIN/address/contact start blank; fill them before live use. Rate is configurable to two decimal places. Tax rounds once per order to nearest paise; taxable + GST always reconciles to total. Inclusive ₹110 at 10% => ₹100 base + ₹10 GST. Exclusive => ₹110 base + ₹11 GST = ₹121.

The generic GST line is a development receipt, not a validated Indian GST tax invoice (CGST/SGST/IGST split, actual rate and invoice numbering must be confirmed before live operation).

`qrBaseUrl` defaults to `http://localhost:5173/`. Table tokens are appended as `?table=...`, retaining existing query parameters. To test from a phone, set HOST to `0.0.0.0`, use your computer's LAN address in the QR URL, and permit the port through the firewall. A short domain/link needs a redirect that preserves the query string; this app does not create external short links. Prefer a stable owned domain before printing permanent stickers.

Menu-code search can be disabled. Online UPI is deliberately disabled until a verified provider integration is implemented. Email/phone are optional storage fields; no messages or marketing are sent.

## Staff workflow

- Owner: menu/groups/images/prices, settings, tables/QR printing, users, reporting and all cashier actions.
- Cashier: current/history orders, payment/refund recording, allowed status changes, item availability only.
- Owner/cashier can cancel New, Accepted, InProgress and Ready. Paid cancellation preserves payment. Record a manual full refund only after it actually occurred. Reopening requires available menu items and keeps original order prices.
- Ready → Closed requires full recorded payment and confirmation that the order is served. Closed is terminal.
- Current orders exclude Closed and Cancelled. Cancelled orders remain in history and can be reopened.
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

## Cloudflare later

No cloud resources have been created. Express/node:sqlite is the local implementation; deployment to Workers requires a Workers request adapter, D1 storage adapter/migrations and an image-storage solution. Separate staging/production, free-tier quotas and deployment authorization are mandatory before that work. Do not deploy the local server unchanged to Workers.

## Project memory

Read `memory.md` for agreed scope and latest implementation status. `AGENTS.md` requires every future project session to update memory whenever application/configuration/setup/tests change. Do not write secrets or customer information into it.

## Public customer testing (2026-10-04)

A free temporary Cloudflare Quick Tunnel exposes the built app on loopback port 5175. This is a computer-hosted testing instance, not an independently hosted Workers deployment. Keep this computer awake and connected; stopping either process ends availability, and restarting the tunnel gives a new URL. Quick Tunnels do not deliver SSE, so staff screens use the existing five-second polling fallback.

The isolated database, configuration, uploads, process IDs and logs are in ignored `data/public-test/`. The current shareable Table 1 URL is in `data/public-test/customer-url.txt`; the origin URL is in `url.txt`. The owner setup link is printed only in the local `server.log`; use it privately to choose an owner username and password. Do not share that setup link with customers. The testing instance has sample menu data and development tax settings.

The official downloaded tunnel executable is at ignored `data/tools/cloudflared.exe`. The test server runs `node --import tsx server/index.ts --production` with `PORT=5175`, `HOST=127.0.0.1`, `CAFE77_DB=data/public-test/cafe77.sqlite`, `CAFE77_CONFIG=data/public-test/restaurant.json`, `CAFE77_UPLOADS=data/public-test/uploads`, and `CAFE77_TRUST_LOCAL_PROXY=1`. The tunnel runs `cloudflared tunnel --url http://127.0.0.1:5175 --no-autoupdate --protocol http2`. After restarting it, update the test configuration's `qrBaseUrl` to the new HTTPS origin before sharing QR links.

To stop sharing, stop the cloudflared process identified in `data/public-test/tunnel.pid`; then stop the Node process identified in `server.pid` if no longer needed. Check process identity before stopping stored PIDs, since Windows can reuse them.
