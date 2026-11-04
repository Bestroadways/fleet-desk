// Import the OLD Fleet Desk sheet (the .xlsx you download from Google Sheets, or the live sheet through the service account).
// Safe by default: People / Fleet / Settings / Places only get what is MISSING (nothing you typed in the app is changed),
// history tabs (Advances, GPS days, ERP CNs, Local CNs, Idle, Settlements, Log) add records that are not there yet.
// replace = true overwrites the history from the file instead.
const XLSX = require("xlsx");
const { db, save, flush, log } = require("./store");
const { iso } = require("./util");
const SIO = require("./sheetio");
const { TYPES } = require("./constants");

const str = v => (v == null ? "" : String(v).trim());
const num = v => { const n = Number(String(v == null ? "" : v).replace(/[^0-9.\-]/g, "")); return isNaN(n) ? 0 : n; };
const wallISO = v => { if (typeof v === "number") return new Date(Math.round((v - 25569) * 864e5) - 19800e3).toISOString(); const t = Date.parse(v); return isNaN(t) ? "" : new Date(t).toISOString(); }; // sheet times are IST wall clock
const body = rows => (rows || []).slice(1);
const NAMES = ["People", "Fleet", "Settings", "Places", "Advances", "GPS days", "ERP CNs", "Local CNs (80 km)", "Idle explanations", "Settlements", "Places to map", "Log"];

function tabsFromXlsx(buf) {
  const wb = XLSX.read(buf, { type: "buffer" }), T = {};
  wb.SheetNames.forEach(n => { T[n] = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: "" }); });
  return T;
}
function addMissing(list, rows, keyOf, report, label) {
  const have = new Set(list.map(keyOf)); let n = 0;
  rows.forEach(r => { const k = keyOf(r); if (k && !have.has(k)) { list.push(r); have.add(k); n++; } });
  report[label] = n; return list;
}

function run(T, { replace = false } = {}) {
  const rep = {}, miss = NAMES.filter(n => !T[n]); if (miss.length === NAMES.length) throw new Error("This file has none of the Fleet Desk tabs. Download the Google Sheet as Microsoft Excel (.xlsx) and try again.");

  // ---- config tabs: add what is missing, never overwrite
  if (T["Fleet"]) addMissing(db.fleet, body(T["Fleet"]).filter(r => str(r[0])).map(r => ({ veh: str(r[0]).toUpperCase(), type: str(r[1]), driver: str(r[2]), cleaner: str(r[3]), base: str(r[4]), kmin: +r[5] || 2.4, kmax: +r[6] || 5.5, salary: +r[7] || 0, fuel: str(r[8]) === "CNG" ? "CNG" : "Diesel", device: str(r[9]), start: iso(r[10]), note: str(r[11]) })), f => f.veh, rep, "fleet");
  if (T["People"]) {
    const h = (T["People"][0] || []).map(str), ix = n => h.indexOf(n), nm = h.findIndex(x => /^name$/i.test(x)), at = (r, n) => (ix(n) < 0 ? "" : str(r[ix(n)]).replace(/^'/, ""));
    const rows = body(T["People"]).filter(r => /@/.test(str(r[0]))).map(r => ({ email: str(r[0]).toLowerCase(), name: nm >= 0 ? str(r[nm]) : str(r[1]), role: str(r[2]), mobile: at(r, "Mobile").replace(/\D/g, "").slice(-10), pin: at(r, "PIN").replace(/\D/g, ""), device: "" })); // old phone locks belong to the old address, so the first phone on the new app becomes theirs
    let filled = 0; rows.forEach(r => { const p = db.people.find(x => x.email === r.email); if (p) { if (!p.mobile && r.mobile) { p.mobile = r.mobile; filled++; } if (!p.pin && r.pin) { p.pin = r.pin; filled++; } } });
    addMissing(db.people, rows, p => p.email, rep, "people"); rep.peopleFilled = filled;
  }
  if (T["Settings"]) { let n = 0; body(T["Settings"]).forEach(r => { const k = str(r[0]); if (k && !(k in db.settings) && r[1] !== "" && r[1] != null) { db.settings[k] = typeof r[1] === "number" && /^\d{4}-\d{2}-\d{2}/.test(iso(r[1])) && /from|date/i.test(k) ? iso(r[1]) : r[1]; n++; } }); rep.settings = n; }
  if (T["Places"]) addMissing(db.places, body(T["Places"]).filter(r => str(r[0]) && +r[1] && +r[2]).map(r => ({ name: str(r[0]), lat: +r[1], lon: +r[2] })), p => p.name.toUpperCase(), rep, "places");

  // ---- history tabs
  const put = (cur, rows, keyOf, label) => { if (replace) { rep[label] = rows.length; return rows; } return addMissing(cur, rows, keyOf, rep, label); };
  if (T["GPS days"]) { const rows = body(T["GPS days"]).filter(r => str(r[0]) && str(r[1]) && r[2] !== "").map(r => ({ key: str(r[0]), veh: str(r[1]), date: iso(r[2]), km: +r[3] || 0, places: str(r[4]), first: str(r[5]), last: str(r[6]), halts: str(r[7]), tolls: str(r[8]), tollAmt: r[9] === "" ? "" : num(r[9]), note: str(r[10]), noteBy: str(r[11]), noteAt: SIO.stamp(r[12]), src: str(r[13]) }));
    if (replace) db.gps = {}; let n = 0; rows.forEach(g => { if (!db.gps[g.key]) { db.gps[g.key] = g; n++; } }); rep.gps = n; }
  if (T["ERP CNs"]) db.erp = put(db.erp, body(T["ERP CNs"]).filter(r => r[0] !== "" && str(r[1])).map(r => ({ date: iso(r[0]), cn: str(r[1]), veh: str(r[2]), kind: str(r[3]) || "Own", route: str(r[4]), km: +r[5] || 0, party: str(r[6]), frt: +r[7] || 0, ownHc: +r[8] || 0, hireHc: +r[9] || 0, wt: +r[10] || 0, src: str(r[11]) })), e => `${e.cn}|${e.date}|${e.veh}`, "erp").sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : String(b.cn).localeCompare(String(a.cn))));
  if (T["Advances"]) db.adv = put(db.adv, body(T["Advances"]).filter(r => str(r[0])).map(r => { const a = {}; SIO.ADV.forEach((k, i) => { const v = r[i]; a[k] = SIO.ADV_DATES.includes(k) ? iso(v) : SIO.ADV_STAMPS.includes(k) ? SIO.stamp(v) : SIO.ADV_NUMS.includes(k) ? (+v || 0) : k === "reviewed" ? v === true || /^true$/i.test(str(v)) : str(v); }); return a; }), a => a.id, "advances");
  if (T["Local CNs (80 km)"]) db.local = put(db.local, body(T["Local CNs (80 km)"]).filter(r => str(r[1])).map(r => { const o = {}; SIO.LOCAL.forEach((k, i) => { const v = r[i]; o[k] = ["date", "deliv", "pod"].includes(k) ? iso(v) : k === "fetched" ? wallISO(v) : ["km", "okm", "dkm", "frt", "own", "hire", "wt"].includes(k) ? +v || 0 : str(v); }); return o; }), l => l.cn, "local").sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : String(b.cn).localeCompare(String(a.cn))));
  if (T["Idle explanations"]) db.idle = put(db.idle, body(T["Idle explanations"]).filter(r => str(r[0])).map(r => ({ // the sheet's own layout: answer fields sit in columns 12–19, status in 19
    key: str(r[0]), date: iso(r[1]), veh: str(r[2]), status: str(r[3]), km: r[4] === "" ? "" : +r[4] || 0, where: str(r[5]), loads: str(r[6]), hire: r[7] === "" ? "" : +r[7] || 0, detected: Date.parse(wallISO(r[8])) || Date.now(), mails: +r[9] || 0, lastMailed: wallISO(r[10]),
    vehConfirmed: str(r[11]), reason: str(r[12]), details: str(r[13]), action: str(r[14]), explainedBy: str(r[15]), explainedAt: SIO.stamp(r[16]), hours: r[17] === "" ? "" : +r[17] || 0, photos: "", state: str(r[18]) || "Waiting for branch" })), r => r.key, "idle").sort((a, b) => (a.date < b.date ? 1 : -1));
  if (T["Settlements"]) db.settlements = put(db.settlements, body(T["Settlements"]).filter(r => str(r[0])).map(r => ({ key: str(r[0]), veh: str(r[1]), month: str(r[2]).replace(/^'/, ""), status: str(r[3]) || "Draft", salary: r[4] === "" ? "" : +r[4] || 0, tolls: r[5] === "" ? "" : +r[5] || 0, odoOpen: r[6] === "" ? "" : +r[6] || 0, odoClose: r[7] === "" ? "" : +r[7] || 0, kmRun: r[8], revenue: r[9], advances: r[10], result: r[11], legacyNote: str(r[12]), trail: str(r[13]) })), s => s.key, "settlements");
  if (T["Places to map"]) { let n = 0; body(T["Places to map"]).forEach(r => { const k = str(r[0]); if (k && !(k in db.placesToMap)) { db.placesToMap[k] = +r[1] || 0; n++; } }); rep.placesToMap = n; }
  if (T["Log"]) { const have = new Set(db.log.map(l => `${l.t}|${l.who}|${l.what}|${l.ref}`)); let n = 0;
    body(T["Log"]).filter(r => str(r[0])).forEach(r => { const l = { t: wallISO(r[0]), who: str(r[1]), what: str(r[2]), ref: str(r[3]), detail: str(r[4]) }; const k = `${l.t}|${l.who}|${l.what}|${l.ref}`; if (l.t && !have.has(k)) { db.log.push(l); have.add(k); n++; } });
    db.log.sort((a, b) => (a.t < b.t ? 1 : -1)); if (db.log.length > 3000) db.log.length = 3000; rep.log = n; }

  save(); flush();
  const { recheckAll } = require("./api"); rep.rechecked = recheckAll();
  const msg = Object.entries(rep).map(([k, v]) => `${k} ${v}`).join(" · ") + (miss.length ? `  (tabs not in the file: ${miss.join(", ")})` : "");
  log("system", "Old sheet imported", replace ? "replace" : "add missing", msg); return msg;
}
const fromXlsxBuffer = (buf, opt) => run(tabsFromXlsx(buf), opt);
const fromGoogle = async (id, opt) => run(await SIO.fetchTabs(id, NAMES), opt);
module.exports = { run, fromXlsxBuffer, fromGoogle, NAMES };
