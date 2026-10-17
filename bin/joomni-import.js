#!/usr/bin/env node
/**
 * joomni-import products.csv            dry run: check the file, show the plan
 * joomni-import products.csv --apply    import for real
 *
 * Run with --help for every option.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { readTable } from '../src/csv.js';
import { mapRows } from '../src/columns.js';
import { buildProducts } from '../src/build.js';
import { planImport } from '../src/plan.js';
import { runImport } from '../src/run.js';
import { reportCsv } from '../src/report.js';
import { DEFAULT_BASE_URL, JoomniClient } from '../src/client.js';

const HELP = `
Import products into a Joomni store from a CSV file or a Shopify product export.

Usage
  joomni-import <file.csv> [options]

By default nothing is changed: the file is checked against your store and the
plan is printed. Add --apply to import.

Options
  --apply              Create (and with --update, update) products for real
  --update             Update products that already exist (matched by handle, then SKU)
  --status <s>         Status for new products without a status column:
                       draft (default), active or archived
  --format <f>         joomni or shopify (detected automatically)
  --report <file>      Where to write the report (default: import-report-<time>.csv)
  --offline            Only check the file; don't contact Joomni
  --api-url <url>      API base URL (default ${DEFAULT_BASE_URL})
  -h, --help           Show this help

Environment
  JOOMNI_API_KEY       API key with products:read and products:write
  JOOMNI_API_URL       Same as --api-url

Exit codes: 0 all good · 1 some products had errors or failed · 2 could not run
`;

const c = process.stdout.isTTY && !process.env.NO_COLOR
  ? { green: (s) => `\x1b[32m${s}\x1b[0m`, red: (s) => `\x1b[31m${s}\x1b[0m`, yellow: (s) => `\x1b[33m${s}\x1b[0m`, dim: (s) => `\x1b[2m${s}\x1b[0m`, bold: (s) => `\x1b[1m${s}\x1b[0m` }
  : { green: String, red: String, yellow: String, dim: String, bold: String };

function parseArgs(argv) {
  const opts = { apply: false, update: false, offline: false, status: 'draft', format: undefined, report: undefined, apiUrl: undefined, file: undefined };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => {
      const v = argv[++i];
      if (v === undefined || v.startsWith('--')) throw new Error(`${a} needs a value`);
      return v;
    };
    if (a === '-h' || a === '--help') opts.help = true;
    else if (a === '--apply') opts.apply = true;
    else if (a === '--update') opts.update = true;
    else if (a === '--offline') opts.offline = true;
    else if (a === '--status') opts.status = value().toLowerCase();
    else if (a === '--format') opts.format = value().toLowerCase();
    else if (a === '--report') opts.report = value();
    else if (a === '--api-url') opts.apiUrl = value();
    else if (a.startsWith('-')) throw new Error(`Unknown option ${a}. See --help.`);
    else if (!opts.file) opts.file = a;
    else throw new Error(`Only one file at a time (got "${opts.file}" and "${a}").`);
  }
  if (!['draft', 'active', 'archived'].includes(opts.status)) throw new Error('--status must be draft, active or archived');
  if (opts.format && !['joomni', 'shopify'].includes(opts.format)) throw new Error('--format must be joomni or shopify');
  if (opts.apply && opts.offline) throw new Error('--apply and --offline can’t be used together');
  return opts;
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(c.red(e.message));
    return 2;
  }
  if (opts.help || !opts.file) {
    console.log(HELP);
    return opts.help ? 0 : 2;
  }

  // 1. Read and check the file.
  let text;
  try {
    text = await readFile(opts.file, 'utf8');
  } catch (e) {
    console.error(c.red(`Can't read ${opts.file}: ${e.message}`));
    return 2;
  }
  let mapped;
  try {
    mapped = mapRows(readTable(text), opts.format);
  } catch (e) {
    console.error(c.red(`${opts.file}: ${e.message}`));
    return 2;
  }
  const drafts = buildProducts(mapped.rows, { defaultStatus: opts.status.toUpperCase() });

  console.log(`\n${c.bold('joomni-import')} · ${opts.file} ${c.dim(`(${mapped.format} format, ${mapped.rows.length} rows → ${drafts.length} products)`)}`);
  if (mapped.unknown.length) console.log(c.dim(`  Ignored columns: ${mapped.unknown.join(', ')}`));

  // 2. Compare with the store.
  let client;
  let existing = [];
  if (!opts.offline) {
    try {
      client = new JoomniClient({ apiKey: process.env.JOOMNI_API_KEY, baseUrl: opts.apiUrl || process.env.JOOMNI_API_URL || DEFAULT_BASE_URL });
      existing = await client.all('/products');
    } catch (e) {
      const hint =
        e.status === 401 ? 'The API key was rejected. Check JOOMNI_API_KEY.'
        : e.status === 403 ? 'The API key needs the products:read and products:write scopes.'
        : e.message;
      console.error(c.red(`\nCan't read your store's products: ${hint}`));
      console.error(c.dim('Use --offline to only check the file.'));
      return 2;
    }
  }
  const actions = planImport(drafts, existing, { update: opts.update });
  const count = (t) => actions.filter((a) => a.type === t).length;

  console.log('');
  console.log(`  ${c.green('+')} ${count('create')} to create`);
  if (opts.update || count('update')) console.log(`  ${c.yellow('↻')} ${count('update')} to update`);
  if (count('skip')) console.log(`  ${c.dim('–')} ${count('skip')} skipped: already in your store ${c.dim('(add --update to update them)')}`);
  if (count('invalid')) console.log(`  ${c.red('✗')} ${count('invalid')} with errors ${c.dim('(not sent)')}`);
  if (opts.offline) console.log(c.dim('  (offline: not compared with your store, so everything shows as "create")'));

  const problems = actions.filter((a) => a.draft.errors.length || a.draft.warnings.length);
  if (problems.length) {
    console.log('');
    for (const a of problems.slice(0, 25)) {
      for (const e of a.draft.errors) console.log(`  ${c.red('error')}   line ${e.line}  ${a.draft.title}: ${e.message}`);
      for (const w of a.draft.warnings) console.log(`  ${c.yellow('warning')} line ${w.line}  ${a.draft.title}: ${w.message}`);
    }
    if (problems.length > 25) console.log(c.dim(`  …and more in the report`));
  }

  // 3. Import.
  if (opts.apply) {
    const total = count('create') + count('update');
    if (total) console.log('');
    await runImport(client, actions, {
      onProgress: (done, all, a) => {
        const mark = a.result === 'failed' ? c.red('✗') : c.green('✓');
        console.log(`  ${mark} [${done}/${all}] ${a.result} ${a.draft.title}${a.error ? c.red(` — ${a.error}`) : ''}`);
      },
    });
  }

  // 4. Report.
  const reportPath = opts.report || `import-report-${stamp()}.csv`;
  await writeFile(reportPath, reportCsv(actions), 'utf8');

  const failed = actions.filter((a) => a.result === 'failed').length;
  console.log('');
  if (!opts.apply) {
    console.log(c.bold('Dry run: nothing was changed.') + (count('create') + count('update') ? ' Run again with --apply to import.' : ''));
  } else {
    const ok = actions.filter((a) => a.result === 'created' || a.result === 'updated').length;
    console.log(c.bold(`Done: ${ok} imported${failed ? `, ${failed} failed` : ''}.`) + (opts.status === 'draft' && count('create') ? c.dim(' New products without a status column are drafts: publish them in Catalog › Products.') : ''));
  }
  console.log(c.dim(`Report: ${reportPath}`));
  return count('invalid') || failed ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error(c.red(e.stack || e.message));
    process.exit(2);
  },
);
