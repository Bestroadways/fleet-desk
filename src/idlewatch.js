// Every morning: own-truck days that were idle, or ran with no CN -> record + mail the branch (re-mailed until answered).
const { db, save, log } = require("./store");
const { addDays, range, today, dmy } = require("./util");
const { dayStatus } = require("./rules");
const loadData = () => require("./api").loadData();
const mail = require("./mail");
const LOOKBACK = 7;
function run() {
  if (!mail.S("Idle watch from")) { db.settings["Idle watch from"] = today(); save(); } // first run: starts counting from today, like the sheet
  const D = loadData(), S = mail.S, start = S("Idle watch from") || today(), y = addDays(today(), -1), from = [addDays(y, -LOOKBACK + 1), start].sort().pop(), fresh = [];
  db.fleet.forEach(f => range(from, y).forEach(d => {
    const st = dayStatus(D, f.veh, d); if (!["idle", "unbooked"].includes(st.s)) return;
    const key = `${f.veh}_${d}`, g = db.gps[key] || {}; if (db.idle.some(r => r.key === key)) return; if (String(g.note || "").trim()) return;
    const loads = db.local.filter(l => l.kind === "Market" && l.date === d);
    db.idle.push({ key, date: d, veh: f.veh, status: st.s === "idle" ? "Idle" : "Running, no CN", km: st.km, where: [g.halts, g.places].filter(String).join("\n"), loads: loads.map(l => `${l.cn} ${l.route} (${l.veh})`).join("\n"), hire: loads.reduce((t, l) => t + (+l.hire || 0), 0) || "", detected: Date.now(), mails: 0, lastMailed: "", vehConfirmed: "", reason: "", details: "", action: "", explainedBy: "", explainedAt: "", hours: "", photos: "", state: "Waiting for branch" });
    fresh.push(key);
  }));
  db.local.filter(l => l.kind === "Market" && String(l.free).startsWith("Yes") && l.date >= from && l.date <= y).forEach(l => { // one explanation per market CN booked while our truck was free
    const key = `CN_${l.cn}`; if (db.idle.some(r => r.key === key)) return; const g = db.gps[`${l.freeVeh}_${l.date}`] || {};
    db.idle.push({ key, date: l.date, veh: l.freeVeh, status: `Market CN ${l.cn} while our truck was free`, km: g.km == null ? "" : g.km, where: [g.halts, g.places].filter(String).join("\n"),
      loads: `${l.cn} ${l.route} · market vehicle ${l.veh} · ${l.party} · our truck ${String(l.free).replace("Yes — ", "")}`, hire: l.hire || "", detected: Date.now(), mails: 0, lastMailed: "", vehConfirmed: "", reason: "", details: "", action: "", explainedBy: "", explainedAt: "", hours: "", photos: "", state: "Waiting for branch" });
    fresh.push(key);
  });
  const to = mail.list(S("Idle watch mail to", "ankleshwar@bestroadways.com")); let sent = 0;
  db.idle.filter(r => r.state === "Waiting for branch").forEach(r => {
    const isNew = fresh.includes(r.key), link = `${process.env.APP_URL}/?idle=${encodeURIComponent(r.key)}`, day = dmy(r.date);
    const btn = `<p style="margin:16px 0 8px;"><a href="${link}" style="display:inline-block;background:#c8102e;color:#fff;padding:10px 16px;text-decoration:none;border-radius:4px;font-weight:bold;">Explain this day · कारण बताएँ</a></p>`;
    if (r.key.startsWith("CN_")) { const cn = r.key.slice(3); const bt = btn.replace("Explain this day", "Explain this CN");
      mail.compose(to, `${isNew ? "" : "Reminder · "}Market CN ${cn} on ${day} while ${r.veh} was free — explanation needed`, [["Market CN · मार्केट CN", r.loads], ["Hire paid ₹", r.hire], ["Our truck · हमारी गाड़ी", r.veh], ["Our truck that day", String(r.where || "").replace(/\n/g, "<br>")]],
        (isNew ? "" : `<b>Reminder ${r.mails + 1} — not explained yet.</b><br>`) + `Market CN <b>${cn}</b> was booked on <b>${day}</b> for a local load, while our own truck <b>${r.veh}</b> was free nearby. Please explain on the app within 24 hours: why it was not used for this load, and what will be done.<br><span style="color:#7a2e0e;">${day} को लोकल माल के लिए मार्केट CN <b>${cn}</b> बना, जबकि हमारी अपनी गाड़ी <b>${r.veh}</b> पास में खाली थी। कृपया 24 घंटे के अंदर कारण बताएँ।</span>`, bt, true);
      r.mails++; r.lastMailed = new Date().toISOString(); sent++; return; }
    const idle = r.status === "Idle";
    const intro = (isNew ? "" : `<b>Reminder ${r.mails + 1} — not explained yet.</b> · <b>याद दिलाना — अभी तक कारण नहीं बताया।</b><br>`) + `Our truck <b>${r.veh}</b> was <b>${idle ? "standing idle" : "running without a CN"}</b> on <b>${day}</b>. Please explain on the app within 24 hours: confirm the vehicle number, why it was not used, and what is being done.<br>` +
      `<span style="color:#7a2e0e;">हमारी गाड़ी <b>${r.veh}</b> ${day} को <b>${idle ? "खड़ी रही" : "बिना CN के चली"}</b>। कृपया 24 घंटे के अंदर ऐप पर गाड़ी नंबर, गाड़ी क्यों इस्तेमाल नहीं हुई, और क्या किया जा रहा है — यह बताएँ।</span>`;
    mail.compose(to, `${isNew ? "" : "Reminder · "}Truck ${r.veh} ${idle ? "idle" : "ran without CN"} on ${day} — explanation needed`, [["Vehicle · गाड़ी", r.veh], ["Date · तारीख", day], ["Status", r.status], ["GPS km", r.km], ["Where it stood / ran · कहाँ खड़ी / चली", String(r.where || "").replace(/\n/g, "<br>")]], intro, btn, true);
    r.mails++; r.lastMailed = new Date().toISOString(); sent++;
  });
  db.idle.sort((a, b) => (a.date < b.date ? 1 : -1)); save(); log("system", "Idle watch", `${from} → ${y}`, `${fresh.length} new, ${sent} mailed`);
  return `Idle watch: ${fresh.length} new day(s), ${sent} mail(s)`;
}
module.exports = { run };
