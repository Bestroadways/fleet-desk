const fs = require("fs"), path = require("path");
require("./env");
const sheet = require("./sheetio"), { flush } = require("./store"), { recheckAll } = require("./api"), jobs = require("./jobs");
(async () => {
  const c = process.argv[2];
  if (c === "import") { console.log(await require("./importer").fromGoogle(process.env.SOURCE_SHEET_ID, { replace: process.argv.includes("--replace") })); }
  else if (c === "import-xlsx") { const f = process.argv[3]; if (!f || !require("fs").existsSync(f)) throw new Error("usage: npm run import-xlsx -- path/to/Fleet_Desk.xlsx [--replace]"); console.log(require("./importer").fromXlsxBuffer(require("fs").readFileSync(f), { replace: process.argv.includes("--replace") })); }
  else if (c === "restore") { console.log(await sheet.importFrom(process.env.BACKUP_SHEET_ID, true)); }
  else if (c === "setadmin") { // npm run setadmin -- owner@bestroadways.com 9876543210 4821 "Name"
    const [email, mobile, pin, ...nm] = process.argv.slice(3); if (!email || !/^\d{10}$/.test(mobile || "") || !/^\d{4,6}$/.test(pin || "")) throw new Error("usage: npm run setadmin -- email 10-digit-mobile 4-6-digit-PIN [name]");
    const { db } = require("./store"), e = email.toLowerCase(); let p = db.people.find(x => x.email === e); if (!p) { p = { email: e, name: nm.join(" ") || e, role: "Admin", mobile, pin, device: "" }; db.people.push(p); }
    Object.assign(p, { mobile, pin, role: "Admin", device: "" }); if (!db.settings["Owner email"]) db.settings["Owner email"] = e; console.log(`Admin ready: ${e} · mobile ${mobile} · PIN ${pin}`);
  }
  else if (c === "people") { const { db, DATA } = require("./store"); console.log("Database: " + require("path").resolve(DATA, "db.json")); console.log(db.people.length ? db.people.map(p => `${p.mobile || "(no mobile)"}  PIN ${p.pin || "(none)"}  ${p.role}  ${p.email}`).join("\n") : "No people yet. Run: npm run seed   (test users)   or   npm run setadmin -- email mobile pin"); }
  else if (c === "mirror") console.log(await sheet.mirror());
  else if (c === "morning") console.log((await jobs.morning()).join("\n"));
  else console.log("usage: node src/cli.js import | import-xlsx | restore | mirror | morning | setadmin");
  flush(); process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
