// Small formatting and download helpers shared by the Stores tab.
export const fmt = (n: number) => n.toLocaleString("en-US");
export const pct = (x: number, digits = 0) => `${(x * 100).toFixed(digits)}%`;
export const money = (x: number) => `$${Math.round(x).toLocaleString("en-US")}`;

/** Saves text as a CSV file in the browser. */
export function downloadCsv(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
