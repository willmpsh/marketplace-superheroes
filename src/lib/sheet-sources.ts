import { parse, isValid, format } from "date-fns";

export type SheetMetricRow = {
  metric_date: string; // yyyy-MM-dd
  dimension: string;
  metric_name: string;
  metric_value: number;
};

export type SheetSource = {
  spreadsheetId: string;
  displayName: string;
  offerSlug: string;
  /** Unqualified range = first visible tab. Adjust per-sheet if the target data lives on a different tab. */
  range: string;
  parse: (rows: string[][]) => SheetMetricRow[];
};

/**
 * "MPSH // Campaign Stats // Accelerate // Leads" layout (confirmed by manual inspection):
 * col A = month number, B = year, C = "<day> <MonthName>" (e.g. "1 May"),
 * D/E/F = daily registrations by source (EM/YT/LWT), G = Total Reg.
 * Header rows occupy indices 0-2; data starts at row index 3 (1-indexed row 4).
 */
function parseAccelerateLeadsSheet(rows: string[][]): SheetMetricRow[] {
  const SOURCE_COLUMNS = ["EM", "YT", "LWT"];
  const out: SheetMetricRow[] = [];

  for (const row of rows) {
    const [, year, dateLabel, em, yt, lwt] = row;
    if (!year || !dateLabel) continue;

    const parsedDate = parse(`${dateLabel} ${year}`, "d MMMM yyyy", new Date());
    if (!isValid(parsedDate)) continue;

    const metricDate = format(parsedDate, "yyyy-MM-dd");
    const sourceValues = [em, yt, lwt];

    SOURCE_COLUMNS.forEach((source, i) => {
      const value = parseInt(sourceValues[i] ?? "0", 10);
      if (!Number.isFinite(value)) return;
      out.push({
        metric_date: metricDate,
        dimension: source,
        metric_name: "leads",
        metric_value: value,
      });
    });
  }

  return out;
}

export const SHEET_SOURCES: SheetSource[] = [
  {
    spreadsheetId: "1s6F57qZ7fuHnr6jiiVZ5ad9Sag17c7Vrm0a2urCcmVc",
    displayName: "MPSH // Campaign Stats // Accelerate // Leads",
    offerSlug: "accelerate",
    range: "A4:G5000",
    parse: parseAccelerateLeadsSheet,
  },
];
