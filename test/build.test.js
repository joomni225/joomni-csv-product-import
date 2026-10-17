import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readTable } from '../src/csv.js';
import { detectFormat, mapRows } from '../src/columns.js';
import { buildProducts, parseNumber, slugify } from '../src/build.js';

const load = (file, format) => buildProducts(mapRows(readTable(readFileSync(new URL(file, import.meta.url), 'utf8')), format).rows);

test('the template builds a simple product and a product with variants', () => {
  const [lokta, tee] = load('../templates/products-template.csv');
  assert.equal(lokta.errors.length, 0);
  assert.equal(lokta.hasOptions, false);
  assert.equal(lokta.create.price, 1200);
  assert.equal(lokta.create.compareAtPrice, 1500);
  assert.equal(lokta.create.inventory, 40);
  assert.equal(lokta.create.images.length, 2);
  assert.deepEqual(lokta.create.tags, ['notebook', 'handmade']);
  assert.equal(lokta.create.variants, undefined);

  assert.equal(tee.errors.length, 0, JSON.stringify(tee.errors));
  assert.deepEqual(tee.create.options, [
    { name: 'Size', values: ['S', 'M', 'L'] },
    { name: 'Colour', values: ['White', 'Black'] },
  ]);
  assert.equal(tee.create.variants.length, 3);
  assert.equal(tee.create.variants[2].title, 'L / Black');
  assert.equal(tee.create.variants[2].price, 1900);
  assert.equal(tee.create.price, 1800, 'product price is the lowest variant price');
  assert.equal(tee.create.inventory, 20, 'product stock is the sum of variants');
  assert.equal(tee.create.variants[2].image, 'https://example.com/tee-black.jpg');
});

test('a Shopify export is detected and mapped', () => {
  const text = readFileSync(new URL('../examples/shopify-export-sample.csv', import.meta.url), 'utf8');
  assert.equal(detectFormat(readTable(text).headers), 'shopify');
  const [shirt, wrap] = load('../examples/shopify-export-sample.csv');
  assert.equal(shirt.errors.length, 0, JSON.stringify(shirt.errors));
  assert.equal(shirt.create.status, 'ACTIVE');
  assert.equal(shirt.create.variants.length, 3);
  assert.deepEqual(shirt.create.images, ['https://example.com/linen-1.jpg', 'https://example.com/linen-2.jpg']);
  assert.equal(shirt.create.costPerItem, 1400);
  assert.equal(shirt.create.trackInventory, true);
  assert.equal(shirt.create.inventoryPolicy, 'DENY');
  assert.equal(wrap.hasOptions, false, '"Title / Default Title" means no options');
  assert.equal(wrap.create.status, 'DRAFT');
});

test('row errors carry the spreadsheet line', () => {
  const drafts = load('../examples/sample-products.csv');
  const bottle = drafts.find((d) => d.title === 'Water Bottle');
  assert.deepEqual(bottle.errors, [{ line: 6, message: 'Price "abc" isn\'t a number' }]);
});

test('missing title, duplicate variants and bad values are reported', () => {
  const rows = [
    { _line: 2, handle: 'x', price: '10', option1_name: 'Size', option1_value: 'M' },
    { _line: 3, handle: 'x', option1_value: 'm' },
    { _line: 4, title: 'Y', price: '-5', status: 'live', track_inventory: 'maybe' },
  ];
  const [x, y] = buildProducts(rows);
  assert.ok(x.errors.some((e) => e.message === 'Title is missing'));
  assert.ok(x.errors.some((e) => e.line === 3 && /Duplicate variant/.test(e.message)));
  assert.deepEqual(y.errors.map((e) => e.message).sort(), [
    "Price can't be negative",
    'Status "live" should be active, draft or archived',
    'Track inventory "maybe" should be yes or no',
  ]);
});

test('products without a handle get one from the title, and handles must be unique', () => {
  const [a, b] = buildProducts([
    { _line: 2, title: 'Lokta Notebook (A5)', price: '1' },
    { _line: 3, title: 'Lokta notebook A5', price: '1' },
  ]);
  assert.equal(a.handle, 'lokta-notebook-a5');
  assert.equal(a.create.handle, 'lokta-notebook-a5');
  assert.match(b.errors[0].message, /already used by the product on line 2/);
  assert.equal(slugify('नेपाली'), '');
});

test('too many images and tags are trimmed with a warning', () => {
  const images = Array.from({ length: 12 }, (_, i) => `https://e.com/${i}.jpg`).join('|');
  const tags = Array.from({ length: 25 }, (_, i) => `t${i}`).join(',');
  const [p] = buildProducts([{ _line: 2, title: 'P', price: '1', images, tags }]);
  assert.equal(p.create.images.length, 10);
  assert.equal(p.create.tags.length, 20);
  assert.equal(p.warnings.length, 2);
});

test('numbers accept thousands separators and reject words', () => {
  assert.equal(parseNumber('1,200.50'), 1200.5);
  assert.equal(parseNumber(''), undefined);
  assert.ok(Number.isNaN(parseNumber('Rs 500')));
});

test('only cells that were filled are sent on update', () => {
  const [p] = buildProducts([{ _line: 2, handle: 'p', title: 'P', price: '5' }]);
  assert.deepEqual(Object.keys(p.set).sort(), ['price', 'title']);
});
