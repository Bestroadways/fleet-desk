// Day ledger, Market hire watch and monthly Settlement — same rules as the sheet's own tabs
// (Day ledger rows 8–38, Market hire watch, Settlement B7:B34).
const { db, save, log } = require("./store");
const { range, addDays, today, nowStr } = require("./util");
const { dayStatus } = require("./rules");
const loadData = () => require("./api").loadData();
const S = (n, d) => (db.settings[n] != null && String(db.settings[n]) !== "" ? +db.settings[n] || d : d);

const monthDays = m => { const d = new Date(`${m}-01T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + 1); d.setUTCDate(0); return range(`${m}-01`, d.toISOString().slice(0, 10)); };
const allVeh = () => { const set = new Set(db.fleet.map(f => f.veh)); [...Object.values(db.gps).map(g => g.veh), ...db.settlements.map(s => s.veh), ...db.adv.map(a => a.veh)].forEach(v => { if (v) set.add(v); }); return [...set]; };
// The sheet lists every day of the month. Days before the truck joined the desk (Fleet "On this desk from") don't count.
// A truck that left the desk (not on Fleet any more): only the days from its first to its last GPS day in that month.
function ledgerDays(veh, m) {
  const f = db.fleet.find(x => x.veh === veh), days = monthDays(m);
  if (f) return days.filter(d => !f.start || d >= f.start);
  const have = days.filter(d => db.gps[`${veh}_${d}`]); return have.length ? range(have[0], have[have.length - 1]) : [];
}
const rec = (veh, m) => db.settlements.find(s => s.key === `${veh}_${m}`);
const ensure = (veh, m) => { let r = rec(veh, m); if (!r) { r = { key: `${veh}_${m}`, veh, month: m, status: "Draft", salary: "", tolls: "", odoOpen: "", odoClose: "", kmRun: "", revenue: "", advances: "", result: "", legacyNote: "", trail: "" }; db.settlements.push(r); save(); } return r; };
const LABEL = { cn: "Billed CN", leg: "On CN trip", idle: "Idle", unbooked: "Running, no CN", nogps: "No GPS" };

function dayRows(veh, m) {
  const D = loadData(), maxKm = S("Market hire watch: max km", 350), maxWt = S("Market hire watch: max weight T", 16);
  return ledgerDays(veh, m).map(d => {
    const st = dayStatus(D, veh, d), g = db.gps[`${veh}_${d}`] || {}, free = st.s === "idle" || st.s === "unbooked";
    const mk = free ? db.erp.filter(e => e.kind === "Market" && e.date === d && e.km > 0 && e.km <= maxKm && e.wt > 0 && e.wt <= maxWt) : [];
    return { date: d, status: st.s, label: LABEL[st.s], km: g.km == null ? 0 : g.km, hasGps: g.km != null, places: g.places || "", halts: g.halts || "", note: g.note || "", noteBy: g.noteBy || "", tollAmt: g.tollAmt || "",
      cns: db.erp.filter(e => e.veh === veh && e.date === d && (!e.kind || e.kind === "Own")).map(e => ({ cn: e.cn, route: e.route, ownHc: e.ownHc || 0 })),
      advs: db.adv.filter(a => a.veh === veh && a.status !== "Rejected" && ((a.from && a.from <= d && (a.to || a.from) >= d) || (!a.from && a.date === d))).map(a => ({ id: a.id, type: a.type, amount: a.amount, status: a.status })),
      market: mk.length, idle: (db.idle.find(r => r.key === `${veh}_${d}`) || {}).state || "", _mk: mk };
  });
}
function ledger(veh, m) {
  const rows = dayRows(veh, m);
  const summary = { gpsKm: Math.round(rows.reduce((s, r) => s + r.km, 0) * 10) / 10, billed: rows.filter(r => r.status === "cn").length, trip: rows.filter(r => r.status === "leg").length, idle: rows.filter(r => r.status === "idle").length,
    unbooked: rows.filter(r => r.status === "unbooked").length, noNote: rows.filter(r => r.status === "unbooked" && !String(r.note).trim()).length, noGps: rows.filter(r => r.status === "nogps").length };
  return { rows: rows.map(({ _mk, ...r }) => r).reverse(), summary };
}
function market(veh, m) {
  const rows = dayRows(veh, m), list = [];
  rows.forEach(r => r._mk.forEach(e => list.push({ date: e.date, cn: e.cn, route: e.route, km: e.km, frt: e.frt || 0, hire: e.hireHc || 0, wt: e.wt, veh: e.veh, party: e.party, truck: `${r.label} · ${Math.round(r.km)} km` })));
  list.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : String(a.cn).localeCompare(String(b.cn))));
  return { rows: list, days: rows.filter(r => r.market > 0).length, hire: list.reduce((s, x) => s + x.hire, 0), loads: list.length, maxKm: S("Market hire watch: max km", 350), maxWt: S("Market hire watch: max weight T", 16) };
}
function figures(veh, m) {
  const rows = dayRows(veh, m), r = ensure(veh, m), f = db.fleet.find(x => x.veh === veh) || {};
  const inMonth = a => a.veh === veh && String(a.date).startsWith(m), advs = db.adv.filter(a => inMonth(a) && a.status !== "Rejected");
  const kmRun = Math.round(monthDays(m).reduce((s, d) => s + ((db.gps[`${veh}_${d}`] || {}).km || 0), 0) * 10) / 10;                    // Day ledger D3
  const earned = db.erp.filter(e => e.veh === veh && (!e.kind || e.kind === "Own") && e.date.startsWith(m)).reduce((s, e) => s + (+e.ownHc || 0), 0); // Own HC on own CNs
  const TYPES = ["Diesel", "CNG", "Trip advance", "Dala / loading", "Parking", "Repair", "Toll / green tax", "Meal / driver exp", "Other"];
  const byType = TYPES.map(t => ({ type: t, amount: advs.filter(a => a.type === t).reduce((s, a) => s + (+a.amount || 0), 0) })), advances = byType.reduce((s, x) => s + x.amount, 0);
  const salary = r.salary !== "" && r.salary != null ? +r.salary : (+f.salary || 0), tolls = +r.tolls || 0, odoOpen = +r.odoOpen || 0, odoClose = +r.odoClose || 0;
  const fuel = advs.filter(a => a.type === "Diesel" || a.type === "CNG"), qty = fuel.reduce((s, a) => s + (+a.litres || 0), 0);
  const mk = market(veh, m), result = Math.round(earned - advances - salary - tolls);
  const cnt = (fn, list) => list.filter(fn).length, notRC = a => a.status !== "Rejected" && a.status !== "Closed";
  const c = [
    ["GPS loaded for every day", rows.filter(x => x.status === "nogps").length, n => `Days with no GPS: ${n}`],
    ["Branch note on every running-no-CN day", rows.filter(x => x.status === "unbooked" && !String(x.note).trim()).length, n => `Days still without a note: ${n}`],
    ["Every flagged advance reviewed by audit", cnt(a => ["Red", "Audit"].includes(a.level) && !a.auditBy && notRC(a), advs), n => `Flagged, not yet reviewed: ${n}`],
    ["No advance still open", cnt(a => ["Raised", "Awaiting audit", "Approved"].includes(a.status), advs), n => `Still open: ${n}`],
    ["Bill on every paid advance", cnt(a => a.status === "Paid" && a.type !== "Diesel" && !a.bill && !/legacy/i.test(a.source || ""), advs), n => `Paid without a bill: ${n}`],
  ].map(([label, n, d]) => ({ label, ok: n === 0, detail: d(n) }));
  c.push({ label: "Opening and closing odometer entered", ok: odoOpen > 0 && odoClose > 0, detail: "Type both on this screen" }, { label: "FASTag toll total entered", ok: tolls > 0, detail: "Month total from the FASTag e-statement" });
  return { veh, month: m, status: r.status, trail: r.trail, legacyNote: r.legacyNote, days: rows.length,
    kmRun, earned, advances, byType, salary, tolls, odoOpen, odoClose, odoKm: odoOpen > 0 && odoClose > 0 ? Math.round((odoClose - odoOpen) * 10) / 10 : 0, result,
    fuelQty: Math.round(qty * 10) / 10, kmPerUnit: qty ? Math.round(kmRun / qty * 100) / 100 : 0, marketHire: mk.hire, checks: c, ready: c.every(x => x.ok) };
}

const STEPS = {
  submit: { what: "sent to audit", role: "stlPrep", from: ["Draft", "Held", "Settled outside portal — void"], to: "With Internal Audit" },
  clear: { what: "audit cleared", role: "stlClear", from: ["With Internal Audit"], to: "Cleared by audit", ready: true },
  hold: { what: "held by audit", role: "stlClear", from: ["With Internal Audit"], to: "Held", note: true },
  settle: { what: "settled", role: "stlPrep", from: ["Cleared by audit"], to: "Settled" },
};
function act(who, can, veh, m, action, note) {
  const s = STEPS[action]; if (!s) throw new Error("Unknown settlement step."); if (!can(s.role)) throw new Error("Your role can't do this.");
  const r = ensure(veh, m); if (!s.from.includes(r.status)) throw new Error(`Settlement ${r.key} is "${r.status}", this step needs: ${s.from.join(" / ")}.`);
  const F = figures(veh, m); if (s.ready && !F.ready) throw new Error('Every check under "Before it can settle" must be green first.');
  note = String(note || "").trim(); if (s.note && !note) throw new Error("A hold needs a written reason.");
  r.status = s.to; if (s.to === "Settled") Object.assign(r, { kmRun: F.kmRun, revenue: F.earned, advances: F.advances, result: F.result }); // frozen figures, as the sheet does
  r.trail = (r.trail ? r.trail + "\n" : "") + `${nowStr()} · ${s.what}${note ? " — " + note : ""} · ${who}`; save(); log(who, "Settlement " + s.what, r.key, note); return r.status;
}
module.exports = { ledger, market, figures, act, ensure, allVeh };
