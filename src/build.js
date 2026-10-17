/**
 * Rows (with internal field names, see columns.js) → product drafts.
 *
 * A product is one row, or several rows sharing a `handle`: the first row
 * carries the product (title, description…), every row with option values is
 * a variant, and rows with only an image add images. Rows without a handle
 * and without a title belong to the product above them.
 *
 * Nothing here talks to the API: each draft says what would be sent and
 * which problems were found, line by line.
 */

const MAX_IMAGES = 10;
const MAX_TAGS = 20;
const STATUSES = { active: 'ACTIVE', draft: 'DRAFT', archived: 'ARCHIVED' };
const POLICIES = { deny: 'DENY', continue: 'CONTINUE' };

/**
 * @param {object[]} rows
 * @param {{ defaultStatus?: 'ACTIVE'|'DRAFT'|'ARCHIVED' }} options
 */
export function buildProducts(rows, { defaultStatus = 'DRAFT' } = {}) {
  const drafts = groupRows(rows).map((group) => buildOne(group, defaultStatus));
  // Two products may not share a handle: the second would overwrite the first.
  const owner = new Map();
  for (const d of drafts) {
    if (!d.handle) continue;
    const first = owner.get(d.handle);
    if (first) d.errors.push({ line: d.line, message: `Handle "${d.handle}" is already used by the product on line ${first.line}` });
    else owner.set(d.handle, d);
  }
  return drafts;
}

/**
 * "Lokta Notebook (A5)" → "lokta-notebook-a5". Products without a handle get
 * one from their title, so running the same file twice matches them instead
 * of creating duplicates. Titles with no Latin letters get none; Joomni
 * makes one when the product is created.
 */
export function slugify(title) {
  return String(title ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/** Rows → arrays of rows, one per product, in file order. */
export function groupRows(rows) {
  const groups = [];
  const byHandle = new Map();
  let last = null;
  for (const row of rows) {
    const handle = row.handle?.toLowerCase();
    if (handle) {
      let group = byHandle.get(handle);
      if (!group) {
        group = [];
        byHandle.set(handle, group);
        groups.push(group);
      }
      group.push(row);
      last = group;
    } else if (row.title || !last) {
      last = [row];
      groups.push(last);
    } else {
      last.push(row);
    }
  }
  return groups;
}

/** "1,200.50" → 1200.5 · "" → undefined · "abc" → NaN */
export function parseNumber(raw) {
  if (raw === undefined || raw === '') return undefined;
  const cleaned = String(raw).replace(/[,\s]/g, '');
  return /^-?\d+(\.\d+)?$/.test(cleaned) ? Number(cleaned) : NaN;
}

function parseBool(raw) {
  if (raw === undefined || raw === '') return undefined;
  if (/^(yes|y|true|1)$/i.test(raw)) return true;
  if (/^(no|n|false|0)$/i.test(raw)) return false;
  return null;
}

const isUrl = (s) => /^https?:\/\/\S+$/i.test(s);

function buildOne(rows, defaultStatus) {
  const head = rows.find((r) => r.title) ?? rows[0];
  const errors = [];
  const warnings = [];
  const err = (row, msg) => errors.push({ line: row._line, message: msg });
  const warn = (row, msg) => warnings.push({ line: row._line, message: msg });

  const title = head.title;
  if (!title) err(head, 'Title is missing');
  const handle = head.handle?.toLowerCase() || slugify(title) || undefined;

  // Options come from the first row that names them.
  const optionNames = [1, 2, 3]
    .map((n) => rows.find((r) => r[`option${n}_name`])?.[`option${n}_name`])
    .filter(Boolean);
  const hasOptions = optionNames.length > 0;

  // Numbers on a row, checked.
  const num = (row, field, label, { integer = false } = {}) => {
    const v = parseNumber(row[field]);
    if (v === undefined) return undefined;
    if (Number.isNaN(v)) {
      err(row, `${label} "${row[field]}" isn't a number`);
      return undefined;
    }
    if (v < 0) {
      err(row, `${label} can't be negative`);
      return undefined;
    }
    return integer ? Math.floor(v) : v;
  };

  // Variants: rows with option values (or the product row itself when the
  // product has no options).
  const variantRows = hasOptions
    ? rows.filter((r) => [1, 2, 3].some((n) => r[`option${n}_value`]))
    : [head];
  if (hasOptions && variantRows.length === 0) err(head, `Option "${optionNames[0]}" has no values`);

  const seen = new Set();
  const variants = variantRows.map((row) => {
    const options = {};
    optionNames.forEach((name, i) => {
      const value = row[`option${i + 1}_value`];
      if (!value) err(row, `Missing a value for option "${name}"`);
      else options[name] = value;
    });
    const combo = JSON.stringify(Object.values(options).map((v) => v.toLowerCase()));
    if (hasOptions && seen.has(combo)) err(row, `Duplicate variant ${Object.values(options).join(' / ')}`);
    seen.add(combo);

    const price = num(row, 'price', 'Price') ?? (row === head ? undefined : num(head, 'price', 'Price'));
    if (price === undefined && !errors.some((e) => e.line === row._line && e.message.startsWith('Price'))) {
      err(row, 'Price is missing');
    }
    const image = row.variant_image;
    if (image && !isUrl(image)) warn(row, `Variant image "${image}" isn't a web address; left out`);

    return {
      line: row._line,
      title: hasOptions ? Object.values(options).join(' / ') : 'Default Variant',
      options,
      price,
      compareAtPrice: num(row, 'compare_at_price', 'Compare-at price'),
      sku: row.sku || undefined,
      barcode: row.barcode || undefined,
      inventory: num(row, 'inventory', 'Inventory', { integer: true }),
      image: image && isUrl(image) ? image : undefined,
    };
  });

  // Images from every row, in order, without repeats.
  const images = [];
  for (const row of rows) {
    for (const url of (row.images ?? '').split('|').map((s) => s.trim()).filter(Boolean)) {
      if (!isUrl(url)) warn(row, `Image "${url}" isn't a web address; left out`);
      else if (!images.includes(url)) images.push(url);
    }
  }
  if (images.length > MAX_IMAGES) {
    warn(head, `${images.length} images; Joomni keeps up to ${MAX_IMAGES}, the rest are left out`);
    images.length = MAX_IMAGES;
  }

  let tags = (head.tags ?? '').split(',').map((t) => t.trim()).filter(Boolean);
  tags = [...new Set(tags)];
  if (tags.length > MAX_TAGS) {
    warn(head, `${tags.length} tags; Joomni keeps up to ${MAX_TAGS}`);
    tags = tags.slice(0, MAX_TAGS);
  }

  let status = defaultStatus;
  if (head.status) {
    status = STATUSES[head.status.toLowerCase()];
    if (!status) err(head, `Status "${head.status}" should be active, draft or archived`);
  }
  let inventoryPolicy;
  const policyRow = rows.find((r) => r.inventory_policy);
  if (policyRow) {
    inventoryPolicy = POLICIES[policyRow.inventory_policy.toLowerCase()];
    if (!inventoryPolicy) err(policyRow, `Inventory policy "${policyRow.inventory_policy}" should be deny or continue`);
  }
  let trackInventory = parseBool(head.track_inventory);
  if (trackInventory === null) {
    err(head, `Track inventory "${head.track_inventory}" should be yes or no`);
    trackInventory = undefined;
  }
  const anyStock = variants.some((v) => v.inventory !== undefined);
  if (trackInventory === undefined) trackInventory = anyStock;

  const prices = variants.map((v) => v.price).filter((p) => p !== undefined);
  const price = prices.length ? Math.min(...prices) : undefined;
  const first = variants[0] ?? {};
  const compareAtPrice = num(head, 'compare_at_price', 'Compare-at price') ?? first.compareAtPrice;
  const inventory = anyStock ? variants.reduce((n, v) => n + (v.inventory ?? 0), 0) : undefined;

  // Values the CSV actually set. On update only these are sent, so an empty
  // cell never wipes what's already in Joomni.
  const set = {
    title,
    description: head.description,
    price,
    compareAtPrice,
    costPerItem: num(head, 'cost_per_item', 'Cost per item'),
    sku: hasOptions ? undefined : first.sku,
    barcode: hasOptions ? undefined : first.barcode,
    inventory,
    inventoryPolicy,
    vendor: head.vendor,
    productType: head.product_type,
    seoTitle: head.seo_title,
    seoDescription: head.seo_description,
    ...(head.track_inventory !== undefined || anyStock ? { trackInventory } : {}),
    ...(images.length ? { images } : {}),
    ...(tags.length ? { tags } : {}),
    ...(head.status ? { status } : {}),
  };
  for (const k of Object.keys(set)) if (set[k] === undefined) delete set[k];

  const options = hasOptions
    ? optionNames.map((name) => ({ name, values: [...new Set(variants.map((v) => v.options[name]).filter(Boolean))] }))
    : undefined;

  const create = {
    ...set,
    status,
    trackInventory,
    images,
    tags,
    ...(handle ? { handle } : {}),
    ...(hasOptions
      ? {
          options,
          variants: variants.map((v) => clean({ title: v.title, price: v.price, sku: v.sku, inventory: v.inventory, options: v.options, image: v.image })),
        }
      : {}),
  };

  return {
    line: head._line,
    handle,
    title: title ?? '(no title)',
    hasOptions,
    variants,
    create,
    set,
    skus: variants.map((v) => v.sku).filter(Boolean),
    errors: unique(errors),
    warnings: unique(warnings),
  };
}

function unique(list) {
  const seen = new Set();
  return list.filter((e) => {
    const k = e.line + '|' + e.message;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function clean(obj) {
  for (const k of Object.keys(obj)) if (obj[k] === undefined) delete obj[k];
  return obj;
}
