// Everything the sheet and menu did beyond the request flow: ledger, settlement, day notes, tolls, edit, admin, jobs, file loads.
const { db, save, log } = require("./store");
const K = require("./constants");
const { today, nowStr, addDays } = require("./util");
const settle = require("./settle");

module.exports = c => {
  const { auth, roleOf, can, RELOGIN, trail, recheck, recheckAll, saveFiles } = c;
  const need = (ok, msg) => { if (!ok) throw new Error(msg); };
  const guard = fn => (tok, ...a) => { const who = auth(tok); if (!who) return RELOGIN; return fn(who, roleOf(who), ...a); };
  const vehOk = v => { need(settle.allVeh().includes(v), "Pick a vehicle from the list."); return v; };
  const monthOk = m => { need(/^\d{4}-\d{2}$/.test(m), "Pick a month."); return m; };

  return {
    ledger: guard((who, role, veh, month) => Object.assign({ ok: true }, settle.ledger(vehOk(veh), monthOk(month)))),
    market: guard((who, role, veh, month) => Object.assign({ ok: true }, settle.market(vehOk(veh), monthOk(month)))),

    dayNote: guard((who, role, veh, date, note) => {
      need(can(role, "note"), "Your role can't write day notes."); const g = db.gps[`${vehOk(veh)}_${date}`]; need(g, "No GPS row for that day.");
      g.note = String(note || "").trim(); g.noteBy = who; g.noteAt = nowStr(); save(); log(who, "Day note", g.key, g.note); return { ok: true };
    }),
    dayTolls: guard((who, role, veh, date, amount) => {
      need(can(role, "tolls"), "Your role can't enter tolls."); const g = db.gps[`${vehOk(veh)}_${date}`]; need(g, "No GPS row for that day.");
      g.tollAmt = amount === "" ? "" : Math.max(0, +amount || 0); g.tolls = g.tolls || (g.tollAmt === "" ? "" : "manual"); save(); log(who, "Day tolls", g.key, String(g.tollAmt)); return { ok: true };
    }),

    stl: guard((who, role, veh, month) => ({ ok: true, s: settle.figures(vehOk(veh), monthOk(month)), canPrep: can(role, "stlPrep"), canClear: can(role, "stlClear") })),
    stlSet: guard((who, role, veh, month, f) => { // salary / tolls / legacy note override while the settlement is still open
      need(can(role, "stlPrep") || role === "Admin", "Your role can't change settlement inputs."); const r = settle.ensure(vehOk(veh), monthOk(month));
      need(["Draft", "Held"].includes(r.status), `Settlement is "${r.status}" — inputs are locked.`);
      ["salary", "tolls", "odoOpen", "odoClose"].forEach(k => { if (f && k in f) r[k] = f[k] === "" ? "" : Math.max(0, +f[k] || 0); }); if (f && "legacyNote" in f) r.legacyNote = String(f.legacyNote || ""); save(); return { ok: true, s: settle.figures(veh, month) };
    }),
    stlAct: guard((who, role, veh, month, action, note) => { const st = settle.act(who, w => can(role, w), vehOk(veh), monthOk(month), action, note); return { ok: true, status: st, s: settle.figures(veh, month) }; }),

    mine: guard((who) => ({ ok: true, rows: db.adv.filter(a => a.raisedBy === who).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 50).map(a => ({ id: a.id, veh: a.veh, date: a.date, type: a.type, amount: a.amount, litres: a.litres, odo: a.odo, mode: a.mode, from: a.from, to: a.to, cn: a.cn, purpose: a.purpose, status: a.status, level: a.level, flags: a.flags, note: a.note, trail: a.trail })) })),
    edit: guard((who, role, id, f) => {
      const a = db.adv.find(x => x.id === id); need(a, "Request not found."); need(a.status === "Raised", "Details can't change after the request moves on. Reject it and raise a new one.");
      need(a.raisedBy === who || can(role, "approve"), "Only the person who raised it, or Sitaram, can edit it."); const ch = [];
      ["amount", "litres", "odo"].forEach(k => { if (k in f && +f[k] !== +a[k]) { a[k] = Math.max(0, +f[k] || 0); ch.push(k); } });
      ["mode", "from", "to", "cn", "purpose"].forEach(k => { if (k in f && String(f[k] || "") !== String(a[k] || "")) { a[k] = String(f[k] || "").trim(); ch.push(k); } });
      need(a.amount > 0, "Enter the amount."); if (a.from && !a.to) a.to = a.from; need(String(a.purpose).trim(), "Write what the money is for.");
      if (ch.length) { trail(a, "edited: " + ch.join(", "), who); recheck(a); save(); log(who, "Request edited", id, ch.join(", ")); } return { ok: true, level: a.level, flags: a.flags };
    }),

    admin: guard((who, role) => {
      need(can(role, "load") || role === "Admin", "Your role can't open this."); const A = role === "Admin";
      return { ok: true, isAdmin: A, people: A ? db.people : [], fleet: A ? db.fleet : [], settings: A ? db.settings : {}, places: db.places, placesToMap: db.placesToMap, fileCount: Object.keys(db.gps).length, lastMorning: db.meta.lastMorning || "" };
    }),
    adminSet: guard((who, role, kind, data) => {
      if (kind === "places") need(can(role, "load") || role === "Admin", "Your role can't change places."); else need(role === "Admin", "Admin only.");
      if (kind === "people") {
        need(Array.isArray(data), "Bad data."); const seen = new Set();
        db.people = data.filter(p => String(p.email || "").trim()).map(p => { const email = String(p.email).trim().toLowerCase(); need(!seen.has(email), "Duplicate email " + email); seen.add(email);
          const role2 = String(p.role || "").trim(); need(["Ankleshwar branch", "Sangwari ops", "Sangwari approver", "Internal Audit", "Admin", "Viewer"].includes(role2), `Role of ${email} must be one of the listed roles.`);
          const pin = String(p.pin || "").replace(/\D/g, ""); need(!pin || /^\d{4,6}$/.test(pin), `PIN of ${email} must be 4–6 digits.`); return { email, name: String(p.name || "").trim(), role: role2, mobile: String(p.mobile || "").replace(/\D/g, "").slice(-10), pin, device: String(p.device || "").trim() }; });
        Object.keys(db.sessions).forEach(t => { if (!db.people.some(p => p.email === db.sessions[t].email)) delete db.sessions[t]; });
      } else if (kind === "fleet") {
        need(Array.isArray(data), "Bad data."); const seen = new Set();
        db.fleet = data.filter(f => String(f.veh || "").trim()).map(f => { const veh = String(f.veh).trim().toUpperCase(); need(!seen.has(veh), "Duplicate vehicle " + veh); seen.add(veh);
          return { veh, type: String(f.type || ""), driver: String(f.driver || ""), cleaner: String(f.cleaner || ""), base: String(f.base || ""), kmin: +f.kmin || 2.4, kmax: +f.kmax || 5.5, salary: +f.salary || 0, fuel: f.fuel === "CNG" ? "CNG" : "Diesel", device: String(f.device || ""), start: String(f.start || ""), note: String(f.note || "") }; });
      } else if (kind === "settings") { need(data && typeof data === "object", "Bad data."); db.settings = data;
      } else if (kind === "places") {
        need(Array.isArray(data), "Bad data."); db.places = data.filter(p => String(p.name || "").trim() && +p.lat && +p.lon).map(p => ({ name: String(p.name).trim(), lat: +p.lat, lon: +p.lon }));
        const known = new Set(); db.places.forEach(p => String(p.name).split("/").forEach(n => known.add(n.trim().toUpperCase()))); Object.keys(db.placesToMap).forEach(n => { if (known.has(n)) delete db.placesToMap[n]; });
      } else throw new Error("Unknown list.");
      save(); log(who, "Admin saved", kind, ""); if (kind === "fleet" || kind === "settings") recheckAll(); return { ok: true };
    }),

    loadGps: guard((who, role, files) => { need(can(role, "load") || role === "Admin", "Your role can't load files."); need(files && files.length, "Pick the GTropy file(s)."); const m = require("./loadfiles").loadGps(files); recheckAll(); return { ok: true, msg: m }; }),
    loadErp: guard((who, role, file) => { need(can(role, "load") || role === "Admin", "Your role can't load files."); need(file && file.data, "Pick the CN Dump file."); const m = require("./loadfiles").loadErp(file); recheckAll(); return { ok: true, msg: m }; }),

    importXlsx: guard((who, role, file, replace) => {
      need(role === "Admin", "Admin only."); need(file && file.data, "Pick the .xlsx file.");
      const msg = require("./importer").fromXlsxBuffer(Buffer.from(file.data, "base64"), { replace: !!replace }); log(who, "Imported old sheet", file.name, msg); return { ok: true, msg };
    }),

    async job(tok, name, arg) {
      const who = auth(tok); if (!who) return RELOGIN; const role = roleOf(who); need(can(role, "load") || role === "Admin", "Your role can't run this.");
      const y = addDays(today(), -1); let msg = "";
      if (name === "gtropy") msg = (await require("./gtropy").fetchRange(y, y, true)).join("\n");
      else if (name === "repull") { need(/^\d{4}-\d{2}-\d{2}$/.test(arg || ""), "Pick a start date."); msg = (await require("./gtropy").fetchRange(arg, y, false)).join("\n"); }
      else if (name === "erp") msg = await require("./erp").catchUp();
      else if (name === "rebuild") msg = await require("./erp").rebuild();
      else if (name === "recheck") msg = `Checks re-run on ${recheckAll()} requests.`;
      else if (name === "idle") msg = require("./idlewatch").run();
      else if (name === "backup") msg = process.env.BACKUP_SHEET_ID ? await require("./sheetio").mirror() : "BACKUP_SHEET_ID is not set.";
      else if (name === "morning") { need(role === "Admin", "Admin only."); msg = (await require("./jobs").morning()).join("\n"); }
      else throw new Error("Unknown job.");
      recheckAll(); log(who, "Job " + name, arg || "", String(msg).slice(0, 300)); return { ok: true, msg };
    },
  };
};
