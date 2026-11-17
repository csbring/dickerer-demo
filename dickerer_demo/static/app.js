"use strict";
const $ = (id) => document.getElementById(id);
const base = document.querySelector('meta[name="api-base"]').content;
let catalog = [],
  session = null,
  state = null,
  auto = false,
  working = false,
  rendered = 0;
const initialEmpty = $("transcript").innerHTML;
const money = (value) =>
  value == null
    ? "—"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      }).format(value);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const tactics = {
  opening_anchor: "A grounded opening",
  condition: "Use the known condition",
  convenience: "Trade convenience for value",
  meet_halfway: "Make a measured concession",
  hold_line: "Hold the line",
  accept: "Recognize a workable deal",
  walk_away: "Protect the budget",
};
const illustrations = {
  camera:
    '<svg viewBox="0 0 230 150" xmlns="http://www.w3.org/2000/svg"><ellipse cx="118" cy="126" rx="77" ry="8" fill="#cbd0c3"/><path d="M40 49h45l11-17h41l12 17h36a12 12 0 0 1 12 12v53a12 12 0 0 1-12 12H40a12 12 0 0 1-12-12V61a12 12 0 0 1 12-12Z" fill="#39413d"/><path d="M40 49h45l11-17h41l12 17h36a12 12 0 0 1 12 12v10H28V61a12 12 0 0 1 12-12Z" fill="#646e65"/><rect x="38" y="60" width="24" height="57" rx="6" fill="#252c29"/><rect x="99" y="37" width="33" height="11" rx="3" fill="#303c35"/><circle cx="121" cy="87" r="40" fill="#1d2723" stroke="#899283" stroke-width="3"/><circle cx="121" cy="87" r="31" fill="#4f6157" stroke="#111e17" stroke-width="5"/><circle cx="121" cy="87" r="23" fill="#243a35"/><circle cx="121" cy="87" r="14" fill="#182726"/><path d="M105 69q15-11 28 3" fill="none" stroke="#889c8f" stroke-width="3" opacity=".7"/><circle cx="178" cy="61" r="4" fill="#d5e8a7"/><path d="M45 45h19" stroke="#303c35" stroke-width="6" stroke-linecap="round"/></svg>',
  chair:
    '<svg viewBox="0 0 230 150" xmlns="http://www.w3.org/2000/svg"><ellipse cx="115" cy="136" rx="57" ry="5" fill="#cbd0c3"/><path d="M88 17q26-10 55 0l-7 64H94Z" fill="#556258" stroke="#374b3e" stroke-width="6"/><path d="M98 25h33M97 36h33M96 47h33M95 58h33M96 69h33" stroke="#9aa78c" stroke-width="2" opacity=".4"/><path d="M83 87q32-13 64 0l-2 11H85Z" fill="#333f37"/><path d="M78 67v29M152 67v29" stroke="#495348" stroke-width="5"/><path d="M69 65h22M143 65h22" stroke="#344139" stroke-width="7" stroke-linecap="round"/><path d="M116 98v26m0-2-34 10m34-10 32 10m-32-10v14" stroke="#5b685c" stroke-width="5"/><circle cx="81" cy="133" r="5" fill="#29382e"/><circle cx="150" cy="133" r="5" fill="#29382e"/><circle cx="116" cy="138" r="5" fill="#29382e"/></svg>',
  headphones:
    '<svg viewBox="0 0 230 150" xmlns="http://www.w3.org/2000/svg"><ellipse cx="116" cy="131" rx="60" ry="6" fill="#cbd0c3"/><path d="M65 90V66a51 51 0 0 1 102 0v24" fill="none" stroke="#34443b" stroke-width="15"/><path d="M66 65a50 50 0 0 1 99 0" fill="none" stroke="#83907e" stroke-width="5"/><rect x="52" y="74" width="33" height="49" rx="14" fill="#65715f" transform="rotate(-10 69 98)"/><rect x="147" y="74" width="33" height="49" rx="14" fill="#65715f" transform="rotate(10 163 98)"/><rect x="73" y="77" width="13" height="43" rx="6" fill="#29382f" transform="rotate(-10 69 98)"/><rect x="146" y="77" width="13" height="43" rx="6" fill="#29382f" transform="rotate(10 163 98)"/><path d="M58 87v22m116-22v22" stroke="#9ca48e" stroke-width="2"/></svg>',
};
async function api(path, method = "GET", body = null, auth = session) {
  const headers = { "Content-Type": "application/json" };
  if (auth) headers.Authorization = `Bearer ${auth.token}`;
  const url = base ? base + encodeURIComponent(path) : path;
  const response = await fetch(url, {
    method,
    headers,
    body: body === null ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
    cache: "no-store",
  });
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error(
      "The demo gateway is unavailable. Please try again shortly.",
    );
  }
  if (!response.ok) {
    let detail = result.detail;
    if (Array.isArray(detail))
      detail = detail.map((x) => x.msg.replace("Value error, ", "")).join(" ");
    throw new Error(
      typeof detail === "string"
        ? detail
        : "This request could not be completed. Please try again.",
    );
  }
  return result;
}
function error(message = "") {
  $("error").textContent = message;
  $("error").classList.toggle("hidden", !message);
}
function selectListing() {
  if (session) return;
  const listing = catalog.find((x) => x.id === $("scenario").value);
  if (!listing) return;
  $("product-art").innerHTML = illustrations[listing.id];
  $("category").textContent = listing.category;
  $("listing-title").textContent = listing.title;
  $("asking-price").textContent = money(listing.asking);
  $("market-range").textContent =
    `${money(listing.market[0])}–${money(listing.market[1])}`;
  $("facts").replaceChildren(
    ...listing.facts.map((fact) => {
      const li = document.createElement("li");
      li.textContent = fact;
      return li;
    }),
  );
  for (const id of ["target", "budget"]) {
    $(id).value = listing[id];
    $(id).max = listing.asking;
  }
  $("seller-latest").textContent = money(listing.asking);
  $("limit-latest").textContent = money(listing.budget);
  $("reason").textContent = listing.leverage;
  drawChart(null);
}
function addMessage(message, index) {
  const article = document.createElement("article");
  article.className = `message ${message.actor}`;
  const meta = document.createElement("div");
  meta.className = "message-meta";
  const who = document.createElement("strong");
  who.textContent = message.actor === "buyer" ? "Dickerer" : "Alex · seller";
  const timing = document.createElement("span");
  timing.textContent = `${message.seconds}s · message ${index + 1}`;
  meta.append(who, timing);
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  const text = document.createElement("div");
  text.textContent = message.message;
  bubble.append(text);
  const price = document.createElement("div");
  price.className = "offer-label";
  const label = document.createElement("span");
  label.textContent = {
    offer: "PROPOSED PRICE",
    accept: "AGREED PRICE",
    walk_away: "DECISION",
  }[message.action];
  const value = document.createElement("strong");
  value.textContent =
    message.action === "walk_away" ? "Walk away" : money(message.price);
  price.append(label, value);
  bubble.append(price);
  article.append(meta, bubble);
  $("transcript").append(article);
}
function drawChart(s) {
  const svg = $("chart");
  const NS = "http://www.w3.org/2000/svg";
  svg.replaceChildren();
  const listing =
    s?.listing || catalog.find((x) => x.id === $("scenario").value);
  if (!listing) return;
  const all = [
    listing.asking,
    Number($("target").value) * 0.85,
    ...(s?.messages || []).map((x) => x.price).filter((x) => x != null),
  ];
  const low = Math.min(...all) * 0.95,
    high = listing.asking * 1.03;
  const y = (p) => 90 - ((p - low) / (high - low)) * 72,
    x = (i) => 15 + i * 19;
  const element = (tag, attrs) => {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
    svg.append(el);
    return el;
  };
  for (const yy of [20, 55, 90])
    element("line", {
      x1: 8,
      x2: 234,
      y1: yy,
      y2: yy,
      stroke: "#e5eadc",
      "stroke-dasharray": "3 4",
    });
  for (const actor of ["seller", "buyer"]) {
    const points = actor === "seller" ? [[0, listing.asking]] : [];
    (s?.messages || []).forEach((m, i) => {
      if (m.actor === actor && m.price) points.push([i + 1, m.price]);
    });
    const color = actor === "buyer" ? "#7c9847" : "#ad96c5";
    if (points.length)
      element("polyline", {
        points: points.map(([i, p]) => `${x(i)},${y(p)}`).join(" "),
        fill: "none",
        stroke: color,
        "stroke-width": 2,
      });
    for (const [i, p] of points)
      element("circle", { cx: x(i), cy: y(p), r: 3, fill: color });
  }
  svg.setAttribute(
    "aria-label",
    s
      ? `Seller latest ${money(s.seller_offer)}, buyer latest ${money(s.buyer_offer)}.`
      : "Offer history will appear during negotiation.",
  );
}
function controls() {
  const active = !!state && state.status === "active";
  for (const id of ["scenario", "target", "budget", "persona", "brief"])
    $(id).disabled = !!session;
  $("run").disabled =
    working || (!!state && !active) || auto || !catalog.length;
  $("run-label").textContent = !state
    ? "Start negotiation"
    : !active
      ? "Negotiation complete"
      : auto
      ? "Negotiating…"
      : "Resume negotiation";
  $("pause").disabled = !auto;
  $("step").disabled = !active || working || auto;
  $("end").disabled = !active;
  $("reset").classList.toggle("hidden", !session);
  $("export").classList.toggle("hidden", !state?.messages.length);
}
function render(s) {
  state = s;
  if (rendered === 0 && s.messages.length) $("transcript").replaceChildren();
  $("thinking")?.remove();
  const added = s.messages.length > rendered;
  for (let i = rendered; i < s.messages.length; i++)
    addMessage(s.messages[i], i);
  rendered = s.messages.length;
  if (s.busy) {
    const t = document.createElement("div");
    t.id = "thinking";
    t.className = "thinking";
    t.textContent =
      s.next_actor === "buyer"
        ? "Dickerer is considering its next move"
        : "Alex is considering your offer";
    $("transcript").append(t);
  }
  if (added || s.busy) $("transcript").scrollTop = $("transcript").scrollHeight;
  $("turn-count").textContent = `${s.messages.length} / 12 MESSAGES`;
  $("seller-latest").textContent = money(s.seller_offer);
  $("buyer-latest").textContent = money(s.buyer_offer);
  $("limit-latest").textContent = money(s.setup.budget);
  const latest = s.messages.filter((m) => m.actor === "buyer").at(-1);
  if (latest) {
    $("tactic").textContent = tactics[latest.tactic];
    $("reason").textContent = latest.reason;
  }
  drawChart(s);
  if (s.error) {
    error(s.error);
    auto = false;
  }
  const active = s.status === "active";
  $("activity").textContent = s.busy
    ? `${s.next_actor === "buyer" ? "Dickerer" : "The seller"} is generating a reply…`
    : active
      ? auto
        ? "Negotiation running"
        : "Paused. Continue when you’re ready."
      : "Simulation complete.";
  $("outcome").classList.toggle("hidden", active);
  if (!active) {
    auto = false;
    const box = $("outcome");
    box.replaceChildren();
    box.classList.toggle("no-deal", s.status !== "agreed");
    const kicker = document.createElement("p");
    kicker.className = "eyebrow";
    kicker.textContent = "SIMULATED OUTCOME";
    const h = document.createElement("h3");
    const p = document.createElement("p");
    if (s.status === "agreed") {
      h.textContent = "A deal within your limits.";
      const amount = document.createElement("div");
      amount.className = "result-price";
      amount.textContent = money(s.agreed_price);
      p.textContent = `${money(s.listing.asking - s.agreed_price)} below the fictional asking price · ${money(s.setup.budget - s.agreed_price)} under your limit. This is a simulation, not a real purchase or measured real-world savings.`;
      box.append(kicker, h, amount, p);
    } else {
      h.textContent =
        s.status === "stopped"
          ? "You called time."
          : s.status === "round_limit"
            ? "No agreement this round."
            : "Sometimes the right move is to leave.";
      p.textContent =
        s.status === "round_limit"
          ? "Both sides reached the six-round limit without agreement. No deal was forced."
          : "Your budget stayed intact. Try a different target or seller personality to see what changes.";
      box.append(kicker, h, p);
    }
    $("debrief").classList.remove("hidden");
    $("debrief-copy").textContent =
      `Alex’s private floor was ${money(s.seller_debrief.floor)}. ${s.seller_debrief.note}`;
  }
  controls();
}
async function advance() {
  if (working || !session || state?.status !== "active") return;
  working = true;
  error();
  controls();
  const identity = session.session_id;
  try {
    let next = state.busy
      ? state
      : await api(`/api/sessions/${identity}/turn`, "POST", {
          version: state.version,
        });
    if (session?.session_id !== identity) return;
    render(next);
    while (next.busy && session?.session_id === identity) {
      await sleep(1000);
      next = await api(`/api/sessions/${identity}`);
      if (session?.session_id === identity) render(next);
    }
  } catch (e) {
    auto = false;
    error(
      e.name === "TimeoutError"
        ? "The connection timed out. Your turn may still be running; resume to recover it."
        : e.message,
    );
  } finally {
    working = false;
    controls();
  }
  if (auto && state?.status === "active" && !state.error) {
    await sleep(650);
    if (auto) void advance();
  }
}
$("setup-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (working || auto) return;
  error();
  try {
    if (!session) {
      $("run").disabled = true;
      const result = await api(
        "/api/sessions",
        "POST",
        {
          scenario: $("scenario").value,
          persona: $("persona").value,
          target: Number($("target").value),
          budget: Number($("budget").value),
          brief: $("brief").value,
        },
        null,
      );
      session = { session_id: result.session_id, token: result.token };
      sessionStorage.setItem("dickerer-session", JSON.stringify(session));
      render(result.state);
      if (innerWidth < 701)
        $("conversation-title").scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
    }
    auto = true;
    void advance();
  } catch (e) {
    error(e.message);
    controls();
  }
});
$("pause").addEventListener("click", () => {
  auto = false;
  controls();
  $("activity").textContent = working
    ? "Pausing after this reply…"
    : "Paused. You’re in control.";
});
$("step").addEventListener("click", () => {
  auto = false;
  void advance();
});
$("end").addEventListener("click", async () => {
  if (!session) return;
  auto = false;
  try {
    render(await api(`/api/sessions/${session.session_id}/stop`, "POST"));
  } catch (e) {
    error(e.message);
  }
});
$("reset").addEventListener("click", async () => {
  auto = false;
  if (!session) return;
  try {
    await api(`/api/sessions/${session.session_id}`, "DELETE");
  } catch (e) {
    error(e.message);
    return;
  }
  session = null;
  state = null;
  rendered = 0;
  working = false;
  sessionStorage.removeItem("dickerer-session");
  $("transcript").innerHTML = initialEmpty;
  for (const id of ["outcome", "debrief", "export"])
    $(id).classList.add("hidden");
  $("debrief").open = false;
  $("turn-count").textContent = "READY WHEN YOU ARE";
  $("tactic").textContent = "Start with the facts";
  $("buyer-latest").textContent = "—";
  $("activity").textContent = "Every reply is generated live.";
  error();
  selectListing();
  controls();
});
$("scenario").addEventListener("change", selectListing);
$("budget").addEventListener("input", () => {
  $("limit-latest").textContent = money(Number($("budget").value));
});
$("export").addEventListener("click", () => {
  if (!state) return;
  const data = {
    demo: "Dickerer fictional negotiation",
    exported_at: new Date().toISOString(),
    ...state,
  };
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "dickerer-negotiation.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
async function init() {
  try {
    const [data, health] = await Promise.all([
      api("/api/scenarios", "GET", null, null),
      api("/api/health", "GET", null, null),
    ]);
    catalog = data.scenarios;
    selectListing();
    $("model-status").textContent =
      health.model_ready === false
        ? "Local model is offline · try again shortly"
        : "Local AI · two independent roles";
    $("status-dot").classList.toggle("ready", health.model_ready !== false);
    try {
      session = JSON.parse(
        sessionStorage.getItem("dickerer-session") || "null",
      );
    } catch {
      session = null;
    }
    if (session) {
      try {
        const s = await api(`/api/sessions/${session.session_id}`);
        $("scenario").value = s.setup.scenario;
        const retained = session;
        session = null;
        selectListing();
        session = retained;
        for (const id of ["budget", "target", "persona", "brief"])
          $(id).value = s.setup[id];
        render(s);
        if (s.busy) void advance();
      } catch {
        session = null;
        sessionStorage.removeItem("dickerer-session");
      }
    }
    controls();
  } catch (e) {
    $("model-status").textContent = "The lab is temporarily unavailable";
    error(e.message);
    $("run").disabled = true;
  }
}
void init();
