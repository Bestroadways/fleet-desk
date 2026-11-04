import React, { useState } from "react";
import { api } from "./api.js";
import Slot from "./Files.jsx";
export default function Bill({ token, boot, onDone }) {
  const [id, setId] = useState(boot.open[0]?.id || ""); const [litres, setLitres] = useState(""); const [note, setNote] = useState("");
  const [files, setFiles] = useState({}); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState(null); const [k, setK] = useState(0);
  async function send() {
    if (!id) return setMsg({ err: "There is no open request to attach a bill to." });
    if (!(files.slip || []).length) return setMsg({ err: "Attach the pump slip / bill." });
    setBusy(true); const r = await api("submit", token, { mode: "bill", billFor: id, litres, purpose: note, files: Object.values(files).flat() }); setBusy(false);
    if (!r.ok) return r.relogin ? onDone(r) : setMsg({ err: r.msg });
    setMsg({ ok: `Attached to ${r.id}. Thank you.` }); setLitres(""); setNote(""); setFiles({}); setK(x => x + 1); onDone(r);
  }
  return (<>
    <div className="card" key={k}>
      <label>Which request?</label>
      <select value={id} onChange={e => setId(e.target.value)}>{boot.open.length ? boot.open.map(o => <option key={o.id} value={o.id}>{o.id} · {o.veh} · {o.type} · ₹{o.amt} · {o.date}</option>) : <option value="">No open request needs a bill</option>}</select>
      <div className="hint">Diesel / CNG: pump screen photo and the pump slip with the vehicle number. Others: every bill / receipt.</div>
      <label>Litres / kg filled <small>— diesel or CNG only</small></label><input type="number" inputMode="decimal" value={litres} onChange={e => setLitres(e.target.value)} />
      <Slot slot="slip" label="Pump slip / bills" required onFiles={(s, f) => setFiles(o => ({ ...o, [s]: f }))} />
      <Slot slot="screen" label="Pump screen (amount + litres / kg)" accept="image/*" onFiles={(s, f) => setFiles(o => ({ ...o, [s]: f }))} />
      <label>Note <small>— optional</small></label><input value={note} onChange={e => setNote(e.target.value)} />
    </div>
    <button className="send" disabled={busy} onClick={send}>{busy ? "Sending…" : "Attach to request"}</button>
    {msg && <div className={"msg " + (msg.ok ? "ok" : "err")}>{msg.ok || msg.err}</div>}
  </>);
}
