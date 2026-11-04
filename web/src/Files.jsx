import React, { useState } from "react";
import { readFile } from "./api.js";
// one upload slot; reports [{slot,name,mime,data}] to the parent
export default function Slot({ slot, label, required, accept = "image/*,application/pdf", onFiles }) {
  const [names, setNames] = useState([]);
  return (
    <div className="slot"><b>{label} {required && <span className="req">*</span>}</b>
      <input type="file" accept={accept} multiple onChange={async e => {
        setNames(["Reading…"]); const out = [];
        for (const f of e.target.files) out.push(Object.assign(await readFile(f), { slot }));
        setNames(out.map(f => f.name)); onFiles(slot, out);
      }} />
      <div className="thumbs">{names.map((n, i) => <span key={i}>{n}</span>)}</div>
    </div>
  );
}
