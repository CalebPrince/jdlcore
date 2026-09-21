import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireDb } from "@/db";
import { clients, jobCompletionData, jobOutturns, jobOutturnTanks, jobs, tanks } from "@/db/schema";
import { getPortalClient } from "@/lib/portal-auth";
import { getStaff } from "@/lib/staff-auth";
import { getInspector } from "@/lib/inspector-auth";
import { getReportSettings } from "@/lib/settings";
import { buildOutturnReportPdf } from "@/lib/outturn-report-pdf";

const DONE_STATUSES = ["approved", "report_issued", "invoice_issued", "paid", "closed"];

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const preview = new URL(req.url).searchParams.get("preview") === "1";
  const { id: rawId } = await params;
  const jobId = Number(rawId);
  if (!Number.isInteger(jobId) || jobId <= 0) return new NextResponse("Not found", { status: 404 });

  const portal = await getPortalClient();
  const staffUser = portal ? null : await getStaff();
  const inspector = portal || staffUser ? null : await getInspector();
  if (!portal && !staffUser && !inspector) return new NextResponse("Unauthorized", { status: 401 });

  const database = requireDb();
  const rows = await database
    .select({ job: jobs, client: clients, completion: jobCompletionData })
    .from(jobs)
    .innerJoin(clients, eq(jobs.clientId, clients.id))
    .leftJoin(jobCompletionData, eq(jobCompletionData.jobId, jobs.id))
    .where(eq(jobs.id, jobId))
    .limit(1);
  const row = rows[0];
  if (!row) return new NextResponse("Not found", { status: 404 });
  if (portal && row.job.clientId !== portal.id) return new NextResponse("Not found", { status: 404 });
  if (inspector && row.job.assignedInspectorId !== inspector.id) return new NextResponse("Not found", { status: 404 });
  // Matches the client's Certificate of Quantity: not visible in the portal until the job is approved.
  if (portal && !DONE_STATUSES.includes(row.job.status)) return new NextResponse("Not found", { status: 404 });

  const headerRows = await database.select().from(jobOutturns).where(eq(jobOutturns.jobId, jobId)).limit(1);
  const header = headerRows[0];
  if (!header) return new NextResponse("No outturn recorded for this job yet.", { status: 404 });
  const tankRows = await database.select().from(jobOutturnTanks).where(eq(jobOutturnTanks.jobOutturnId, header.id));
  if (tankRows.length === 0) return new NextResponse("No outturn recorded for this job yet.", { status: 404 });

  const tankIds = [...new Set(tankRows.flatMap((t) => [t.initialTankId, t.finalTankId]))];
  const tankRefs = await database.select({ id: tanks.id, name: tanks.name }).from(tanks);
  const tankName = new Map(tankRefs.filter((t) => tankIds.includes(t.id)).map((t) => [t.id, t.name]));

  const reportSettings = await getReportSettings();
  const pdf = await buildOutturnReportPdf(row.job, row.client, row.completion, header, tankRows, tankName, reportSettings.headerTagline);

  return new NextResponse(Buffer.from(pdf), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `${preview ? "inline" : "attachment"}; filename="Outturn Report - ${row.job.ref}.pdf"`,
      "cache-control": "no-store",
    },
  });
}
