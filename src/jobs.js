const { db, save, log, isDirty } = require("./store");
const { addDays, today } = require("./util");
const gt = require("./gtropy"), erp = require("./erp"), idlew = require("./idlewatch"), sheet = require("./sheetio"), mail = require("./mail");
const { recheckAll } = require("./api");

async function morning() {
  const y = addDays(today(), -1), msgs = [];
  try { msgs.push(...(await gt.fetchRange(y, y, true))); } catch (e) { msgs.push("GTropy: FAILED " + e.message); }
  try { msgs.push(process.env.API_HEADERS ? await erp.catchUp() : "ERP: API_HEADERS not set, skipped"); } catch (e) { msgs.push("ERP: FAILED " + e.message); }
  recheckAll();
  try { msgs.push(idlew.run()); } catch (e) { msgs.push("Idle watch: FAILED " + e.message); }
  Object.keys(db.sessions).forEach(k => { if (db.sessions[k].exp < Date.now()) delete db.sessions[k]; }); save();
  try { await sheet.mirror(); } catch (e) { msgs.push("Sheet backup: FAILED " + e.message); }
  log("system", "Morning job", y, msgs.join(" | "));
  if (msgs.some(m => /FAILED/.test(m))) mail.send(mail.S("Job failure mail to", "sangwari@bestroadways.com"), "Fleet Desk morning job — failed", `<pre style="font-family:Arial">${msgs.join("\n")}</pre><p style="font-size:13px">Regards,<br><b>Ankit - Shishir - Sushant</b><br>For FMS Helpdesk<br>Contact us on 9594963357</p>`);
  return msgs;
}
let mirroring = false;
function start() {
  setInterval(async () => { // back up to the Google Sheet within 2 minutes of any change
    if (mirroring || !isDirty() || !process.env.BACKUP_SHEET_ID) return; mirroring = true;
    try { await sheet.mirror(); } catch (e) { console.error("mirror:", e.message); } finally { mirroring = false; }
  }, 120e3);
  setInterval(() => { // 08:50 IST once a day
    const ist = new Date(Date.now() + 19800e3), hm = ist.getUTCHours() * 60 + ist.getUTCMinutes();
    if (hm >= 530 && db.meta.lastMorning !== today()) { db.meta.lastMorning = today(); save(); morning().catch(e => console.error("morning:", e.message)); }
  }, 30e3);
}
module.exports = { morning, start };
