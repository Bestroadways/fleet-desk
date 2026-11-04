// e-Fleet CN Dump [8006] -> own-truck CNs (what the rules engine needs).
const { db, save, log } = require("./store");
const { addDays, iso, today } = require("./util");
const API = "https://besttpiapi.efleetsystems.com/api/TPSBestAI/GetCNDump8006", START = "2026-09-01";
const norm = k => String(k).toLowerCase().replace(/[^a-z0-9]/g, "");
const get = (r, keys) => { const n = {}; Object.keys(r).forEach(k => { n[norm(k)] = r[k]; }); for (const k of keys) if (n[k] != null && n[k] !== "") return n[k]; return ""; };
const num = v => { const n = Number(String(v == null ? "" : v).replace(/[^0-9.\-]/g, "")); return isNaN(n) ? 0 : n; };
function erpDate(v) {
  const s = String(v || "").trim(); let m;
  if ((m = s.match(/^(\d{4}-\d{2}-\d{2})/))) return m[1];
  if ((m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/))) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  if ((m = s.match(/^(\d{1,2})[ -]([A-Za-z]{3})[a-z]*[ -,]+(\d{2,4})/))) { const M = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 }[m[2].toLowerCase()]; let y = +m[3]; if (y < 100) y += 2000; if (M) return `${y}-${String(M).padStart(2, "0")}-${m[1].padStart(2, "0")}`; }
  return "";
}
async function call(from, to) {
  const r = await fetch(`${API}?FromDate=${from}&Todate=${to}`, { headers: JSON.parse(process.env.API_HEADERS || "{}") });
  if (!r.ok) throw new Error(`e-Fleet ${r.status} for ${from}`);
  const j = await r.json(); if (Array.isArray(j)) return j; for (const k in j) if (Array.isArray(j[k])) return j[k]; return [];
}
const BELT = ["PANOLI", "ANKLESHWAR", "JHAGADIA", "KOSAMBA", "SAYAKHA", "SAYKHA", "DAHEJ", "BHARUCH", "VILAYAT", "PALEJ"];
const OWN_HC = ["ownhc", "ownvehiclehc", "ownvehiclecharges", "ownhirecharges", "ownhcamt"];
const HIRE_HC = ["hirehc", "hirecharges", "hirechargers", "hirechargesamt", "hireamount", "lorryhire", "hmamount", "hirevehiclecharges"];
// own trucks always; market hires only on the Ankleshwar belt (route starts at a belt place, up to 400 km, not Mysore)
function mkRow(x, fleet) {
  const own = fleet.has(x.veh);
  if (!own && !(BELT.some(b => x.route.startsWith(b)) && x.km > 0 && x.km <= 400 && !x.route.includes("MYSORE"))) return null;
  return { date: x.date, cn: x.cn, veh: x.veh, kind: own ? "Own" : "Market", route: x.route, km: x.km, party: x.party, frt: x.frt, ownHc: x.ownHc, hireHc: x.hireHc, wt: x.wt, src: x.src };
}
function replaceDates(rows, dates) {
  const prev = {}; db.erp.forEach(e => { if (e.cn) prev[String(e.cn)] = e; });
  rows.forEach(r => { const p = prev[String(r.cn)]; if (!p) return; ["frt", "ownHc", "hireHc"].forEach(k => { if (!(+r[k] > 0) && +p[k] > 0) r[k] = p[k]; }); }); // never lose freight / HC already loaded
  db.erp = db.erp.filter(e => !dates.has(e.date)).concat(rows).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : String(b.cn).localeCompare(String(a.cn)))); save();
}
function ingest(all, from, to) {
  const fleet = new Set(db.fleet.map(f => f.veh)), dates = new Set(), rows = [];
  all.forEach(r => {
    const d = erpDate(get(r, ["date", "cndate"])); if (!d) return; dates.add(d);
    const row = mkRow({ date: d, cn: String(get(r, ["cnno"])).replace("ANKLESHWAR-", "").trim(), veh: String(get(r, ["hirevehicleno", "hvvehicleno", "hvno"]) || get(r, ["vehicleno"])).trim(),
      route: String(get(r, ["route"])).trim().toUpperCase(), km: num(get(r, ["km", "routekm"])), party: String(get(r, ["billingparty"])).split(" - ")[0].split("(")[0].trim().slice(0, 28),
      frt: Math.round(num(get(r, ["totalfreight"]))), ownHc: Math.round(num(get(r, OWN_HC))), hireHc: Math.round(num(get(r, HIRE_HC))), wt: Math.round(num(get(r, ["actualweight"])) / 100) / 10, src: `ERP CN Dump [8006] · API ${from} → ${to}` }, fleet);
    if (row) rows.push(row);
  });
  replaceDates(rows, dates);
  const ownN = rows.filter(r => r.kind === "Own").length;
  let msg = `ERP ${from} → ${to}: ${all.length} CNs read, ${dates.size} days replaced, ${ownN} own, ${rows.length - ownN} belt market hires kept`;
  try { msg += " | " + require("./local").load(all, from, to); } catch (e) { msg += " | Local CNs: FAILED " + e.message; }
  log("system", "ERP CN API", `${from} → ${to}`, msg); return msg;
}
async function fetchRange(from, to) {
  let all = []; for (let a = from; a <= to; a = addDays(a, 4)) all = all.concat(await call(a, [addDays(a, 3), to].sort()[0]));
  return ingest(all, from, to);
}
async function catchUp() {
  const y = addDays(today(), -1), last = db.erp.reduce((m, e) => (e.date > m ? e.date : m), "");
  return fetchRange(last ? [addDays(last, -1), y].sort()[0] : START, y);
}
const rebuild = () => fetchRange(START, addDays(today(), -1));
module.exports = { fetchRange, ingest, catchUp, rebuild, mkRow, replaceDates, START, get, num, erpDate };
