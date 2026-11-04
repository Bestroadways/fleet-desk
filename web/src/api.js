export const api = (fn, ...args) =>
  fetch("api", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fn, args }) })
    .then(r => r.json()).catch(() => ({ ok: false, msg: "No connection. Check the internet and try again." }));

// shrink photos to ~1600 px so they upload fast on a phone
export function readFile(f) {
  return new Promise((ok, bad) => {
    const r = new FileReader(); r.onerror = bad;
    if (f.type === "application/pdf") { r.onload = () => ok({ name: f.name, mime: f.type, data: r.result.split(",")[1] }); return r.readAsDataURL(f); }
    r.onload = () => {
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, 1600 / Math.max(img.width, img.height)), c = document.createElement("canvas");
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        ok({ name: f.name, mime: "image/jpeg", data: c.toDataURL("image/jpeg", 0.8).split(",")[1] });
      };
      img.onerror = () => ok({ name: f.name, mime: f.type || "image/jpeg", data: r.result.split(",")[1] });
      img.src = r.result;
    };
    r.readAsDataURL(f);
  });
}
export const device = () => { let d = localStorage.getItem("fd_dev"); if (!d) { d = "d" + Math.random().toString(36).slice(2, 12); localStorage.setItem("fd_dev", d); } return d; };
