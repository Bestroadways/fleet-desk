import React, { useEffect, useState } from "react";
import { api, readFile } from "./api.js";
const ROLES = ["Ankleshwar branch", "Sangwari ops", "Sangwari approver", "Internal Audit", "Admin", "Viewer"];
function Grid({ cols, rows, setRows, onSave, label, blank }) {
  const set = (i, k, v) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  return (<div className="card"><b>{label}</b>
    {rows.map((r, i) => <div key={i} style={{ borderTop: "1px solid var(--line)", marginTop: 8, paddingTop: 4 }}>
      <div className="row" style={{ flexWrap: "wrap" }}>{cols.map(c => <div key={c.k} style={{ flex: `1 1 ${c.w || 120}px` }}><label>{c.l}</label>
        {c.opts ? <select value={r[c.k] ?? ""} onChange={e => set(i, c.k, e.target.value)}>{c.opts.map(o => <option key={o}>{o}</option>)}</select> : <input value={r[c.k] ?? ""} onChange={e => set(i, c.k, e.target.value)} />}</div>)}</div>
      <button className="btn red" onClick={() => setRows(rows.filter((_, j) => j !== i))}>Remove</button></div>)}
    <div><button className="btn" onClick={() => setRows([...rows, { ...blank }])}>+ Add</button><button className="btn ok" onClick={onSave}>Save {label}</button></div></div>);
}
export default function Admin({ token, onDone }) {
  const [d, setD] = useState(null), [msg, setMsg] = useState(null), [busy, setBusy] = useState(""), [repl, setRepl] = useState(false), [from, setFrom] = useState(""), [people, setPeople] = useState([]), [fleet, setFleet] = useState([]), [places, setPlaces] = useState([]), [settings, setSettings] = useState([]);
  const load = async () => { const r = await api("admin", token); if (!r.ok) return r.relogin ? onDone(r) : setMsg({ err: r.msg }); setD(r); setPeople(r.people); setFleet(r.fleet); setPlaces(r.places); setSettings(Object.entries(r.settings).map(([k, v]) => ({ k, v }))); };
  useEffect(() => { load(); }, []);
  const ok = r => setMsg(r.ok ? { ok: r.msg || "Saved." } : { err: r.msg });
  const save = async (kind, data) => { const r = await api("adminSet", token, kind, data); ok(r); load(); };
  const job = async (name, arg) => { setBusy(name); setMsg(null); const r = await api("job", token, name, arg); setBusy(""); ok(r); load(); onDone(r); };
  async function upload(kind, e) {
    const fs = [...e.target.files]; if (!fs.length) return; setBusy(kind); const out = [];
    for (const f of fs) { const buf = await f.arrayBuffer(); let bin = ""; new Uint8Array(buf).forEach(b => (bin += String.fromCharCode(b))); out.push({ name: f.name, data: btoa(bin) }); }
    const r = kind === "gps" ? await api("loadGps", token, out) : kind === "xlsx" ? await api("importXlsx", token, out[0], repl) : await api("loadErp", token, out[0]); setBusy(""); ok(r); e.target.value = ""; load();
  }
  if (!d) return <div className="card">Loading…</div>;
  const J = (n, l, a) => <button key={n} className="btn" disabled={!!busy} onClick={() => job(n, a)}>{busy === n ? "Running…" : l}</button>;
  return (<>
    {msg && <div className={"msg " + (msg.ok ? "ok" : "err")}>{msg.ok || msg.err}</div>}
    <div className="card"><b>Fetch and checks</b><div className="hint">Last morning job: {d.lastMorning || "never"}</div>
      {J("gtropy", "Fetch GTropy now")}{J("erp", "Fetch ERP CNs now")}{J("rebuild", "Rebuild Local CNs from 1 Sep")}{J("recheck", "Re-run all checks")}{J("idle", "Idle watch — mail the branch now")}{J("backup", "Back up to Google Sheet now")}{d.isAdmin && J("morning", "Run the whole morning job")}
      <div className="row" style={{ marginTop: 8 }}><div><label>Re-pull GTropy from a date</label><input type="date" value={from} onChange={e => setFrom(e.target.value)} /></div><div style={{ flex: "0 0 auto", alignSelf: "end" }}>{J("repull", "Re-pull", from)}</div></div></div>
    <div className="card"><b>Load files</b>
      <label>GTropy Trip Summary (Location) export (.xls) <small>— one or more</small></label><input type="file" multiple accept=".xls,.html,.htm" onChange={e => upload("gps", e)} />
      <label>ERP CN Dump Register [8006] (.xlsx)</label><input type="file" accept=".xlsx,.xls" onChange={e => upload("erp", e)} />{busy === "gps" || busy === "erp" ? <div className="hint">Loading…</div> : null}</div>
    {d.isAdmin && <div className="card"><b>Import the old Google Sheet</b>
      <div className="hint">In Google Sheets: File → Download → Microsoft Excel (.xlsx), then pick the file here. It adds the old Advances, GPS days, ERP CNs, Local CNs, Idle explanations, Settlements, Places to map and Log that are missing, and fills missing People, Fleet, Settings and Places. Nothing you already typed is changed.</div>
      <input type="file" accept=".xlsx" onChange={e => upload("xlsx", e)} style={{ marginTop: 8 }} />
      <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" style={{ width: "auto" }} checked={repl} onChange={e => setRepl(e.target.checked)} /> Replace the history with the file (use only for a first import)</label>{busy === "xlsx" && <div className="hint">Importing…</div>}</div>}
    {Object.keys(d.placesToMap).length > 0 && <div className="card"><b>Places to map</b> <span className="hint">(seen on Ankleshwar CNs, no coordinates yet — add them below)</span>
      <div className="hint">{Object.entries(d.placesToMap).sort((a, b) => b[1] - a[1]).map(([n, c]) => `${n} (${c})`).join(" · ")}</div></div>}
    <Grid label="Places" cols={[{ k: "name", l: "Place (use / for alternate names)", w: 220 }, { k: "lat", l: "Latitude" }, { k: "lon", l: "Longitude" }]} rows={places} setRows={setPlaces} blank={{ name: "", lat: "", lon: "" }} onSave={() => save("places", places)} />
    {d.isAdmin && <>
      <div className="card"><b>People — mobile, PIN and role</b><div className="hint">Each person logs in with Mobile + PIN. Edit below and press Save People. A blank \"Phone\" lets the next phone used become theirs.</div>
        <button className="btn" onClick={() => setPeople(people.map(p => (p.pin ? p : { ...p, pin: String(1000 + Math.floor(Math.random() * 9000)) })))}>Generate PIN for those without one</button></div>
      <Grid label="People" cols={[{ k: "email", l: "Email", w: 200 }, { k: "name", l: "Name" }, { k: "role", l: "Role", opts: ROLES }, { k: "mobile", l: "Mobile" }, { k: "pin", l: "PIN" }, { k: "device", l: "Phone (blank = reset)" }]} rows={people} setRows={setPeople} blank={{ email: "", name: "", role: "Ankleshwar branch", mobile: "", pin: String(1000 + Math.floor(Math.random() * 9000)), device: "" }} onSave={() => save("people", people)} />
      <Grid label="Fleet" cols={[{ k: "veh", l: "Vehicle" }, { k: "type", l: "Body" }, { k: "driver", l: "Driver", w: 160 }, { k: "cleaner", l: "Cleaner" }, { k: "fuel", l: "Fuel", opts: ["Diesel", "CNG"] }, { k: "kmin", l: "Band min km/L·kg" }, { k: "kmax", l: "Band max" }, { k: "salary", l: "Salary ₹" }, { k: "start", l: "On desk from (yyyy-mm-dd)", w: 150 }]} rows={fleet} setRows={setFleet} blank={{ veh: "", fuel: "Diesel", kmin: 2.4, kmax: 5.5, salary: 24000 }} onSave={() => save("fleet", fleet)} />
      <Grid label="Settings" cols={[{ k: "k", l: "Setting", w: 260 }, { k: "v", l: "Value", w: 260 }]} rows={settings} setRows={setSettings} blank={{ k: "", v: "" }} onSave={() => save("settings", Object.fromEntries(settings.filter(s => s.k).map(s => [s.k, s.v])))} /></>}
  </>);
}
