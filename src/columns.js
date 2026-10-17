/**
 * Column names. Two formats are understood:
 *
 * - joomni:  the template in templates/products-template.csv
 * - shopify: a Shopify "Export products" CSV, detected automatically
 *
 * Both are turned into the same internal field names (the keys of FIELDS),
 * so everything after this file is format-agnostic.
 */

/** Internal field → what it means. Used for docs and the template. */
export const FIELDS = {
  handle: 'URL slug; rows with the same handle are one product',
  title: 'Product name (required on the first row of a product)',
  description: 'HTML or plain text',
  price: 'Selling price, in your store currency',
  compare_at_price: '"Was" price, shown struck through',
  cost_per_item: 'Your cost; never shown to buyers',
  sku: 'Stock-keeping unit',
  barcode: 'Barcode (EAN, UPC, …)',
  inventory: 'Stock quantity',
  track_inventory: 'yes / no',
  inventory_policy: 'deny (stop at 0) / continue (allow backorders)',
  status: 'active / draft / archived',
  vendor: 'Brand or maker',
  product_type: 'Type, for your own grouping',
  tags: 'Comma-separated',
  images: 'Image URLs separated by |',
  seo_title: 'Title for search results',
  seo_description: 'Description for search results',
  option1_name: 'e.g. Size',
  option1_value: 'e.g. M',
  option2_name: '',
  option2_value: '',
  option3_name: '',
  option3_value: '',
  variant_image: 'Image URL for this variant',
};

/** "Compare at price" / "compare-at-price" / "COMPARE_AT_PRICE" → "compare_at_price" */
export function normalizeHeader(h) {
  return String(h).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

/** Extra spellings accepted for the joomni format. */
const ALIASES = {
  name: 'title',
  product_name: 'title',
  body: 'description',
  body_html: 'description',
  compare_price: 'compare_at_price',
  was_price: 'compare_at_price',
  cost: 'cost_per_item',
  stock: 'inventory',
  quantity: 'inventory',
  qty: 'inventory',
  brand: 'vendor',
  type: 'product_type',
  image: 'images',
  image_urls: 'images',
  image_url: 'images',
};

/** Shopify export header → internal field. */
const SHOPIFY = {
  handle: 'handle',
  title: 'title',
  body_html: 'description',
  vendor: 'vendor',
  type: 'product_type',
  tags: 'tags',
  status: 'status',
  published: 'published',
  option1_name: 'option1_name',
  option1_value: 'option1_value',
  option2_name: 'option2_name',
  option2_value: 'option2_value',
  option3_name: 'option3_name',
  option3_value: 'option3_value',
  variant_sku: 'sku',
  variant_barcode: 'barcode',
  variant_price: 'price',
  variant_compare_at_price: 'compare_at_price',
  variant_inventory_qty: 'inventory',
  variant_inventory_tracker: 'inventory_tracker',
  variant_inventory_policy: 'inventory_policy',
  image_src: 'images',
  variant_image: 'variant_image',
  seo_title: 'seo_title',
  seo_description: 'seo_description',
  cost_per_item: 'cost_per_item',
};

export function detectFormat(headers) {
  const n = new Set(headers.map(normalizeHeader));
  return n.has('handle') && n.has('variant_price') ? 'shopify' : 'joomni';
}

/**
 * Rows with internal field names.
 * @returns {{ format: string, rows: object[], unknown: string[] }}
 */
export function mapRows(table, format = detectFormat(table.headers)) {
  const map = {};
  const unknown = [];
  for (const h of table.headers) {
    const n = normalizeHeader(h);
    const field = format === 'shopify' ? SHOPIFY[n] : FIELDS[n] !== undefined ? n : ALIASES[n];
    if (field) map[h] = field;
    else if (h) unknown.push(h);
  }

  const rows = table.rows.map((r) => {
    const out = { _line: r._line };
    for (const [h, field] of Object.entries(map)) {
      if (r[h] !== '') out[field] = r[h];
    }
    if (format === 'shopify') fromShopify(out);
    return out;
  });
  return { format, rows, unknown };
}

/** Shopify's way of saying things → ours. */
function fromShopify(row) {
  if (!row.status && row.published !== undefined) {
    row.status = /^(true|yes|1)$/i.test(row.published) ? 'active' : 'draft';
  }
  delete row.published;
  if (row.inventory_tracker !== undefined) {
    row.track_inventory = row.inventory_tracker ? 'yes' : 'no';
    delete row.inventory_tracker;
  }
  // Shopify writes "Title / Default Title" for products without options.
  if (/^title$/i.test(row.option1_name ?? '') && /^default title$/i.test(row.option1_value ?? '')) {
    delete row.option1_name;
    delete row.option1_value;
  }
}
