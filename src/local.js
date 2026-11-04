// Local CNs: every CN whose route starts and ends within 80 km (straight line) of Ankleshwar — own + market, all booking offices.
// Market CNs booked while one of our trucks was free nearby are marked "free" (these feed the idle-watch CN explanations).
const { db, save } = require("./store");
const { addDays, iso } = require("./util");
const { get, num, erpDate } = require("./erp");
const LOCAL_R = 80, ANK = [21.6264, 73.0152];
const ALIAS = { BARODA: "VADODARA", SAYKHA: "SAYAKHA", ANKLESWAR: "ANKLESHWAR", ANKLESHWER: "ANKLESHWAR", JHAGHADIA: "JHAGADIA", JAGADIA: "JHAGADIA" };
function kmBetween(a, b) {
  const r = x => x * Math.PI / 180, dLa = r(b[0] - a[0]), dLo = r(b[1] - a[1]);
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(r(a[0])) * Math.cos(r(b[0])) * Math.sin(dLo / 2) ** 2;
  return Math.round(2 * 6371 * Math.asin(Math.sqrt(h)) * 10) / 10;
}
const places = () => { const P = {}; db.places.forEach(p => { if (!p.name || !(+p.lat) || !(+p.lon)) return; String(p.name).split("/").forEach(n => { n = n.trim().toUpperCase(); if (n) P[n] = [+p.lat, +p.lon]; }); }); return P; };
const placeName = s => { const n = String(s || "").toUpperCase().replace(/#NULL/g, "").replace(/\b(ENTRY|EXIT)\b/g, "").replace(/\(.*?\)/g, "").replace(/\s+/g, " ").trim(); return ALIAS[n] || n; };
const placeKm = (n, P) => { const k = placeName(n); return P[k] ? kmBetween(ANK, P[k]) : null; };
function nearestKm(text, P) {
  let best = null;
  String(text || "").split(/·|\n/).forEach(x => { const m = x.match(/h at (.+?) \(/), n = (m ? m[1] : x).trim(); if (!n) return; const k = placeKm(n, P); if (k !== null && (best === null || k < best)) best = k; });
  return best;
}
function load(list, from, to) {
  const P = places(), fleet = new Set(db.fleet.map(f => f.veh)), idleKm = +db.settings["Idle day: GPS km at or below"] || 15;
  const notes = {}; db.local.forEach(r => { if (r.note) notes[r.cn] = r.note; });
  const gps = {}, near = {};
  Object.values(db.gps).forEach(g => { gps[g.key] = +g.km || 0; near[g.key] = nearestKm(g.places + " · " + g.halts, P); });
  Object.keys(near).forEach(k => { // an idle day has no places: the truck is where it last stood (look back 10 days)
    if (near[k] !== null || !(gps[k] <= idleKm)) return; const v = k.slice(0, k.lastIndexOf("_")), d = k.slice(k.lastIndexOf("_") + 1);
    for (let i = 1; i <= 10; i++) { const p = near[`${v}_${addDays(d, -i)}`]; if (p === undefined) continue; if (p !== null) { near[k] = p; break; } if (gps[`${v}_${addDays(d, -i)}`] > idleKm) break; }
  });
  const ownCnDays = new Set(), unmapped = {}, out = [];
  list.forEach(r => { const v = String(get(r, ["hirevehicleno"]) || get(r, ["vehicleno"])).trim(), d = erpDate(get(r, ["date", "cndate"])); if (fleet.has(v) && d) { ownCnDays.add(`${v}_${d}`); ownCnDays.add(`${v}_${addDays(d, 1)}`); } });
  list.forEach(r => {
    const route = String(get(r, ["route"])).trim(); if (!route || /MYSORE/i.test(route)) return;
    const [o, de] = route.split(" - ").map(x => (x || "").trim()), ok = placeKm(o, P), dk = placeKm(de, P);
    const ankl = /ANKLESHWAR/i.test(String(get(r, ["lroffice"])) + String(get(r, ["billingoffice"])) + String(get(r, ["hmbalpymtoffice"])));
    if (ankl) [o, de].forEach(x => { const n = placeName(x); if (n && !P[n]) unmapped[n] = (unmapped[n] || 0) + 1; });
    if (ok === null || dk === null || ok > LOCAL_R || dk > LOCAL_R) return;
    const di = erpDate(get(r, ["date", "cndate"])); if (!di) return;
    const v = String(get(r, ["hirevehicleno"]) || get(r, ["vehicleno"])).trim(), own = fleet.has(v);
    const total = num(get(r, ["totalfreight"])), tax = num(get(r, ["servicetax", "gst", "taxamount"]));
    const hire = num(get(r, ["hirehc", "hirecharges", "hirechargers", "hirechargesamt", "hireamount", "lorryhire", "hmamount", "hirevehiclecharges"]));
    let free = "", freeVeh = "";
    if (!own) for (const t of fleet) {
      const k = `${t}_${di}`, km = gps[k], nk = near[k];
      if (km === undefined || nk === null || nk === undefined || nk > LOCAL_R) continue;
      if (km <= idleKm) { free = `Yes — idle nearby (${km} km run, ${nk} km from Ankleshwar)`; freeVeh = t; break; }
      if (!ownCnDays.has(k)) { free = `Yes — running nearby, no CN (${km} km)`; freeVeh = t; break; }
    }
    const cn = String(get(r, ["cnno"])).replace("ANKLESHWAR-", "").trim();
    out.push({ date: di, cn, veh: v, kind: own ? "Own" : "Market", route, km: num(get(r, ["km", "routekm"])), okm: ok, dkm: dk, party: String(get(r, ["billingparty"])).split(" - ")[0].trim(), office: String(get(r, ["lroffice"])),
      frt: Math.round(total - tax), own: num(get(r, ["ownhc", "ownvehiclehc", "ownvehiclecharges", "ownhirecharges", "ownhcamt"])), hire, wt: Math.round(num(get(r, ["actualweight"])) / 100) / 10,
      broker: String(get(r, ["broker"]) || get(r, ["hvparty", "hirevehicleparty"])), fm: String(get(r, ["hmno"])), deliv: erpDate(get(r, ["unloaddate"])), pod: erpDate(get(r, ["podreceiptdate", "poddate"])), bill: String(get(r, ["billno"])),
      fetched: new Date().toISOString(), free, freeVeh, note: notes[cn] || "" });
  });
  db.local = db.local.filter(r => !(r.date >= from && r.date <= to)).concat(out).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : String(b.cn).localeCompare(String(a.cn))));
  const pm = Object.assign({}, db.placesToMap); Object.keys(unmapped).forEach(n => { pm[n] = Math.max(pm[n] || 0, unmapped[n]); }); Object.keys(P).forEach(n => delete pm[n]); db.placesToMap = pm;
  save();
  const mk = out.filter(r => r.kind === "Market"), fr = mk.filter(r => r.free);
  return `Local CNs ${from} → ${to}: ${out.length} (${out.length - mk.length} own, ${mk.length} market, ₹${Math.round(mk.reduce((s, r) => s + r.hire, 0)).toLocaleString("en-IN")} hire; ${fr.length} while our truck was free)`;
}
module.exports = { load, kmBetween };
