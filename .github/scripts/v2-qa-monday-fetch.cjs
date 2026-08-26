const realFetch = global.fetch;

const DEALS_BOARD = "5030844099";
const WO_BOARD = "5030844103";

function col(id, text, type = "text") {
  return { id, type, text: text == null ? "" : String(text), value: text == null ? null : JSON.stringify(text) };
}

const sectors = ["Mining", "Powerline", "Renewables", "Railways", "Construction", "Manufacturing"];
const stages = ["A. Lead Generated", "B. Sales Qualified Leads", "E. Proposal/Commercials Sent", "F. Negotiations", "G. Project Won"];
const statuses = ["Open", "Open", "Open", "Won", "On Hold", "Dead"];
const clients = ["COMPANY089", "COMPANY091", "COMPANY124", "COMPANY046", "COMPANY148", "COMPANY047", "COMPANY197", "COMPANY177"];

function dealItem(i) {
  const client = clients[i % clients.length];
  const value = i % 9 === 0 ? null : 7_500_000 + i * 3_250_000;
  const status = statuses[i % statuses.length];
  const sector = sectors[i % sectors.length];
  const stage = status === "Won" ? "G. Project Won" : stages[i % stages.length];
  const month = String((i % 9) + 1).padStart(2, "0");
  return {
    id: String(900000 + i),
    name: i % 4 === 0 ? `Strategic ${sector} programme ${i + 1}` : `Opportunity ${i + 1}`,
    column_values: [
      col("text_mm6jk692", `OWNER_${String((i % 5) + 1).padStart(3, "0")}`),
      col("text_mm6jjyjh", client),
      col("color_mm6j5fgz", status, "color"),
      col("date_mm6jmtdk", status === "Won" ? `2026-${month}-18` : null, "date"),
      col("dropdown_mm6jkmk8", i % 3 === 0 ? "High" : i % 3 === 1 ? "Medium" : "Low", "dropdown"),
      col("numeric_mm6jbwhe", value, "numbers"),
      col("date_mm6jh16t", status === "Won" ? null : `2026-${month}-28`, "date"),
      col("dropdown_mm6j2wnt", stage, "dropdown"),
      col("dropdown_mm6jg4q", i % 2 ? "Pure Service" : "Service + Spectra", "dropdown"),
      col("dropdown_mm6j890p", sector, "dropdown"),
      col("date_mm6jb2vp", `2026-${month}-01`, "date"),
      col("numeric_mm6jev8d", i + 1, "numbers"),
      col("text_mm6j60xc", client),
      col("long_text_mm6j7b54", i % 13 === 0 ? "source note" : "", "long_text"),
    ],
  };
}

const woStatuses = ["Ongoing", "Not Started", "Partial Completed", "Pause / struck", "Executed until current month", "Completed"];
function workOrderItem(i) {
  const client = clients[i % clients.length];
  const status = woStatuses[i % woStatuses.length];
  const amount = 4_000_000 + i * 1_900_000;
  const billed = Math.round(amount * (0.3 + (i % 5) * 0.1));
  const collected = Math.round(billed * 0.72);
  const receivable = Math.max(0, billed - collected);
  return {
    id: String(910000 + i),
    name: `WO-${String(i + 1).padStart(3, "0")} / ${client}`,
    column_values: [
      col("text_mm6javb9", `WO${client}`),
      col("text_mm6j4bj3", `WO-${String(i + 1).padStart(3, "0")}`),
      col("dropdown_mm6j14xj", "One time Project", "dropdown"),
      col("text_mm6jd8j5", i % 2 ? "Jul 2026" : "Aug 2026"),
      col("color_mm6jh8zp", status, "color"),
      col("date_mm6je9w1", null, "date"),
      col("date_mm6jzn82", "2026-01-10", "date"),
      col("dropdown_mm6jfdp", "Purchase Order", "dropdown"),
      col("date_mm6jtmf", i % 7 === 0 ? "2026-06-01" : "2026-08-01", "date"),
      col("date_mm6jjg65", i % 5 === 0 ? "2026-08-10" : "2026-12-31", "date"),
      col("text_mm6jpne1", `OWNER_${String((i % 5) + 1).padStart(3, "0")}`),
      col("dropdown_mm6jpft6", sectors[i % sectors.length], "dropdown"),
      col("dropdown_mm6jhhqg", "Volumetric survey", "dropdown"),
      col("dropdown_mm6j1hgy", "NONE", "dropdown"),
      col("date_mm6jzmnw", i % 3 ? "2026-07-15" : null, "date"),
      col("text_mm6j726t", i % 3 ? `INV-${1000 + i}` : null),
      col("numeric_mm6jwjes", Math.round(amount / 1.18), "numbers"),
      col("numeric_mm6j7saa", amount, "numbers"),
      col("numeric_mm6j876e", Math.round(billed / 1.18), "numbers"),
      col("numeric_mm6jvr5n", billed, "numbers"),
      col("numeric_mm6jby91", collected, "numbers"),
      col("numeric_mm6j5bf2", Math.max(0, Math.round((amount - billed) / 1.18)), "numbers"),
      col("numeric_mm6jfnrz", Math.max(0, amount - billed), "numbers"),
      col("numeric_mm6j6g2p", receivable, "numbers"),
      col("color_mm6jj41e", receivable > 2_000_000 ? "High" : "Medium", "color"),
      col("numeric_mm6j41w4", 10 + i, "numbers"),
      col("text_mm6j54zp", String(12 + i)),
      col("numeric_mm6jzt3h", 5 + (i % 7), "numbers"),
      col("numeric_mm6jrhwa", 4 + (i % 5), "numbers"),
      col("color_mm6jvfw8", billed >= amount ? "Billed" : "Partially Billed", "color"),
      col("text_mm6jh731", "Sep 2026"),
      col("text_mm6j6vj8", i % 3 ? "Aug 2026" : ""),
      col("text_mm6jh1th", i % 4 ? "Aug 2026" : ""),
      col("color_mm6jeqyz", billed >= amount ? "Done" : "Open", "color"),
      col("text_mm6j5yex", collected >= billed ? "Collected" : "Pending"),
      col("text_mm6j1670", i % 4 ? "2026-08-20" : ""),
      col("color_mm6jhv83", billed >= amount ? "Billed" : "Partially Billed", "color"),
      col("numeric_mm6j2wrs", i + 1, "numbers"),
      col("text_mm6j8tck", client),
      col("long_text_mm6j9xs0", i % 11 === 0 ? "billing note" : "", "long_text"),
    ],
  };
}

const deals = Array.from({ length: 36 }, (_, i) => dealItem(i));
const workOrders = Array.from({ length: 28 }, (_, i) => workOrderItem(i));

function boardPayload(id) {
  if (id === DEALS_BOARD) return { id, name: "Skylark Command — Deals", items_page: { cursor: null, items: deals } };
  if (id === WO_BOARD) return { id, name: "Skylark Command — Work Orders", items_page: { cursor: null, items: workOrders } };
  return { id, name: `Board ${id}`, items_page: { cursor: null, items: [] } };
}

global.fetch = async function qaFetch(input, init = {}) {
  const url = typeof input === "string" ? input : input?.url;
  if (url === "https://api.monday.com/v2") {
    const body = JSON.parse(init.body || "{}");
    const ids = body.variables?.boardIds || [];
    return new Response(JSON.stringify({ data: { boards: ids.map((id) => boardPayload(String(id))) } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
  return realFetch(input, init);
};
