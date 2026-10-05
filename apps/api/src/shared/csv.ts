/**
 * A minimal CSV writer (RFC 4180 quoting) with one extra rule for spreadsheets: a cell that STARTS with =, +, - or @
 * (or a tab or carriage return) would be run as a formula when the file is opened in Excel or Sheets ("CSV
 * injection"), and the cells here hold names people typed. Such a cell is prefixed with an apostrophe, which the
 * spreadsheet shows as plain text.
 */
export function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Rows of cells to a CSV document with CRLF line ends and a UTF-8 byte order mark, so Excel reads accents correctly. */
export function toCsv(rows: string[][]): string {
  return "\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
