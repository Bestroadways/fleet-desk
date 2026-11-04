// Sample data for running on your own computer with no Google account.  npm run seed
require("./env");
const { db, replace } = require("./store");
const path = require("path");
if (db.people.length && process.argv[2] !== "--force") { console.log("Database already has data. Use: node src/seed.js --force"); process.exit(0); }
const today = new Date(Date.now() + 19800e3).toISOString().slice(0, 10);
replace({
  settings: { "Owner email": "owner@test.com", "Idle day: GPS km at or below": 15, "CNG rate check: min ₹/kg": 65, "CNG rate check: max ₹/kg": 100, "Idle watch from": today, "Idle watch mail to": "branch@test.com" },
  people: [
    { email: "branch@test.com", name: "Branch (test)", role: "Ankleshwar branch", mobile: "9000000001", pin: "1111" },
    { email: "sitaram@test.com", name: "Sitaram (test approver)", role: "Sangwari approver", mobile: "9000000002", pin: "2222" },
    { email: "ops@test.com", name: "Sangwari ops (test)", role: "Sangwari ops", mobile: "9000000003", pin: "3333" },
    { email: "owner@test.com", name: "Owner / Admin (test)", role: "Admin", mobile: "9000000009", pin: "9999" },
    { email: "audit@test.com", name: "Internal Audit (test)", role: "Internal Audit", mobile: "9000000004", pin: "4444" },
  ],
  fleet: [
    { veh: "RJ14GI1677", type: "32 ft MXL", driver: "Test Driver", cleaner: "", base: "Ankleshwar", kmin: 2.5, kmax: 6.5, salary: 24000, fuel: "CNG", device: "GTropy", start: "2026-10-24", note: "" },
    { veh: "RJ14GA0001", type: "22 ft", driver: "Test Driver 2", cleaner: "", base: "Ankleshwar", kmin: 2.4, kmax: 5.5, salary: 24000, fuel: "Diesel", device: "", start: "", note: "" },
  ],
});
console.log("Saved in: " + path.resolve(require("./store").DATA, "db.json"));
console.log("Sample data ready. Log in with mobile / PIN:\n  9000000001 / 1111  Branch (raises requests)\n  9000000002 / 2222  Sitaram (approves)\n  9000000003 / 3333  Ops (pays)\n  9000000004 / 4444  Audit\n  9000000009 / 9999  Admin / owner (Desk tab: people, fleet, settings)");
process.exit(0);
