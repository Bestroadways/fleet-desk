require("./env");
// JSON file database: whole state in memory, written atomically to data/db.json. Daily copies kept 14 days.
const fs = require("fs"), path = require("path");
const DATA = process.env.DATA_DIR || "./data";
["files", "backups"].forEach(d => fs.mkdirSync(path.join(DATA, d), { recursive: true }));
const FILE = path.join(DATA, "db.json");
const EMPTY = () => ({ people: [], fleet: [], settings: {}, gps: {}, erp: [], adv: [], idle: [], local: [], places: [], placesToMap: {}, settlements: [], sessions: {}, log: [], meta: {} });
let db = EMPTY();
if (fs.existsSync(FILE)) db = Object.assign(EMPTY(), JSON.parse(fs.readFileSync(FILE, "utf8")));
let timer = null, mirrorDirty = false;
function flush() {
  clearTimeout(timer); timer = null;
  const tmp = FILE + ".tmp"; fs.writeFileSync(tmp, JSON.stringify(db)); fs.renameSync(tmp, FILE);
  const day = path.join(DATA, "backups", `db-${new Date(Date.now() + 19800e3).toISOString().slice(0, 10)}.json`);
  if (!fs.existsSync(day)) {
    fs.copyFileSync(FILE, day);
    fs.readdirSync(path.join(DATA, "backups")).sort().slice(0, -14).forEach(f => fs.unlinkSync(path.join(DATA, "backups", f)));
  }
}
const save = () => { mirrorDirty = true; if (!timer) timer = setTimeout(flush, 300); };
const replace = next => { Object.keys(db).forEach(k => delete db[k]); Object.assign(db, EMPTY(), next); save(); flush(); };
const log = (who, what, ref, detail) => { db.log.unshift({ t: new Date().toISOString(), who: who || "system", what, ref: ref || "", detail: detail || "" }); if (db.log.length > 3000) db.log.length = 3000; save(); };
process.on("SIGTERM", () => { flush(); process.exit(0); }); process.on("SIGINT", () => { flush(); process.exit(0); });
module.exports = { db, save, flush, replace, log, DATA, isDirty: () => mirrorDirty, clean: () => { mirrorDirty = false; } };
