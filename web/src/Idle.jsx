import React, { useState } from "react";
import { api } from "./api.js";
import Slot from "./Files.jsx";
export default function Idle({ token, I, idleKey }) {
  const [f, setF] = useState({ vehicle: "", reason: "", details: "", cn: "", action: "" }); const [files, setFiles] = useState({}); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState(null); const [done, setDone] = useState(!!I?.done);
  if (!I) return <div className="card">This link is old or the day is no longer open. Use the link in the latest mail.</div>;
  const set = (k, v) => setF(o => ({ ...o, [k]: v }));
  async function send() {
    if (!f.reason) return setMsg({ err: "Pick the reason." }); setBusy(true);
    const r = await api("idle", token, { key: idleKey, ...f, files: Object.values(files).flat() }); setBusy(false);
    if (!r.ok) return setMsg({ err: r.msg }); setDone(true); setMsg({ ok: "Thank you. The explanation is saved against this day and sent to Sitaram ji." });
  }
  return (<>
    <div className="card" style={{ borderLeft: "4px solid var(--red)" }}><b style={{ fontSize: 16 }}>{I.isCn ? "Explain this market CN · इस मार्केट CN का कारण बताएँ" : "Explain this day · इस दिन का कारण बताएँ"}</b>
      <div className="hint" style={{ fontSize: 14, color: "var(--ink)", marginTop: 8, lineHeight: 1.5 }}><b>{I.veh}</b> · {I.date.split("-").reverse().join("/")} · <b>{I.status}</b>{I.km !== "" && ` · GPS ${I.km} km`}
        {I.where && <><br />Where: {I.where.replace(/\n/g, " · ")}</>}{I.loads && <><br />{I.isCn ? "Market CN: " : "Market loads that day: "}{I.loads.replace(/\n/g, " · ")}{I.hire ? ` (₹${I.hire})` : ""}</>}</div></div>
    {done ? <div className="msg ok">{I.done ? `Already explained: ${I.reason}` : msg?.ok}</div> : <div className="card">
      <label>Vehicle number on the truck · गाड़ी का नंबर <small>— type it</small></label><input value={f.vehicle} onChange={e => set("vehicle", e.target.value)} placeholder="RJ14GI1677" autoCapitalize="characters" />
      <label>{I.isCn ? "Why did this load not go on our truck? · यह माल हमारी गाड़ी में क्यों नहीं गया?" : "Why was our truck not used? · गाड़ी क्यों इस्तेमाल नहीं हुई?"}</label>
      <select value={f.reason} onChange={e => set("reason", e.target.value)}><option value="">— pick —</option>{I.reasons.map(r => <option key={r}>{r}</option>)}</select>
      <label>What happened · क्या हुआ <small>— place, client, CN or job card</small></label><textarea value={f.details} onChange={e => set("details", e.target.value)} />
      <label>CN number, if any · CN नंबर (अगर है)</label><input value={f.cn} onChange={e => set("cn", e.target.value)} />
      <label>What was done / will be done · क्या किया / क्या करेंगे</label><textarea value={f.action} onChange={e => set("action", e.target.value)} />
      <Slot slot="idle" label="Photo (optional — gate, job card, driver)" onFiles={(s, fl) => setFiles({ [s]: fl })} />
      <button className="send" disabled={busy} onClick={send}>{busy ? "Sending…" : "Send explanation"}</button>
      {msg && <div className={"msg " + (msg.ok ? "ok" : "err")}>{msg.ok || msg.err}</div>}
    </div>}
  </>);
}
