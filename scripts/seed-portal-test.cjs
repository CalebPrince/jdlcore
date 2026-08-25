const { randomBytes, scryptSync, createHmac } = require("crypto");
const postgres = require("postgres");
const sql = postgres(process.env.DATABASE_URL, { prepare: false });

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

(async () => {
  const email = "test@acme.com";
  await sql`DELETE FROM clients WHERE email = ${email}`;
  const inserted = await sql`
    INSERT INTO clients (name, company, email, phone, password_hash)
    VALUES ('Kwame Mensah', 'Acme Trading Ltd', ${email}, '+233 24 000 0000', ${hashPassword('testpass123')})
    RETURNING id`;
  const clientId = inserted[0].id;

  const job = await sql`
    INSERT INTO jobs (ref, client_id, service, location, cargo_type, notes, status)
    VALUES ('PENDING', ${clientId}, 'Stock Monitoring', 'Tema, Tank Farm B', 'AGO', 'Monthly verification of tank stocks.', 'in_progress')
    RETURNING id`;
  const jobId = job[0].id;
  await sql`UPDATE jobs SET ref = ${"JDL-" + new Date().getFullYear() + "-" + String(jobId).padStart(4, "0")} WHERE id = ${jobId}`;

  await sql`INSERT INTO job_updates (job_id, status, note) VALUES (${jobId}, 'submitted', 'Request received.')`;
  await sql`INSERT INTO job_updates (job_id, status, note) VALUES (${jobId}, 'assigned', 'Inspector assigned: field team A.')`;
  await sql`INSERT INTO job_updates (job_id, status, note) VALUES (${jobId}, 'in_progress', 'Inspection underway at Tank Farm B.')`;

  const docContent = Buffer.from("JDL CORE TEST REPORT").toString("base64");
  await sql`INSERT INTO documents (job_id, kind, title, file_data, mime_type)
    VALUES (${jobId}, 'report', 'Interim Report - Tank Farm B', ${"data:text/plain;base64," + docContent}, 'text/plain')`;

  const inv = await sql`
    INSERT INTO invoices (number, job_id, amount_cents, currency, due_date, status)
    VALUES ('PENDING', ${jobId}, 1250000, 'GHS', now() + interval '14 days', 'sent')
    RETURNING id`;
  await sql`UPDATE invoices SET number = ${"INV-" + new Date().getFullYear() + "-" + String(inv[0].id).padStart(4, "0")} WHERE id = ${inv[0].id}`;

  // forge a valid portal cookie for this client
  const expires = Date.now() + 86400000;
  const secret = `portal:${process.env.SESSION_SECRET ?? "jdlcore-dev-secret-change-me"}`;
  const sig = createHmac("sha256", secret).update(`${clientId}.${expires}`).digest("hex");
  require("fs").writeFileSync(
    process.env.TEMP + "\\opencode\\jdl-portal-cookie.txt",
    `jdl_portal=${clientId}.${expires}.${sig}`,
  );
  console.log("seeded client", clientId, "job", jobId);
  await sql.end();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
