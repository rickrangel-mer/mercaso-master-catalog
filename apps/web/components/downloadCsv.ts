import { toCsv } from "../lib/exportTables";

/** Saves rows as a CSV file in the browser. */
export function downloadCsv(name: string, rows: string[][]) {
  const blob = new Blob([toCsv(rows)], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
