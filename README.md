# Ankleshwar Fleet Desk — Node.js + React, JSON database, Google Sheet backup

One small Node app on your Linux VPS. It serves the React page, the API, the approval workflow, the GTropy/ERP
fetchers, the idle watch and the mails. Everything lives in ONE file: `data/db.json`.
The Google Sheet is the live backup (a full copy, refreshed within 2 minutes of any change).

```
phone → https://fleet.bestroadways.com (React)  → /api (Node) → data/db.json
                                                              ↘ every 2 min if changed → backup Google Sheet
08:50 IST daily: GTropy + ERP fetch → idle watch → re-run checks → mails → backup
```

## Install (Ubuntu / Debian, about 30 minutes)
```bash
sudo apt install -y nodejs npm caddy         # Node 20+ (use nodesource if apt has an older one)
sudo useradd -r -m fleet
sudo mkdir -p /opt/fleet-desk && sudo cp -r . /opt/fleet-desk && cd /opt/fleet-desk
sudo npm install --omit=dev                  # server (4 packages)
# the React page is already built in ./public. To change it later:  npm run build
sudo cp .env.example .env && sudo nano .env  # fill in the values (see below)
sudo chown -R fleet /opt/fleet-desk
```

### Google Sheets (one-time)
1. Google Cloud → new project → enable **Google Sheets API** → create a **service account** → download the JSON key
   to `/opt/fleet-desk/service-account.json` (`chmod 600`).
2. Share your current Fleet Desk sheet with the service account email as **Viewer** (it is only read once).
3. Create a NEW empty Google Sheet for the backup, share it with the service account as **Editor**,
   put its ID in `BACKUP_SHEET_ID`. Keep it private: the People tab holds PINs.

### First start
```bash
cd /opt/fleet-desk
sudo -u fleet npm run import-xlsx -- Fleet_Desk.xlsx   # the old sheet downloaded as .xlsx (no Google account needed)
sudo -u fleet npm run setadmin -- fms@bestroadways.com 98XXXXXXXX 4821 "FMS Desk"   # your own login (mobile + PIN)
sudo -u fleet npm run mirror     # first backup to the new sheet
sudo cp fleet-desk.service /etc/systemd/system/ && sudo systemctl enable --now fleet-desk
sudo cp Caddyfile /etc/caddy/Caddyfile && sudo systemctl reload caddy      # automatic https
curl https://fleet.bestroadways.com/health
```
Point DNS `fleet.bestroadways.com` at the VPS first. (For bestroadways.com/fleet as a sub-path, proxy `/fleet/*` to port 8080 with
`handle_path /fleet/* { reverse_proxy 127.0.0.1:8080 }` and set `APP_URL=https://www.bestroadways.com/fleet`.)

## Setting mobile, PIN and role from the front end
Log in as Admin → **Desk** tab → **People**: add or edit a person (email, name, **role**, **mobile**, **PIN**), press *Save People*.
"Generate PIN for those without one" fills the empty PINs (like fdAppSetup did). Empty *Phone* = reset the locked phone.
Your first Admin login is created once with `npm run setadmin` (above); after that everything is done on screen.

## Who can do what (People tab: Role)
| Role | Raise | Approve | Audit clear | Pay | Close | Idle answer |
|---|---|---|---|---|---|---|
| Ankleshwar branch | yes | | | | | yes |
| Sangwari ops | yes | | | yes | yes | yes |
| Sangwari approver (Sitaram) | | yes | | yes | yes | yes |
| Internal Audit | | | yes | | yes | |
| Admin (owner) | test only | | | | | yes |
Same rules as the sheet: nobody approves their own request; Red/Audit flags go to Internal Audit before payment;
reject and audit-clear need a note; Paid needs the OTP/Happay/UTR reference; Closed needs the bill/slip.
People log in with **mobile number or email + PIN** (from the People tab). Someone with no mobile yet can use their email. First phone used is locked to that person;
If someone gets "locked to another phone", they tap **Click here** on the login screen: a 6-digit code goes to their own registered email (needs SMTP set in `.env`), and entering it moves the login to the new phone. Admins are told by mail. Admin can also clear the phone on Desk → People (empty *Phone*).

## Backup and recovery
- `data/db.json` is saved atomically on every change; a dated copy is kept daily for 14 days in `data/backups/`.
- The backup Google Sheet is a full mirror (tabs: Advances, GPS days, ERP CNs, Fleet, People, Settings, Idle explanations, Log).
- Lost the disk? `npm run restore` rebuilds `db.json` from the backup sheet.
- Photos are files in `data/files/` (signed links). Back that folder up too:
  `rsync -a /opt/fleet-desk/data/ backup-host:/backups/fleet-desk/` in a daily cron.
- Manual run of the morning job: `npm run morning` (or `node src/cli.js morning`).

## What is in the app (the screens)
| Screen | Who | What it does (sheet equivalent) |
|---|---|---|
| New request / Attach slip-bill | branch, ops | the request form, same proofs per type, CNG fields |
| My requests | branch, ops | status, flags, trail; **edit** a request until it is approved |
| Approvals | Sitaram, ops, audit | approve / reject / audit-clear / mark reviewed / pay (reference needed) / close. Admin can set any status |
| Day ledger | everyone | each day of a truck: GPS km, CN / idle / no-CN, advances, **day notes**, **tolls** |
| Settlement | Sitaram, ops, audit | monthly P&L (as the sheet), salary / tolls / odometer inputs, the 7 checks, send to audit / clear / hold / settle |
| Market hire | Sitaram, ops, audit | the Market hire watch tab |
| Desk | Sitaram, ops (people/fleet/settings: Admin only) | fetch GTropy / ERP now, rebuild Local CNs, re-pull from a date, idle watch now, back up now, **upload GTropy .xls and ERP CN Dump .xlsx**, Places (80 km), People (mobile/PIN/reset phone), Fleet, Settings |
| Idle / market-CN explanation | branch (opened from the mail link) | explains an idle / no-CN day or a market CN booked while our truck was free |

Daily 08:50 IST: GTropy → ERP → Local CNs (80 km, own + market) → idle watch (own days **and** market CNs while our truck was free) → checks → backup.

## Moving your old sheet data in (do this once)
1. Google Sheets → **File → Download → Microsoft Excel (.xlsx)**.
2. Either on the screen: log in as Admin → **Desk → Import the old Google Sheet** → pick the file.
   Or on the server: `npm run import-xlsx -- /path/to/Ankleshwar_Fleet_Desk.xlsx`
3. It adds what is missing: Advances, GPS days, ERP CNs (own + market), Local CNs, Idle explanations, Settlements, Places to map, Log;
   and fills missing People, Fleet, Settings, Places. **Nothing you already typed is changed**, and running it twice adds nothing.
   (`--replace` overwrites the history from the file; use it only for a very first import.)
4. People with a blank Mobile in the old sheet cannot log in yet: set their **mobile** on Desk → People.
   Old "phone locks" are cleared, so the first phone each person uses on the new address becomes theirs.

## Rules copied from your sheet's own formulas
- **Day status** (Day ledger J): Billed CN → No GPS → Idle (≤ 15 km) → On CN trip (a CN 1–5 days back, by lane length) → Running, no CN.
- **Settlement** (Settlement B7:B34): Km Run = GPS km of the month · Earned = *Own HC* on own CNs · Advances = every non-rejected advance of the month ·
  Salary = Settlements tab, else Fleet · FASTag tolls and odometer opening/closing are typed per month · Result = Earned − Advances − Salary − Tolls.
  Seven checks: GPS for every day · note on every running-no-CN day · every Red/Audit advance reviewed by audit · no advance still open ·
  bill on every Paid advance (not Diesel, not legacy) · both odometer readings entered · FASTag total entered.
- **Market hire watch**: market CNs (km up to Settings “Market hire watch: max km”, weight up to “max weight T”) on days the truck was Idle or Running, no CN.
- Checked on your file: the 19 advances get the same flag levels as in your sheet; RJ14GI1677 October gives advances ₹15,400, fuel 89 kg, result −₹39,400 (same as the Settlement tab).
- One deliberate difference: days before a truck's “On this desk from” date are not counted as “No GPS” (your sheet counts the whole month, so a truck's first partial month could never settle).

Sheet-only housekeeping that no longer applies: sort newest first, dd-mm-yyyy formatting, sheet protections, the Google Form, menus — the app sorts and formats itself.

## Run on your own computer (no Google account needed)
```bash
npm install            # server
npm run build          # only if you change the React page (a built copy is already in ./public)
npm run seed           # sample people + 2 trucks (logins are printed)
npm start              # open http://localhost:8080
```
Without `.env` it still works: data in `./data/db.json`, photos in `./data/files`. Mails are skipped (noted in the Log),
the Google backup and the GTropy/ERP fetchers stay off until you add their values. People, trucks, settings and places are edited on the **Desk** tab (log in as an Admin: add yourself to `data/db.json` with role "Admin", or the seed's owner). Run `npm run seed -- --force` to start again from the sample data.
React page with live reload while editing: `cd web && npm install && npm run dev` (proxies /api to port 8080).
