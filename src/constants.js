// Same lists and column numbers as the Apps Script (35a / 35b / 35d). Keep in step with the sheet.
const A = { id: 1, veh: 2, date: 3, type: 4, amt: 5, lit: 6, odo: 7, mode: 8, from: 9, to: 10, cn: 11, purpose: 12, photo: 13, bill: 14,
  status: 15, level: 16, flags: 17, note: 18, payref: 19, reviewed: 20, raisedBy: 21, raisedAt: 22, source: 31, trail: 32, driver: 33, mail: 34 };
const ADV_COLS = 33;
const TYPES = { "Diesel": "diesel", "CNG": "cng", "Trip advance": "trip", "Dala / loading": "dala", "Parking": "parking", "Repair": "repair", "Toll / green tax": "toll", "Meal / driver exp": "meal", "Other": "other" };
const FUEL_UNIT = { diesel: "L", cng: "kg" };
const isFuel = t => t === "diesel" || t === "cng";
const CAN = {
  raise: ["Ankleshwar branch", "Sangwari ops", "Admin"],
  approve: ["Sangwari approver"], pay: ["Sangwari approver", "Sangwari ops"], audit: ["Internal Audit"], close: ["Sangwari approver", "Sangwari ops", "Internal Audit"],
  note: ["Ankleshwar branch", "Sangwari approver", "Sangwari ops", "Admin"], load: ["Sangwari approver", "Sangwari ops", "Admin"], tolls: ["Sangwari approver", "Sangwari ops", "Admin"],
  stlPrep: ["Sangwari approver", "Sangwari ops"], stlClear: ["Internal Audit"],
};
const LOGIN_ROLES = ["Ankleshwar branch", "Sangwari ops", "Sangwari approver", "Internal Audit", "Admin"];
const IDLE_ANSWER_ROLES = ["Ankleshwar branch", "Sangwari ops", "Sangwari approver", "Admin"];
const RF_PAY = { diesel: ["Reliance OTP (653510)", "IOCL OTP (XP1000437386)", "Jio-bp OTP", "Other pump OTP"],
  cng: ["Happay card (driver)", "Bank transfer to CNG pump account"], other: ["Happay HDFC card", "Cash"] };
const RF_PUMP_BANK = "Bank transfer to CNG pump account";
const RF_NEED = {
  "Diesel": { odometer: ["Odometer photo — km and trip meter readable", true], plate: ["Number plate / truck at the pump", false] },
  "CNG": { driver: ["Driver at the CNG pump (photo)", true], odometer: ["Odometer photo — km readable", true], pumpslip: ["Pump meter / slip — kg and amount readable", true] },
  "Trip advance": { lr: ["LR / CN copy (consignor copy)", true] },
  "Dala / loading": { sheet: ["Expense summary sheet (dates + each line)", false], bills: ["Receipts / bills", true] },
  "Parking": { bills: ["Parking receipt", true] },
  "Meal / driver exp": { bills: ["Receipts / bills", true] },
  "Toll / green tax": { bills: ["Toll / green-tax receipt or screenshot", true] },
  "Other": { bills: ["Receipts / bills", true] },
  "Repair": { part: ["Old / damaged part or the problem", true], work: ["New part (box with MRP) or work done", true], bills: ["Shop bill or estimate", true] },
};
const RF_BILL_SLOTS = ["bills", "sheet", "slip", "screen", "pumpslip"];
const IW_REASONS = ["No load available · माल नहीं था", "Placed at client, waiting for loading · क्लाइंट पर लोडिंग का इंतज़ार", "Waiting for unloading / documents · अनलोडिंग / कागज़ का इंतज़ार", "Breakdown / repair / service · खराबी / रिपेयर / सर्विस", "Driver not available · ड्राइवर नहीं था", "Waiting for return load at destination · वापसी माल का इंतज़ार", "Running for a load, CN to be made · माल के लिए चली, CN बनना बाकी", "Holiday / client closed · छुट्टी / क्लाइंट बंद", "Other · अन्य"];
const IW_CN_REASONS = ["Our truck was on another load / committed · हमारी गाड़ी दूसरे माल पर / बुक थी", "Our truck under repair / service · गाड़ी रिपेयर / सर्विस में थी", "Load did not fit our truck (size / weight / body) · माल हमारी गाड़ी में फिट नहीं था", "Client asked for a different vehicle · क्लाइंट ने दूसरी गाड़ी माँगी", "Our truck could not reach in time · गाड़ी समय पर नहीं पहुँच सकती थी", "Driver not available · ड्राइवर नहीं था", "Market rate cheaper than running our truck · मार्केट भाड़ा सस्ता था", "Other · अन्य"];
module.exports = { A, ADV_COLS, TYPES, FUEL_UNIT, isFuel, CAN, LOGIN_ROLES, IDLE_ANSWER_ROLES, RF_PAY, RF_PUMP_BANK, RF_NEED, RF_BILL_SLOTS, IW_REASONS, IW_CN_REASONS };
