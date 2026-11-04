// Port of Apps Script flagsFor_ / dayStatus_ / level_ (35a). Pure functions: no sheet access.
const { addDays, diffDays, range, dmy, inr, km } = require("./util");
const { isFuel, FUEL_UNIT } = require("./constants");

function dayStatus(D, v, d) {
  const g = D.gps[`${v}_${d}`], c = D.erp[`${v}_${d}`] || [];
  if (!g) return { s: c.length ? "cn" : "nogps", km: null };
  if (c.length) return { s: "cn", km: g.km };
  if (g.km <= D.idleKm) return { s: "idle", km: g.km };
  for (let k = 1; k <= 5; k++) {
    const pc = D.erp[`${v}_${addDays(d, -k)}`]; if (!pc || !pc.length) continue;
    const lane = Math.max(...pc.map(x => x.km || 0)), L = D.leg;
    const win = lane <= L[0] ? L[1] : lane <= L[2] ? L[3] : L[4];
    if (k <= win) return { s: "leg", km: g.km };
  }
  return { s: "unbooked", km: g.km };
}

function flagsFor(a, all, D) {
  const F = [], v = D.fleet[a.veh] || { kmpl: [2.4, 5.5], cleaner: "", fuel: "Diesel" };
  const covers = !isFuel(a.type) && a.from ? [a.from, a.to || a.from] : null;
  const days = covers ? range(covers[0], covers[1]) : [a.date];
  const covered = x => (!isFuel(x.type) && x.from ? range(x.from, x.to || x.from) : [x.date]);
  if (!isFuel(a.type)) {
    const unb = days.map(d => [d, dayStatus(D, a.veh, d)]).filter(([, s]) => s.s === "unbooked");
    if (unb.length) F.push({ lv: "red", t: `Covers running with no billed CN: ${unb.map(([d, s]) => `${dmy(d)} (${km(s.km)})`).join(", ")}. Name the LR, or explain the movement.` });
    if (/park/i.test(a.purpose)) { const g = days.map(d => D.gps[`${a.veh}_${d}`]); if (g.length && g.every(x => x && x.km > 60 && !x.halts)) F.push({ lv: "amber", t: "Parking claimed, but GPS shows the truck running on every claimed day with no long halt." }); }
    if (covers) {
      const late = diffDays(covers[1], a.date); if (late > 3) F.push({ lv: "amber", t: `Claimed ${late} days after the work.` });
      all.filter(x => x.id !== a.id && x.veh === a.veh && x.type === a.type && x.status !== "Rejected" && x.from && covered(x).some(d => days.includes(d)))
        .forEach(x => F.push({ lv: "red", t: `Second ${a.typeLabel.toLowerCase()} claim for ${days.filter(d => covered(x).includes(d)).map(dmy).join(", ")}, also ${inr(x.amount)} on ${dmy(x.date)} (${x.id}).` }));
    }
    if (/conductor|cleaner|khalasi|helper/i.test(a.purpose) && !v.cleaner) F.push({ lv: "amber", t: "Conductor / cleaner expense, but no cleaner is on this vehicle's record." });
    if (a.type === "repair" && !a.bill) F.push({ lv: "amber", t: "Repair without a job card or bill." });
    else if (!a.legacy && ["Paid", "Closed"].includes(a.status) && !a.bill) F.push({ lv: "amber", t: "Bill / slip not attached yet." });
    const lim = D.limits[a.typeLabel]; if (lim && a.amount > lim) F.push({ lv: "audit", t: `Above the ${inr(lim)} branch limit for ${a.typeLabel.toLowerCase()}, needs audit sign-off.` });
  } else {
    const u = FUEL_UNIT[a.type], fuelName = a.type === "cng" ? "CNG" : "diesel", Fuel = a.type === "cng" ? "CNG" : "Diesel";
    const want = v.fuel === "CNG" ? "cng" : "diesel";
    if (a.type !== want) F.push({ lv: "red", t: `${a.veh} runs on ${want === "cng" ? "CNG" : "diesel"}, but this request is for ${fuelName}.` });
    if (!(a.odo > 0)) F.push({ lv: "amber", t: "No odometer reading." });
    else if (!a.legacy && !a.photo) F.push({ lv: "amber", t: "No odometer photo attached." });
    const fills = all.filter(x => x.veh === a.veh && x.type === a.type && x.id !== a.id && x.status !== "Rejected" && x.litres > 0 && x.date < a.date).sort((p, q) => (p.date < q.date ? -1 : 1));
    const last3 = fills.slice(-3), band = v.kmpl;
    if (last3.length >= 2) {
      const ds = range(last3[0].date, addDays(a.date, -1));
      if (ds.every(d => D.gps[`${a.veh}_${d}`])) {
        const k = ds.reduce((s, d) => s + D.gps[`${a.veh}_${d}`].km, 0), l = last3.reduce((s, x) => s + x.litres, 0), kmpl = k / l;
        if (kmpl < band[0]) F.push({ lv: "red", t: `${Fuel} bought since ${dmy(last3[0].date)} (${l.toFixed(0)} ${u}) is more than GPS running supports: ${km(k)} → ${kmpl.toFixed(2)} km/${u}, below ${band[0]}.` });
        else if (kmpl > band[1]) F.push({ lv: "amber", t: `GPS running since ${dmy(last3[0].date)} (${km(k)}) is more than the ${fuelName} bought (${l.toFixed(0)} ${u}) supports: ${kmpl.toFixed(2)} km/${u}. ${Fuel} from elsewhere?` });
      }
    }
    const prev = fills.slice().reverse().find(x => x.odo > 0);
    if (a.odo > 0 && prev) {
      const delta = a.odo - prev.odo, ds = range(prev.date, addDays(a.date, -1));
      if (ds.every(d => D.gps[`${a.veh}_${d}`])) {
        const gk = ds.reduce((s, d) => s + D.gps[`${a.veh}_${d}`].km, 0);
        if (gk > 0 && Math.abs(delta - gk) / gk > 0.15) F.push({ lv: "amber", t: `Odometer moved ${km(delta)} since ${dmy(prev.date)}, GPS shows ${km(gk)} (${Math.round(Math.abs(delta - gk) / gk * 100)}% apart).` });
      }
      if (delta < 0) F.push({ lv: "red", t: `Odometer reading is lower than the last one (${prev.odo}).` });
    }
    if (a.litres > 0 && a.amount > 0) {
      const rate = a.amount / a.litres;
      const rb = a.type === "cng" ? [D.cngMin, D.cngMax] : [85, 110];
      if (rate < rb[0] || rate > rb[1]) F.push({ lv: "amber", t: `₹${rate.toFixed(2)}/${u} looks off for ${fuelName} (expected ₹${rb[0]}–${rb[1]}).` });
    }
    if (a.type === "cng" && !a.legacy && !a.driverPhoto) F.push({ lv: "amber", t: "No photo of the driver at the CNG pump." });
    if (a.type === "cng" && !a.legacy && ["Paid", "Closed"].includes(a.status) && !a.bill) F.push({ lv: "amber", t: "CNG pump slip / meter photo not attached yet." });
  }
  return F;
}
const level = F => (F.some(f => f.lv === "red") ? "Red" : F.some(f => f.lv === "audit") ? "Audit" : F.some(f => f.lv === "amber") ? "Amber" : "OK");
const flagText = F => (F.length ? F.map(f => "• " + f.t).join("\n") : "All checks pass against GPS and the ERP register.");
module.exports = { dayStatus, flagsFor, level, flagText };
