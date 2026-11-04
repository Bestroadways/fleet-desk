// GTropy Trip Summary (Location) -> GPS days. Port of the Apps Script fetcher.
const { db, save, log } = require("./store");
const { addDays, range, today } = require("./util");
const GT_TOKENS = ["http://api-locate.com/api/v1.0/api/generate/token", "https://api-locate.com/api/v1.0/api/generate/token"], GT_DATA = "https://api-locate.com/api/v1.0/trip/summary/location";
const GT_MAX = 28, GT_START = "2026-10-01";
let tok = { v: "", exp: 0 };
async function token(fresh) {
  if (!fresh && tok.v && tok.exp > Date.now()) return tok.v;
  if (!process.env.GTROPY_CLIENT_ID) throw new Error("GTROPY_CLIENT_ID / GTROPY_CLIENT_SECRET not set");
  let r;
  for (const u of GT_TOKENS) { try { r = await fetch(u, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId: process.env.GTROPY_CLIENT_ID, clientSecret: process.env.GTROPY_CLIENT_SECRET }) }); if (r.ok) break; } catch (e) { r = null; } }
  if (!r || !r.ok) throw new Error("GTropy token: " + (r ? r.status : "host not reachable"));
  const j = await r.json(); const t = j.Token || j.token || (j.data && (j.data.Token || j.data.token)); if (!t) throw new Error("GTropy token: no Token in reply");
  tok = { v: t, exp: Date.now() + 50 * 60e3 }; return t;
}
const hms = x => { const m = String(x || "").match(/^(\d+):(\d{2}):(\d{2})/); return m ? +m[1] + m[2] / 60 + m[3] / 3600 : null; };
const dmy = x => String(x || "").replace(/^(\d{2})-(\d{2})-(\d{4})/, "$1/$2/$3");
async function call(veh, from, toNext) {
  const body = JSON.stringify({ vehicle: veh, fromDt: from + " 00:00", toDt: toNext + " 00:00" });
  const go = async t => fetch(GT_DATA, { method: "POST", headers: { "Content-Type": "application/json", token: t }, body });
  let r = await go(await token(false));
  if (r.status === 401 || r.status === 403) r = await go(await token(true));
  if (!r.ok) throw new Error(`GTropy ${r.status}: ${(await r.text()).slice(0, 150)}`);
  const t = (await r.text()).trim(); if (!t) return [];
  const j = JSON.parse(t), rows = Array.isArray(j) ? j : j.data || j.Data || j.result || [];
  return rows.filter(r => !/comprehensive|summary|total/i.test(String(r.From ?? r.from ?? ""))).map(r => ({ from: r.From ?? r.from ?? "", to: r.To ?? r.to ?? "",
    start: dmy(r["Start Date"] ?? r.startDate), end: dmy(r["End Date"] ?? r.endDate), km: String(r["Kms Covered"] ?? r.kms ?? 0).replace(/,/g, ""), totalH: hms(r["Total Time"]), idleH: hms(r["Idle Time"]) }));
}
function legsToDays(legs) {
  const p = s => { const m = String(s).match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/); return m ? { d: `${m[3]}-${m[2]}-${m[1]}`, t: `${m[4]}:${m[5]}`, ms: Date.UTC(+m[3], +m[2] - 1, +m[1], +m[4], +m[5]) } : null; };
  const clean = s => { s = String(s || "").replace(/#null/g, "").replace(/ (Entry|Exit)$/, "").trim(); return /^(Start|END)$/i.test(s) ? "" : s; };
  const z = n => String(n).padStart(2, "0"), days = {};
  legs.forEach(L => {
    const a = p(L.start); let b = p(L.end); if (!a || !b) return; const km = parseFloat(L.km) || 0;
    if (L.totalH != null && L.totalH * 36e5 > b.ms - a.ms + 6e4) { const e = new Date(a.ms + L.totalH * 36e5); b = { d: `${e.getUTCFullYear()}-${z(e.getUTCMonth() + 1)}-${z(e.getUTCDate())}`, t: `${z(e.getUTCHours())}:${z(e.getUTCMinutes())}`, ms: e.getTime() }; }
    const D = days[a.d] || (days[a.d] = { km: 0, places: [], moves: [], halts: [] }); D.km += km;
    [clean(L.from), clean(L.to)].forEach(x => { if (x && !D.places.includes(x)) D.places.push(x); });
    if (km > 1.5) D.moves.push(a.t, b.t);
    const hrs = L.idleH != null ? L.idleH : (b.ms - a.ms) / 36e5;
    if (hrs >= 6 && km < 60) D.halts.push(`${Math.round(hrs * 10) / 10} h at ${clean(L.from) || clean(L.to) || "—"} (${a.d.slice(8)}/${a.d.slice(5, 7)} ${a.t} → ${b.d.slice(8)}/${b.d.slice(5, 7)} ${b.t})`);
  });
  return days;
}
function upsert(veh, days, src, fillFrom, fillTo) {
  if (fillFrom) range(fillFrom, fillTo).forEach(d => { if (!days[d]) days[d] = { km: 0, places: [], moves: [], halts: [] }; });
  Object.keys(days).sort().forEach(d => {
    const D = days[d], key = `${veh}_${d}`, mv = D.moves.sort(), old = db.gps[key] || {};
    db.gps[key] = Object.assign({ tolls: "", tollAmt: "", note: "", noteBy: "", noteAt: "" }, old, { key, veh, date: d, km: Math.round(D.km * 10) / 10, places: D.places.slice(0, 10).join(" · "), first: mv[0] || "", last: mv[mv.length - 1] || "", halts: D.halts.slice(0, 4).join("\n"), src });
  }); save();
}
const lastDay = veh => Object.values(db.gps).filter(g => g.veh === veh).reduce((m, g) => (g.date > m ? g.date : m), "");
async function fetchRange(from, to, catchUp) {
  const out = [];
  for (const f of db.fleet) {
    const v = f.veh; let a = from;
    if (catchUp) { const last = lastDay(v); a = last ? [addDays(last, -1), from].sort()[0] : (f.start || GT_START); }
    if (f.start && a < f.start) a = f.start;
    if (a > to) { out.push(`${v}: up to date`); continue; }
    try {
      let legs = [];
      for (let s = a; s <= to; s = addDays(s, GT_MAX)) { const b = [addDays(s, GT_MAX - 1), to].sort()[0]; legs = legs.concat(await call(v, s, addDays(b, 1))); }
      const days = legsToDays(legs); Object.keys(days).forEach(d => { if (d < a || d > to) delete days[d]; });
      const km = Object.values(days).reduce((s, D) => s + D.km, 0); upsert(v, days, "GTropy API", a, to); out.push(`${v}: ${a} → ${to}, ${Math.round(km)} km`);
    } catch (e) { out.push(`${v}: FAILED ${e.message}`); }
  }
  log("system", "GTropy fetch", `${from} → ${to}`, out.join(" | ")); return out;
}
module.exports = { fetchRange, legsToDays, upsert };
