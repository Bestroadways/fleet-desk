// Google Sheet <-> JSON. Same tab layout in the source sheet and in the backup sheet.
//   import  : SOURCE_SHEET_ID  -> JSON  (Fleet, People, Settings, GPS days, ERP CNs, Advances)
//   mirror  : JSON -> BACKUP_SHEET_ID   (all tabs, plain values, every 2 min when something changed)
//   restore : BACKUP_SHEET_ID  -> JSON  (also brings back Idle explanations)
const { JWT } = require("google-auth-library");
const { db, replace, clean } = require("./store");
const { iso } = require("./util");
const IST = 19800e3, enc = encodeURIComponent;
const auth = () => new JWT({ keyFile: process.env.GOOGLE_KEY_FILE, scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
let _a; const A_ = () => _a || (_a = auth());
const base = id => `https://sheets.googleapis.com/v4/spreadsheets/${id}`;
const str = v => (v == null ? "" : String(v).trim());
const stamp = v => { if (typeof v !== "number") return str(v); const d = new Date(Math.round((v - 25569) * 864e5) + IST - IST).toISOString(); return `${d.slice(8, 10)}-${d.slice(5, 7)}-${d.slice(0, 4)} ${d.slice(11, 16)}`; };

const ADV = ["id", "veh", "date", "type", "amount", "litres", "odo", "mode", "from", "to", "cn", "purpose", "photo", "bill", "status", "level", "flags", "note", "payref", "reviewed", "raisedBy", "raisedAt", "approvedBy", "approvedAt", "auditBy", "auditAt", "paidBy", "paidAt", "closedBy", "closedAt", "source", "trail", "driverPhoto"];
const ADV_DATES = ["date", "from", "to"], ADV_STAMPS = ["raisedAt", "approvedAt", "auditAt", "paidAt", "closedAt"], ADV_NUMS = ["amount", "litres", "odo"];
const GPS = ["key", "veh", "date", "km", "places", "first", "last", "halts", "tolls", "tollAmt", "note", "noteBy", "noteAt", "src"];
const ERP = ["date", "cn", "veh", "kind", "route", "km", "party", "frt", "own", "hire", "wt", "src"];
const FLEET = ["veh", "type", "driver", "cleaner", "base", "kmin", "kmax", "salary", "fuel", "device", "start", "note"];
const IDLE = ["key", "date", "veh", "status", "km", "where", "loads", "hire", "detected", "mails", "lastMailed", "vehConfirmed", "reason", "details", "action", "explainedBy", "explainedAt", "hours", "photos", "state"];
const PEOPLE = ["Email", "Name", "Role", "Mobile", "PIN", "App device"];
const LOCAL = ["date", "cn", "veh", "kind", "route", "km", "okm", "dkm", "party", "office", "frt", "own", "hire", "wt", "broker", "fm", "deliv", "pod", "bill", "fetched", "free", "freeVeh", "note"];
const STL = ["key", "veh", "month", "status", "salary", "tolls", "odoOpen", "odoClose", "kmRun", "revenue", "advances", "result", "legacyNote", "trail"];

async function getRanges(id, ranges) {
  const q = ranges.map(r => "ranges=" + enc(r)).join("&");
  return (await A_().request({ url: `${base(id)}/values:batchGet?${q}&valueRenderOption=UNFORMATTED_VALUE` })).data.valueRanges.map(v => v.values || []);
}
async function ensureTabs(id, names) {
  const m = (await A_().request({ url: `${base(id)}?fields=sheets.properties.title` })).data.sheets.map(s => s.properties.title);
  const add = names.filter(n => !m.includes(n)); if (!add.length) return;
  await A_().request({ url: `${base(id)}:batchUpdate`, method: "POST", data: { requests: add.map(title => ({ addSheet: { properties: { title } } })) } });
}
async function writeTab(id, tab, header, rows) {
  await A_().request({ url: `${base(id)}/values/${enc(`'${tab}'`)}:clear`, method: "POST", data: {} });
  const values = [header].concat(rows);
  for (let i = 0; i < values.length; i += 5000) // chunks keep every request small
    await A_().request({ url: `${base(id)}/values/${enc(`'${tab}'!A${i + 1}`)}?valueInputOption=RAW`, method: "PUT", data: { values: values.slice(i, i + 5000) } });
}

async function mirror() {
  const id = process.env.BACKUP_SHEET_ID; if (!id) return "BACKUP_SHEET_ID not set";
  clean();
  try {
    await ensureTabs(id, ["Advances", "GPS days", "ERP CNs", "Fleet", "People", "Settings", "Idle explanations", "Local CNs (80 km)", "Places", "Places to map", "Settlements", "Log"]);
    await writeTab(id, "Advances", ADV, db.adv.map(a => ADV.map(k => (a[k] == null ? "" : a[k]))));
    await writeTab(id, "GPS days", GPS, Object.values(db.gps).map(g => GPS.map(k => (g[k] == null ? "" : g[k]))));
    await writeTab(id, "ERP CNs", ERP, db.erp.map(e => ERP.map(k => (k === "kind" ? e.kind || "Own" : k === "own" ? e.ownHc ?? "" : k === "hire" ? e.hireHc ?? "" : e[k] == null ? "" : e[k]))));
    await writeTab(id, "Fleet", FLEET, db.fleet.map(f => FLEET.map(k => (f[k] == null ? "" : f[k]))));
    await writeTab(id, "People", PEOPLE, db.people.map(p => [p.email, p.name, p.role, "'" + (p.mobile || ""), "'" + (p.pin || ""), p.device || ""]));
    await writeTab(id, "Settings", ["Setting", "Value"], Object.entries(db.settings));
    await writeTab(id, "Idle explanations", IDLE, db.idle.map(r => IDLE.map(k => (r[k] == null ? "" : r[k]))));
    await writeTab(id, "Local CNs (80 km)", LOCAL, db.local.map(r => LOCAL.map(k => (r[k] == null ? "" : r[k]))));
    await writeTab(id, "Places", ["Place", "Lat", "Lon"], db.places.map(p => [p.name, p.lat, p.lon]));
    await writeTab(id, "Places to map", ["Place", "Count"], Object.entries(db.placesToMap));
    await writeTab(id, "Settlements", STL, db.settlements.map(r => STL.map(k => (r[k] == null ? "" : r[k]))));
    await writeTab(id, "Log", ["When", "Who", "What", "Ref", "Detail"], db.log.slice(0, 1000).map(l => [l.t, l.who, l.what, l.ref, l.detail]));
    return "mirrored";
  } catch (e) { require("./store").save(); throw e; } // stay dirty -> retry
}

async function readAll(id, full) {
  const tabs = ["Fleet", "People", "Settings", "GPS days", "ERP CNs", "Advances", "Places", "Settlements"].concat(full ? ["Idle explanations", "Local CNs (80 km)", "Places to map"] : []);
  const R = await getRanges(id, tabs.map(t => `'${t}'!A:AG`));
  const [fleet, people, settings, gps, erp, adv, plc, stl, idle, local, ptm] = R;
  const out = {};
  out.fleet = fleet.slice(1).filter(r => str(r[0])).map(r => ({ veh: str(r[0]), type: str(r[1]), driver: str(r[2]), cleaner: str(r[3]), base: str(r[4]), kmin: +r[5] || 2.4, kmax: +r[6] || 5.5, salary: +r[7] || 0, fuel: str(r[8]) || "Diesel", device: str(r[9]), start: iso(r[10]), note: str(r[11]) }));
  const h = (people[0] || []).map(str), ix = n => h.indexOf(n), nm = h.findIndex(x => /^name$/i.test(x));
  const at = (r, n) => (ix(n) < 0 ? "" : str(r[ix(n)]).replace(/^'/, ""));
  out.people = people.slice(1).filter(r => str(r[0])).map(r => ({ email: str(r[0]).toLowerCase(), name: nm >= 0 ? str(r[nm]) : str(r[1]), role: str(r[2]), mobile: at(r, "Mobile").replace(/\D/g, "").slice(-10), pin: at(r, "PIN").replace(/\D/g, ""), device: at(r, "App device") }));
  out.settings = {}; settings.forEach(r => { if (str(r[0]) && str(r[0]) !== "Setting") out.settings[str(r[0])] = r[1] == null ? "" : r[1]; });
  out.gps = {}; gps.slice(1).forEach(r => { if (r[0] && r[1] && r[2]) { const g = {}; GPS.forEach((k, i) => { g[k] = ["date"].includes(k) ? iso(r[i]) : ["km"].includes(k) ? +r[i] || 0 : k === "noteAt" ? stamp(r[i]) : str(r[i]); }); out.gps[g.key] = g; } });
  out.erp = erp.slice(1).filter(r => r[0] && str(r[1])).map(r => ({ date: iso(r[0]), cn: str(r[1]), veh: str(r[2]), kind: str(r[3]) || "Own", route: str(r[4]), km: +r[5] || 0, party: str(r[6]), frt: +r[7] || 0, ownHc: +r[8] || 0, hireHc: +r[9] || 0, wt: +r[10] || 0, src: str(r[11]) }));
  out.adv = adv.slice(1).filter(r => str(r[0])).map(r => { const a = {}; ADV.forEach((k, i) => { const v = r[i]; a[k] = ADV_DATES.includes(k) ? iso(v) : ADV_STAMPS.includes(k) ? stamp(v) : ADV_NUMS.includes(k) ? (+v || 0) : k === "reviewed" ? v === true || v === "TRUE" : str(v); }); return a; });
  out.places = plc.slice(1).filter(r => str(r[0]) && +r[1] && +r[2]).map(r => ({ name: str(r[0]), lat: +r[1], lon: +r[2] }));
  out.settlements = stl.slice(1).filter(r => str(r[0])).map(r => { const o = {}; STL.forEach((k, i) => { o[k] = k === "month" ? str(r[i]).replace(/^'/, "") : ["trail", "legacyNote", "status", "key", "veh"].includes(k) ? str(r[i]) : r[i] === undefined ? "" : r[i]; }); return o; });
  if (full) { out.local = local.slice(1).filter(r => str(r[1])).map(r => { const o = {}; LOCAL.forEach((k, i) => { o[k] = ["date", "deliv", "pod"].includes(k) ? iso(r[i]) : ["km", "okm", "dkm", "frt", "own", "hire", "wt"].includes(k) ? +r[i] || 0 : str(r[i]); }); return o; });
    out.placesToMap = {}; ptm.slice(1).forEach(r => { if (str(r[0])) out.placesToMap[str(r[0])] = +r[1] || 0; }); }
  if (full) out.idle = idle.slice(1).filter(r => str(r[0])).map(r => { const o = {}; IDLE.forEach((k, i) => { o[k] = k === "date" ? iso(r[i]) : ["detected", "mails", "hours"].includes(k) ? +r[i] || 0 : str(r[i]); }); return o; });
  return out;
}
// every tab of a Google Sheet as plain rows (same shape the .xlsx importer uses)
async function fetchTabs(id, names) {
  const R = await getRanges(id, names.map(t => `'${t}'!A:AG`)), T = {}; names.forEach((n, i) => { T[n] = R[i]; }); return T;
}
async function importFrom(id, full) {
  const d = await readAll(id, full);
  const keep = { sessions: db.sessions, log: db.log, meta: db.meta, idle: full ? d.idle : db.idle, local: full ? d.local : db.local, placesToMap: full ? d.placesToMap : db.placesToMap };
  replace(Object.assign({}, d, keep));
  return `fleet ${d.fleet.length}, people ${d.people.length}, gps ${Object.keys(d.gps).length}, erp ${d.erp.length}, advances ${d.adv.length}` + (full ? `, idle ${d.idle.length}` : "");
}
module.exports = { mirror, importFrom, fetchTabs, ADV, ADV_DATES, ADV_STAMPS, ADV_NUMS, GPS, LOCAL, STL, stamp };
