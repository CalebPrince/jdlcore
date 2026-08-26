import { NextResponse } from "next/server";
import { requireStaffRole } from "@/lib/staff-auth";
import { getAnalyticsReport } from "@/lib/analytics-reporting";

export async function GET() {
  if (!(await requireStaffRole(["administrator", "superadmin"])))
    return new NextResponse("Unauthorized", { status: 401 });
  const report = await getAnalyticsReport(30);
  const rows: (string | number)[][] = [["category", "date", "name", "status", "count", "limit_or_conversations", "details"]];
  for (const day of report.daily) rows.push(["daily_usage", day.date, "All subscribers", "", day.count, "", "Accepted questions"]);
  for (const user of report.subscribers) rows.push(["subscriber", "", user.name, user.status, user.questions, user.conversations, user.company ?? ""]);
  for (const document of report.documents) rows.push(["document", "", document.title, "cited", document.citations, "", "Citation appearances"]);
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="jdl-analytics-report-${date}.csv"`, "cache-control": "private, no-store" } });
}

function csvCell(value: string | number) { const text = String(value); return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; }
