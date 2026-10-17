# Joomni CSV Product Import

Bulk-import products into your [Joomni](https://joomni.com) store from a spreadsheet or a **Shopify product export**. It checks every row first, shows you exactly what will happen, and writes a report you can open in Excel or Google Sheets.

[![ci](https://github.com/joomni225/joomni-csv-product-import/actions/workflows/ci.yml/badge.svg)](https://github.com/joomni225/joomni-csv-product-import/actions/workflows/ci.yml)

```text
$ joomni-import products.csv

joomni-import · products.csv (shopify format, 148 rows → 52 products)

  + 47 to create
  – 3 skipped: already in your store (add --update to update them)
  ✗ 2 with errors (not sent)

  error   line 31  Linen Shirt: Missing a value for option "Size"
  error   line 88  Water Bottle: Price "abc" isn't a number

Dry run: nothing was changed. Run again with --apply to import.
Report: import-report-20261017-153012.csv
```

- **Safe by default.** Without `--apply` nothing is sent; you get the plan and a report.
- **Variants and options:** sizes, colours, materials, up to three options per product.
- **Shopify exports work as they are.** The format is detected from the headers.
- **Errors point at spreadsheet lines,** so you can fix them in the file.
- **Run it as often as you like.** Products already in the store are matched by handle, then SKU, and skipped. With `--update` they're updated instead.
- **No dependencies.** Node.js 18 or newer.

## Quick start

1. In your Joomni dashboard open **Settings › API & Webhooks › API keys** and create a key with the scopes **`products:read`** and **`products:write`**.
2. Fill in [`templates/products-template.csv`](templates/products-template.csv), or export products from Shopify (**Products › Export › All products › CSV for Excel**).
3. Run:

```bash
export JOOMNI_API_KEY=jk_live_your_key_here     # Windows PowerShell: $env:JOOMNI_API_KEY="jk_live_..."

npx github:joomni225/joomni-csv-product-import products.csv            # dry run
npx github:joomni225/joomni-csv-product-import products.csv --apply    # import
```

Or clone the repo, copy `.env.example` to `.env`, and run `node --env-file=.env bin/joomni-import.js products.csv` (Node 20.6+ reads the key from the file).

New products are created as **drafts** unless your file has a `status` column or you pass `--status active`, so you can review them in **Catalog › Products** before they go on sale.

## Options

| Option | |
|---|---|
| `--apply` | Import for real. Without it, nothing changes |
| `--update` | Update products that already exist instead of skipping them |
| `--status draft\|active\|archived` | Status for new products whose row has no status. Default `draft` |
| `--format joomni\|shopify` | Force a format (detected automatically) |
| `--report <file>` | Report path. Default `import-report-<time>.csv` |
| `--offline` | Check the file only; don't contact Joomni (no key needed) |
| `--api-url <url>` | For a self-hosted or local Joomni server |

Exit codes: `0` everything imported or planned · `1` some products had errors or failed · `2` couldn't run (missing file, bad key).

## The CSV format

One row per product, or several rows sharing a `handle` for a product with variants. Column names are case-insensitive; `Compare at price`, `compare-at-price` and `compare_at_price` all work.

| Column | |
|---|---|
| `handle` | URL slug. Rows with the same handle are one product. If empty, one is made from the title |
| `title` | **Required** on the first row of a product |
| `description` | HTML or plain text |
| `price` | **Required**. In your store currency. `1,200.50` is fine; `Rs 500` isn't |
| `compare_at_price` | "Was" price, shown struck through |
| `cost_per_item` | Your cost; never shown to buyers |
| `sku`, `barcode` | Per variant |
| `inventory` | Stock, per variant |
| `track_inventory` | `yes` / `no`. Defaults to yes when any row has an inventory |
| `inventory_policy` | `deny` (stop selling at 0) or `continue` (allow backorders) |
| `status` | `active`, `draft` or `archived` |
| `vendor`, `product_type` | |
| `tags` | Comma-separated, up to 20 |
| `images` | Image URLs separated by `\|`, up to 10 per product. Rows with only an image add it to the product |
| `seo_title`, `seo_description` | |
| `option1_name` … `option3_name` | On the first row, e.g. `Size`, `Colour` |
| `option1_value` … `option3_value` | On every variant row, e.g. `M`, `Red` |
| `variant_image` | Image URL for that variant |

Products with variants: the first row holds the product (title, description, images…) **and** the first variant. Each further row needs the handle and its option values; leave a variant's `price` empty to use the first row's.

```csv
handle,title,price,sku,inventory,option1_name,option1_value,option2_name,option2_value
cotton-tee,Organic Cotton Tee,1800,TEE-S-WHT,12,Size,S,Colour,White
cotton-tee,,1800,TEE-M-WHT,8,,M,,White
cotton-tee,,1900,TEE-L-BLK,0,,L,,Black
```

### From Shopify

Export with **Products › Export › All products › CSV for Excel** and pass the file as it is. Mapped: title, description, vendor, type, tags, status (or Published), options, variant SKU, barcode, price, compare-at price, inventory, inventory tracking and policy, images, variant images, SEO title and description, cost per item. Other columns are listed as ignored.

## Updating products (`--update`)

- Products are matched by **handle**, then by any **SKU**.
- **Only filled-in cells are sent.** An empty cell never clears what's in Joomni.
- **Variants are never deleted.** Every existing variant is sent back unchanged unless a row matches it (by SKU, then by option values). Rows that match nothing are added as new variants.
- `images` and `tags`, when filled in, replace the product's current ones.
- A one-row product in the CSV leaves the variants of a product that has several untouched, because it can't say which one it means.
- `status` changes only if your file has a status for that product.

## Good to know

- **Images are used from the URLs you give.** Use stable public URLs, for example your own CDN or the image links in a Shopify export (they may stop working once you close your Shopify store, so re-host images that matter).
- **Collections** aren't set by the import. Group products into collections in the dashboard afterwards.
- **Rate limit:** the API allows 120 requests a minute per key. The tool sends one product at a time and waits when Joomni asks it to.
- **Re-running is safe.** Created products are matched on the next run and skipped (or updated with `--update`).

## Development

```bash
npm test         # parser, Shopify mapping, validation and update-merge tests
npm run check    # syntax check
node bin/joomni-import.js templates/products-template.csv --offline
```

## Related

- [joomni-api-examples](https://github.com/joomni225/joomni-api-examples): the REST API in JavaScript, Python and PHP
- [joomni-google-sheets](https://github.com/joomni225/joomni-google-sheets): orders and enquiries in a Google Sheet
- [joomni-nextjs-commerce](https://github.com/joomni225/joomni-nextjs-commerce): a headless Next.js storefront

## License

MIT
