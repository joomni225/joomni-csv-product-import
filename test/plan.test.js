import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildProducts } from '../src/build.js';
import { mergeVariants, planImport, sameOptions } from '../src/plan.js';

const existing = [
  {
    id: 'p1',
    handle: 'tee',
    sku: null,
    variants: [
      { id: 'v1', title: 'S', options: { Size: 'S' }, price: 100, sku: 'TEE-S', inventory: 3 },
      { id: 'v2', title: 'M', options: { Size: 'M' }, price: 100, sku: 'TEE-M', inventory: 4 },
    ],
  },
  { id: 'p2', handle: 'mug', sku: 'MUG-1', variants: [{ id: 'v9', title: 'Default Variant', options: {}, price: 50, sku: 'MUG-1', inventory: 1 }] },
];

const teeRows = [
  { _line: 2, handle: 'tee', title: 'Tee', price: '120', option1_name: 'Size', option1_value: 'M', inventory: '10', sku: 'TEE-M' },
  { _line: 3, handle: 'tee', price: '130', option1_value: 'L', inventory: '2' },
];

test('existing products are skipped unless --update', () => {
  const drafts = buildProducts([...teeRows, { _line: 4, handle: 'new', title: 'New', price: '1' }]);
  const plan = planImport(drafts, existing);
  assert.deepEqual(plan.map((a) => a.type), ['skip', 'create']);
});

test('a product matches by SKU when the handle differs', () => {
  const drafts = buildProducts([{ _line: 2, title: 'Coffee Mug', price: '55', sku: 'mug-1' }]);
  const [a] = planImport(drafts, existing, { update: true });
  assert.equal(a.type, 'update');
  assert.equal(a.existing.id, 'p2');
});

test('update keeps every existing variant, changes matches, adds new ones', () => {
  const drafts = buildProducts(teeRows);
  const [a] = planImport(drafts, existing, { update: true });
  assert.equal(a.type, 'update');
  const v = a.body.variants;
  assert.deepEqual(v.map((x) => x.id ?? 'new'), ['v1', 'v2', 'new']);
  assert.equal(v[0].price, 100, 'S is not in the CSV: unchanged');
  assert.equal(v[1].price, 120);
  assert.equal(v[1].inventory, 10);
  assert.deepEqual(v[2].options, { Size: 'L' });
  assert.deepEqual(a.body.options, [{ name: 'Size', values: ['S', 'M', 'L'] }]);
  assert.deepEqual(a.notes, ['1 new variant']);
});

test('a simple product updates its single default variant in place', () => {
  const drafts = buildProducts([{ _line: 2, handle: 'mug', title: 'Mug', price: '60', inventory: '7' }]);
  const [a] = planImport(drafts, existing, { update: true });
  assert.deepEqual(a.body.variants, [{ id: 'v9', title: 'Default Variant', options: {}, price: 60, sku: 'MUG-1', inventory: 7 }]);
});

test('a one-row CSV product never touches the variants of a product that has several', () => {
  const drafts = buildProducts([{ _line: 2, handle: 'tee', title: 'Tee', price: '99', inventory: '1' }]);
  const [a] = planImport(drafts, existing, { update: true });
  assert.equal(a.body.variants, undefined);
  assert.equal(a.body.inventory, undefined);
  assert.equal(a.body.price, 99);
});

test('products with errors are never sent', () => {
  const drafts = buildProducts([{ _line: 2, title: 'Bad', price: 'x' }]);
  assert.equal(planImport(drafts, [])[0].type, 'invalid');
});

test('option matching ignores case and spacing', () => {
  assert.ok(sameOptions({ Size: 'M ' }, { size: 'm' }));
  assert.ok(!sameOptions({ Size: 'M' }, {}));
  assert.equal(mergeVariants([], [{ title: 'A', options: {}, price: 1 }]).length, 1);
});
