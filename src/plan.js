/**
 * Drafts + what's already in the store → one action per product.
 *
 *   create   new product
 *   update   matched an existing product and --update was given
 *   skip     matched an existing product, no --update
 *   invalid  the CSV has errors for this product; nothing is sent
 *
 * A draft matches an existing product by handle, else by any SKU.
 */

export function planImport(drafts, existing, { update = false } = {}) {
  const byHandle = new Map();
  const bySku = new Map();
  for (const p of existing) {
    if (p.handle) byHandle.set(p.handle.toLowerCase(), p);
    for (const sku of [p.sku, ...(p.variants ?? []).map((v) => v.sku)]) {
      if (sku) bySku.set(sku.toLowerCase(), p);
    }
  }

  return drafts.map((draft) => {
    if (draft.errors.length) return { type: 'invalid', draft };
    const match =
      (draft.handle && byHandle.get(draft.handle)) ||
      draft.skus.map((s) => bySku.get(s.toLowerCase())).find(Boolean);
    if (!match) return { type: 'create', draft, body: draft.create };
    if (!update) return { type: 'skip', draft, existing: match, reason: 'already in your store (use --update to update it)' };
    const { body, notes } = updateBody(draft, match);
    return { type: 'update', draft, existing: match, body, notes };
  });
}

const norm = (s) => String(s ?? '').trim().toLowerCase();

export function sameOptions(a = {}, b = {}) {
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  const lb = Object.fromEntries(kb.map((k) => [norm(k), norm(b[k])]));
  return ka.every((k) => lb[norm(k)] === norm(a[k]));
}

/**
 * The update request. Only fields the CSV set are sent. Variants are merged:
 * every existing variant is sent back with its id (so none is deleted),
 * matched CSV rows change it, and unmatched CSV rows are added as new.
 */
export function updateBody(draft, existing) {
  const notes = [];
  const body = { ...draft.set };
  const current = existing.variants ?? [];

  if (!draft.hasOptions && current.length > 1) {
    // A one-row product in the CSV can't say which of several variants it means.
    delete body.inventory;
    delete body.sku;
    delete body.barcode;
    notes.push('has variants in Joomni but none in the CSV: variants left unchanged');
    return { body, notes };
  }
  if (current.length === 0) return { body, notes };

  const variants = mergeVariants(current, draft.variants);
  body.variants = variants;
  if (draft.hasOptions) {
    const names = [...new Set(variants.flatMap((v) => Object.keys(v.options ?? {})))];
    body.options = names.map((name) => ({
      name,
      values: [...new Set(variants.map((v) => v.options?.[name]).filter(Boolean))],
    }));
  }
  const added = variants.filter((v) => !v.id).length;
  if (added) notes.push(`${added} new variant${added === 1 ? '' : 's'}`);
  return { body, notes };
}

export function mergeVariants(current, incoming) {
  const used = new Set();
  const pick = (ev) =>
    incoming.find((iv) => !used.has(iv) && ((iv.sku && ev.sku && norm(iv.sku) === norm(ev.sku)) || sameOptions(iv.options, ev.options)));

  const merged = current.map((ev) => {
    const iv = pick(ev);
    if (iv) used.add(iv);
    return strip({
      id: ev.id,
      title: ev.title,
      options: ev.options ?? {},
      price: iv?.price ?? ev.price,
      sku: iv?.sku ?? ev.sku ?? undefined,
      inventory: iv?.inventory ?? ev.inventory,
      image: iv?.image ?? ev.image ?? undefined,
    });
  });
  for (const iv of incoming) {
    if (!used.has(iv)) {
      merged.push(strip({ title: iv.title, options: iv.options, price: iv.price, sku: iv.sku, inventory: iv.inventory, image: iv.image }));
    }
  }
  return merged;
}

function strip(o) {
  for (const k of Object.keys(o)) if (o[k] === undefined || o[k] === null) delete o[k];
  return o;
}
