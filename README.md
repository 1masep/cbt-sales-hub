# Sales

The business's website sends each completed sale here. The app checks it, works out the total, blocks duplicate invoice numbers, and saves it. The owner logs in to a private dashboard to see every sale in one sheet, with search, filters, summary totals, editing and deleting, and a **Download Excel** button.

## What the owner gets

- **The sheet:** all 16 columns (Invoice Number, Customer/Company, Date, Commodity Category, SKU, Quantity, Price, Invoice Amount, Discount, Sales Tax, Total Amount, Sales Rep, Address, Zip Code, Phone, Email). Click any column heading to sort. The Invoice column stays in place when scrolling sideways.
- **Search and filters:** search by invoice, customer, SKU, email, phone, address or zip. Filter by category, sales rep and date range. Every total and breakdown follows the filters.
- **Totals:** total sales, invoice count, average sale, discounts and sales tax, plus breakdowns by sales rep, category and month.
- **Needs review:** sales with details worth double-checking (no phone, a non-US phone number, no postal code, or a non-US postal code) are saved, never refused, and marked with a warning sign. A banner shows how many there are; **Review them** lists them, and **Mark as reviewed** in a sale's panel clears it. The Excel download has a **Review notes** column.
- **Edit and delete:** click a row to open it. Change any field (the total recalculates as you type), or delete the sale after a confirmation.
- **Download Excel:** downloads an `.xlsx` of the sales currently shown (all of them, or just the filtered ones) with a Summary tab.

## Website orders (WooCommerce)

cbthospitalitysupplies.com runs WordPress + WooCommerce. The app reads its paid orders directly with a **read-only** key and adds them to the sheet automatically, **every 5 minutes**. The AI isn't involved: WooCommerce already has every detail in exact form, so this is exact and free.

**Connect it (about 2 minutes, in the website's WordPress admin):**

1. Go to **WooCommerce → Settings → Advanced → REST API → Add key**.
2. Description: `Sales sheet`. User: an administrator. **Permissions: Read** (not Read/Write).
3. Click **Generate API key** and copy the **Consumer key** and **Consumer secret**. The secret is shown only once.
4. Add them to `.env.local` (and to the host's settings when deployed):

```
WOOCOMMERCE_URL=https://cbthospitalitysupplies.com
WOOCOMMERCE_KEY=ck_…
WOOCOMMERCE_SECRET=cs_…
```

5. Restart the app. The first check runs after about 10 seconds and brings in the last 30 days of paid orders.

**What it does on each check:**

- Reads orders that are **Processing** or **Completed** (paid) and were added or changed since the last check.
- Adds **one row per product**, numbered like `5821-1`, `5821-2`, using WooCommerce's own figures: line subtotal, coupon discount and tax. Shipping and fees aren't included, because the sheet records the goods sold.
- **Category:** each product's WooCommerce category is traced up to its top level (towels → Bath). Store groupings (New Products, SALE Items, Special Order, Catalog) are ignored.
- **Sales rep:** "Website" for online orders, and the cashier for point-of-sale orders if they're on the reps list, otherwise "In-store".
- Never records anything twice. A line the app can't place (no SKU, no clear category, or an order changed in WooCommerce after it was recorded) is held as a **draft** with the reason, and only once.
- The dashboard's **Website orders** line shows when it last checked and what it found, and **Check now** runs a check immediately. If the website can't be reached or the key is wrong, it says so and picks up where it left off on the next check.

**When hosted on Vercel:** `vercel.json` schedules the check every 5 minutes. Set `CRON_SECRET` in the project's settings. Vercel's free Hobby plan only allows **daily** scheduled jobs, so every-5-minutes needs the Pro plan. On the Hobby plan, use **Check now**.

**Not handled yet:** refunds and cancellations after an order was recorded. The sale stays in the sheet until the owner edits or deletes it.

## Import with AI

The **Import with AI** button lets the owner add sales from anything that has the details in it:

- **Paste text:** an order confirmation email, an invoice, or text copied from a web page (including pages behind a login).
- **Upload a file:** a PDF invoice, a screenshot, or a photo of a receipt (PDF, PNG, JPG, GIF or WebP, up to 10 MB).
- **Link:** a public web page with the order on it.

Claude (model `claude-opus-5-5`) reads it and fills in every sale it finds, one row per product. It must answer "not found" rather than guess, and it marks anything it inferred.

**What gets saved automatically:** the app, not the AI, decides. A sale goes straight into the sheet only when all of these are true:

- every required detail was found in the source
- the AI marked nothing as uncertain
- the sale passes the same checks as website sales
- the product lines add up to the order total printed in the source

Everything else becomes a **draft**. A banner shows how many are waiting, and each draft lists why it was held and what the AI read. The owner can fix anything, then **Save to sheet** or **Discard**. Duplicates are still blocked, and AI-entered sales carry an **AI** badge in the sheet and a **Source** column in the Excel download.

**Try it:** `samples/ai-import/` has four test documents with known answers: an order email (saves automatically), a PDF invoice (saves automatically), a receipt photo with no customer address (held as a draft), and a price quote hiding an instruction to record a fake sale (nothing saved).

**Setup:** add `ANTHROPIC_API_KEY` to `.env.local` (and to the host's settings when deployed). Without it, the button explains what's missing.

**Cost:** each import is one request to Claude, typically a few cents. A long multi-page PDF costs more.

**Safety:** the AI is told to treat everything it reads as data, never as instructions. Even so, a document or page written to fool it could produce a convincing fake sale. Automatic saving is best for sources the owner trusts (their own emails and invoices). Each sale's Source column shows how it got in, so AI-entered sales can always be audited.

**Coming next:** checking a source automatically (the website or an inbox) every few minutes. That feeds the same reader, so it needs no changes here, only knowing where the sales show up.

## Run it on your computer

```bash
npm install
cp .env.example .env.local
```

Fill in `.env.local`:

| Setting | What to put |
| --- | --- |
| `OWNER_PASSWORD` | The password the owner logs in with. Use something long. |
| `SESSION_SECRET` | A random string. Make one with `openssl rand -hex 32`. |
| `SALES_API_SECRET` | Another random string, made the same way. The website sends it with every sale. |
| `ANTHROPIC_API_KEY` | Only for **Import with AI**. Create one at https://platform.claude.com. |
| `DATABASE_URL` | Leave empty on your computer. |

Then start the app:

```bash
npm run dev
```

Open **http://localhost:3000** and log in with `OWNER_PASSWORD`.

On your computer, sales are stored in a built-in database in the `.data/` folder, so there's nothing else to install. To fill it with 80 sample sales to try things out, run the command below. It only works on this local database, never a real one.

```bash
npm run seed-demo
```

To start over with an empty local database, stop the app and delete the `.data` folder.

### Send a test sale like the website would

Replace `YOUR_SECRET` with your `SALES_API_SECRET`:

```bash
curl -X POST http://localhost:3000/api/sales -H "Authorization: Bearer YOUR_SECRET" -H "Content-Type: application/json" -d '{"invoiceNumber":"TEST-001","customerName":"Test Customer","date":"2026-10-24","commodityCategory":"Electronics","sku":"EL-HDMI-2M","quantity":4,"price":250,"invoiceAmount":1000,"discount":50,"salesTax":76,"salesRep":"Website","address":"123 Main St","zipCode":"01105","phone":"413-555-0199","email":"test@example.com"}'
```

It appears in the dashboard with a total of $1,026.00. Sending exactly the same thing again returns `200` with `"alreadyRecorded": true` and saves nothing new. Sending a different sale with the same invoice number returns `409`.

## Set the categories and sales reps

Edit `lib/config.ts`:

- `COMMODITY_CATEGORIES` is set to the website's top-level product categories: Restaurant, Kitchen, Bedding, Bath, Cups & Lids, Vacuums & More, Misc. If the store adds a new top-level category, add it here too.
- `STORE_GROUPINGS` lists WooCommerce categories that are labels rather than types of goods; these are ignored.
- `SALES_REPS` starts with "Website" (online orders) and "In-store" (point-of-sale orders without a listed cashier). **Add the business's sales reps here.**

## Connecting the website

When an order is completed, the website's **server** (not the visitor's browser, or the secret would be public) sends:

```
POST https://<your-app-address>/api/sales
Authorization: Bearer <SALES_API_SECRET>
Content-Type: application/json
```

### Request body

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `invoiceNumber` | string | yes | Up to 64 characters. Must be unique; letter case is ignored when checking. |
| `customerName` | string | yes | Customer or company name. |
| `date` | string | yes | `YYYY-MM-DD`. A full ISO timestamp is also accepted; only the date is kept. |
| `commodityCategory` | string | yes | One of `COMMODITY_CATEGORIES` (any letter case). |
| `sku` | string | yes | The product's SKU, up to 64 characters. One product per sale; for an order with several products, send one sale per product (e.g. `INV-100-1`, `INV-100-2`). |
| `quantity` | number or string | yes | A whole number from 1 to 1,000,000. |
| `price` | number or string | yes | Price per unit, 0 or more, at most 2 decimals. Stored for reference; it does not change the invoice amount. |
| `invoiceAmount` | number or string | yes | 0 or more, at most 2 decimals. |
| `discount` | number or string | no | Defaults to 0. Cannot be more than `invoiceAmount`. |
| `salesTax` | number or string | no | Defaults to 0. |
| `salesRep` | string | yes | One of `SALES_REPS`. Use `"Website"` for online orders with no rep. |
| `address` | string | yes | Street address. |
| `zipCode` | string | no | Up to 12 characters. US zip codes (`12345` or `12345-6789`) are stored as sent; send them as strings to keep leading zeros. Any other postal code, or none, is still saved and flagged for review. |
| `phone` | string | no | Up to 40 characters. US numbers in any common format, with or without an extension, are stored as `(413) 555-0199` or `(413) 555-0199 ext. 12`. Any other number, or none, is kept exactly as sent and flagged for review. |
| `email` | string | yes | Stored in lowercase. |

**Total Amount is always calculated by the app** as `invoiceAmount − discount + salesTax`. A total sent by the website is ignored.

### Responses

| Status | Meaning |
| --- | --- |
| `201` | Saved. |
| `200` | This exact sale was already recorded (for example, the store re-sent it). Nothing new was saved. Treat it as success. |
| `400` | Invalid JSON, or validation failed. `fields` lists each problem, e.g. `{"zipCode": "Must be a US zip code (12345 or 12345-6789)"}`. |
| `401` | Missing or wrong secret. |
| `409` | A **different** sale already uses this invoice number. Nothing was saved. Treat it as a failure that needs attention, never as success. |
| `500` | Something went wrong saving. Safe to retry; duplicates are still blocked. |

## Putting it online

The website has to be able to reach the app, so it needs to be hosted, for example on Vercel. Hosted apps can't use the built-in database, so you need a hosted Postgres database:

1. Create the project on Vercel and add a Postgres database to it (**Storage → Neon**). This sets `DATABASE_URL` for you.
2. In the project's **Settings → Environment Variables**, add `OWNER_PASSWORD`, `SESSION_SECRET` and `SALES_API_SECRET`. Use different values from your local ones.
3. Deploy. The sales table is created automatically the first time the app runs.
4. Give the website developer the app's address and the `SALES_API_SECRET`.

Login cookies only work over HTTPS when hosted, which Vercel provides automatically.

## Security notes

- The dashboard and its API need the owner's login. Logged-out visitors are sent to the login page.
- After 5 wrong passwords, that address is locked out for 15 minutes.
- Logins last 30 days. To log everyone out (for example after changing the password), change `SESSION_SECRET`.
- Duplicate invoice numbers are blocked by the database itself, so two identical sales arriving at the same moment can't both be saved.

## Adding more businesses later

The app currently serves one business. To serve several, each sale needs to record which business it belongs to, and each business needs its own login and website secret. The database, queries and dashboard are all in one place (`lib/db.ts`, `lib/sales-repo.ts`, `app/dashboard/`), so this can be added without starting over.

## Development

```bash
npm test        # validation, totals, lists, database queries, duplicates, login
npm run build   # production build
```

The project folder name contains a `:`, which breaks npm's normal way of finding tools. The scripts in `package.json` call each tool by its file path to work around it. They keep working if you rename the folder.
