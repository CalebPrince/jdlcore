require("dotenv").config();
const postgres = require("postgres");

const url = process.env.DATABASE_URL;
if (!url || url.includes("<")) throw new Error("Set DATABASE_URL before seeding services.");
const sql = postgres(url, { prepare: false });

// Matches SERVICE_TYPES / SERVICE_TYPE_LABEL in src/lib/jobs.ts (doc section 2.2).
const services = [
  { key: "stock_monitoring", label: "Stock Monitoring Services", pricingLabel: "From GHS 1,200 per visit", position: 0 },
  { key: "collateral_verification", label: "Collateral Verification Services", pricingLabel: "From GHS 1,500 per inspection", position: 1 },
  { key: "tank_depot_inspection", label: "Tank and Depot Inspections", pricingLabel: "From GHS 1,800 per inspection", position: 2 },
  { key: "quantity_verification", label: "Quantity Verification", pricingLabel: "From GHS 1,000 per job", position: 3 },
  { key: "reconciliation_exception", label: "Reconciliation & Exception Reporting", pricingLabel: "From GHS 900 per report", position: 4 },
  { key: "loading_discharge_supervision", label: "Loading & Discharge Supervision", pricingLabel: "From GHS 1,600 per job", position: 5 },
  { key: "inventory_audit", label: "Inventory Audit Support", pricingLabel: "From GHS 1,100 per audit", position: 6 },
  { key: "loss_discrepancy_investigation", label: "Loss & Discrepancy Investigation", pricingLabel: "Quoted per case", position: 7 },
  { key: "documentation_reporting", label: "Documentation & Reporting", pricingLabel: "From GHS 600 per report", position: 8 },
  { key: "stock_control_advisory", label: "Stock Control Advisory", pricingLabel: "Quoted per engagement", position: 9 },
];

async function run() {
  for (const s of services) {
    await sql`
      insert into services (key, label, pricing_label, active, position)
      values (${s.key}, ${s.label}, ${s.pricingLabel}, true, ${s.position})
      on conflict (key) do update set
        label = excluded.label,
        pricing_label = excluded.pricing_label,
        position = excluded.position
    `;
  }
  console.log(`Seeded ${services.length} services.`);
  await sql.end();
}

run().catch(async (error) => {
  console.error(error);
  await sql.end();
  process.exit(1);
});
