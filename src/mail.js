const nodemailer = require("nodemailer");
const { db, log } = require("./store");
let tr; const T = () => tr || (tr = nodemailer.createTransport({ host: process.env.SMTP_HOST, port: +process.env.SMTP_PORT || 587, secure: +process.env.SMTP_PORT === 465, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } }));
const S = (n, d = "") => (db.settings[n] != null && String(db.settings[n]) !== "" ? String(db.settings[n]) : d);
const list = s => String(s || "").split(/[,;\s]+/).map(x => x.trim().toLowerCase()).filter(Boolean);
const FROM = () => S("Mail from", process.env.MAIL_FROM || "fms@bestroadways.com");
async function send(to, subject, html, cc) {
  if (!process.env.SMTP_HOST) { log("system", "Mail not sent (SMTP not set)", subject, String(to)); return false; }
  for (let i = 0; i < 3; i++) {
    try { await T().sendMail({ from: `"FMS Helpdesk · Best Roadways" <${FROM()}>`, replyTo: FROM(), to, cc: cc || undefined, subject, html }); return true; }
    catch (e) { if (i === 2) { log("system", "Mail failed", subject, String(e.message).slice(0, 200)); return false; } await new Promise(r => setTimeout(r, 3000 * (i + 1))); }
  }
}
// rows = [[label, value]], same look as the Apps Script desk mails
function compose(to, subject, rows, intro, extra, deviation) {
  to = [...new Set(to.filter(Boolean).map(x => x.toLowerCase()))];
  let cc = [...new Set(list(S("Mail CC", "Rakeshkumar.Sangwari@bestroadways.com, sangwari@bestroadways.com, ashish.gupta@bestroadways.com, internalaudit@bestroadways.com")).concat(deviation ? list(S("Deviation CC", "ashish.gupta@bestroadways.com, internalaudit@bestroadways.com, sangwari@bestroadways.com")) : []))].filter(x => !to.includes(x));
  if (!to.length) { to = cc; cc = []; } if (!to.length) return;
  const tr = rows.filter(r => r[1] !== "" && r[1] != null).map(r => `<tr><td style="padding:6px 10px;border:1px solid #d9dee7;background:#f4f6fa;font-weight:600;width:34%;">${r[0]}</td><td style="padding:6px 10px;border:1px solid #d9dee7;">${r[1]}</td></tr>`).join("");
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1b2430;max-width:760px;">
  <div style="background:#0f2747;color:#fff;padding:12px 16px;font-size:16px;font-weight:700;border-bottom:4px solid #c8102e;">Ankleshwar Fleet Desk</div>
  <p style="margin:16px 0 10px;line-height:1.5;">${intro}</p><table style="border-collapse:collapse;width:100%;font-size:13px;">${tr}</table>${extra || ""}
  <p style="margin:14px 0;"><a href="${process.env.APP_URL}" style="display:inline-block;background:#0f2747;color:#fff;padding:9px 14px;text-decoration:none;border-radius:4px;font-weight:600;">Open the Fleet Desk</a></p>
  <p style="font-size:13px;line-height:1.5;border-top:1px solid #d9dee7;padding-top:10px;">Regards,<br><b style="color:#0f2747;">Ankit - Shishir - Sushant</b><br>For FMS Helpdesk<br>Contact us on 9594963357</p></div>`;
  send(to.join(","), (deviation ? "Deviation · " : "") + subject, html, cc.join(",")); // fire and forget
}
module.exports = { compose, send, S, list };
