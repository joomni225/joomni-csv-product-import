/**
 * RFC 4180 CSV, no dependencies: quoted fields, "" escapes, commas and line
 * breaks inside quotes, CRLF or LF, and the UTF-8 BOM Excel adds.
 */

/** @returns {string[][]} rows of cells */
export function parseCsv(text) {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"' && cell === '') quoted = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (quoted) throw new Error('The CSV ends inside a quoted value: a closing " is missing.');
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  // Drop blank lines (often at the end of a file).
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

/**
 * Rows as objects keyed by header, plus the 1-based line each came from
 * (header = line 1), for error messages people can find in a spreadsheet.
 */
export function readTable(text) {
  const rows = parseCsv(text);
  if (rows.length === 0) throw new Error('The CSV is empty.');
  const [header, ...body] = rows;
  const headers = header.map((h) => h.trim());
  return {
    headers,
    rows: body.map((cells, i) => {
      const record = { _line: i + 2 };
      headers.forEach((h, j) => {
        record[h] = (cells[j] ?? '').trim();
      });
      return record;
    }),
  };
}

function escapeCell(value) {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows) {
  return rows.map((r) => r.map(escapeCell).join(',')).join('\n') + '\n';
}
