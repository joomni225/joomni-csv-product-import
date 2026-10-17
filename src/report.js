import { toCsv } from './csv.js';

/** One line per product: what was planned, what happened, and why. */
export function reportCsv(actions) {
  const rows = [['line', 'handle', 'title', 'action', 'result', 'product_id', 'details']];
  for (const a of actions) {
    const d = a.draft;
    const details = [
      ...d.errors.map((e) => `line ${e.line}: ${e.message}`),
      ...d.warnings.map((w) => `line ${w.line}: ${w.message}`),
      ...(a.notes ?? []),
      a.reason,
      a.error,
    ].filter(Boolean);
    rows.push([d.line, d.handle ?? '', d.title, a.type, a.result ?? (a.type === 'invalid' ? 'not sent' : 'planned'), a.productId ?? a.existing?.id ?? '', details.join(' · ')]);
  }
  return toCsv(rows);
}
