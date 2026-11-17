"use strict";
const $ = (id) => document.getElementById(id);
const isExtension = !!globalThis.chrome?.runtime?.id;
const money = (value) =>
  value == null
    ? "—"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      }).format(value);
const tactics = {
  opening_anchor: "A grounded opening",
  condition: "Use the known condition",
  convenience: "Trade convenience for value",
  meet_halfway: "A measured concession",
  hold_line: "Hold the line",
  accept: "A workable deal",
  walk_away: "Protect your budget",
};
let view = null,
  listingId = null,
  boundSession = false,
  tabId = null,
  polling = false;
const knownActions = new Set([
  "snapshot",
  "analyze",
  "start",
  "pause",
  "step",
  "end",
  "reset",
  "export",
]);
function localError(message) {
  $("error").textContent = message;
  $("error").classList.toggle("hidden", !message);
}
async function send(action, payload = {}) {
  if (!knownActions.has(action)) return;
  if (!isExtension) {
    parent.postMessage(
      { type: "dickerer:command", action, payload },
      location.origin,
    );
    return;
  }
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (!tab?.id)
      throw new Error("Open the demo marketplace in the active tab.");
    if (tabId !== tab.id) {
      tabId = tab.id;
      listingId = null;
      boundSession = false;
      $("analysis").classList.add("hidden");
    }
    const response = await chrome.tabs.sendMessage(tabId, {
      type: "dickerer:sidebar",
      action,
      payload,
    });
    if (response?.error) throw new Error(response.error);
    if (response?.snapshot) render(response.snapshot);
  } catch (e) {
    $("page-status").textContent = "Open the demo marketplace";
    $("page-detail").textContent =
      "This demo extension works only on the fictional marketplace.";
    $("status-dot").classList.remove("ready");
    $("analyze").disabled = true;
    $("run").disabled = true;
    for (const id of ["pause", "step", "end", "reset", "export"])
      $(id).disabled = true;
    $("analysis").classList.add("hidden");
    view = null;
    listingId = null;
    boundSession = false;
    if (action !== "snapshot") localError(e.message);
  }
}
function render(s) {
  view = s;
  const item = s.listing,
    state = s.state,
    active = state?.status === "active";
  if (!item) {
    $("page-status").textContent = s.loading
      ? "Loading the listing…"
      : "Marketplace unavailable";
    $("page-detail").textContent =
      s.error || "Open the demo marketplace to begin.";
    localError(s.error || "");
    return;
  }
  $("page-status").textContent = "Marketplace listing detected";
  $("page-detail").textContent = item.title;
  $("status-dot").classList.add("ready");
  $("analyze").disabled = s.loading || s.analyzed;
  $("analyze").textContent = s.analyzed
    ? "✓ Listing analyzed"
    : "Analyze this listing →";
  $("analysis").classList.toggle("hidden", !s.analyzed);
  $("product-name").textContent = item.title;
  $("asking").textContent = money(item.asking);
  $("market-range").textContent =
    `${money(item.market[0])}–${money(item.market[1])}`;
  $("listing-insight").textContent = item.leverage;
  if (listingId !== item.id || (!s.hasSession && boundSession)) {
    listingId = item.id;
    $("target").value = item.target;
    $("budget").value = item.budget;
    $("brief").value =
      "I can collect locally this weekend after inspecting the item.";
    boundSession = false;
  }
  if (s.hasSession && state && !boundSession) {
    for (const id of ["target", "budget", "brief"])
      $(id).value = state.setup[id];
    boundSession = true;
  }
  for (const id of ["target", "budget"]) $(id).max = item.asking;
  for (const id of ["target", "budget", "brief"]) $(id).disabled = s.hasSession;
  $("run").disabled = s.loading || s.working || s.auto || (!!state && !active);
  $("run-label").textContent = !state
    ? "Negotiate for me"
    : !active
      ? "Negotiation complete"
      : s.auto
        ? "Negotiating…"
        : "Resume negotiation";
  $("pause").disabled = !s.auto;
  $("step").disabled = !active || s.working || s.auto;
  $("end").disabled = !active;
  $("reset").disabled = s.working;
  $("export").disabled = false;
  $("reset").classList.toggle("hidden", !s.hasSession);
  $("export").classList.toggle("hidden", !state?.messages.length);
  $("activity").textContent = s.working
    ? state?.next_actor === "seller"
      ? "Waiting for the seller’s reply…"
      : "Dickerer is preparing your reply…"
    : state
      ? active
        ? s.auto
          ? "Negotiation running"
          : "Paused. Continue when you’re ready."
        : "Simulation complete."
      : "Ready when you are.";
  const latest = state?.messages.filter((m) => m.actor === "buyer").at(-1);
  $("tactic").textContent = latest
    ? tactics[latest.tactic]
    : "Start with the facts";
  $("reason").textContent = latest ? latest.reason : item.leverage;
  $("latest-reply").classList.toggle("hidden", !latest);
  $("latest-reply").textContent = latest?.message || "";
  $("buyer-latest").textContent = money(state?.buyer_offer);
  $("seller-latest").textContent = money(state?.seller_offer ?? item.asking);
  $("turn-count").textContent = state
    ? `${state.messages.length}/12 MESSAGES`
    : "READY";
  $("connection").textContent =
    s.health?.model_ready === false
      ? "Local model offline · retry later"
      : "Local model · Separate buyer and seller roles";
  localError(s.error || "");
  const finished = state && !active;
  $("outcome").classList.toggle("hidden", !finished);
  $("debrief").classList.toggle("hidden", !finished);
  if (finished) {
    const box = $("outcome");
    box.replaceChildren();
    box.classList.toggle("no-deal", state.status !== "agreed");
    const title = document.createElement("h3"),
      p = document.createElement("p");
    if (state.status === "agreed") {
      title.textContent = "A deal within your limits";
      const price = document.createElement("div");
      price.className = "result-price";
      price.textContent = money(state.agreed_price);
      p.textContent = `${money(item.asking - state.agreed_price)} below the fictional asking price, ${money(state.setup.budget - state.agreed_price)} under your limit. This is a simulated agreement, not a real purchase.`;
      box.append(title, price, p);
    } else {
      title.textContent =
        state.status === "stopped"
          ? "You ended the conversation"
          : "No deal. Budget protected.";
      p.textContent =
        "The simulation ended without an agreement. A deal is never forced.";
      box.append(title, p);
    }
    $("debrief-copy").textContent =
      `Alex’s private floor was ${money(state.seller_debrief.floor)}. It was not included in Dickerer’s context.`;
  }
}
if (!isExtension) {
  window.addEventListener("message", (event) => {
    if (
      event.source === parent &&
      event.origin === location.origin &&
      event.data?.type === "dickerer:state"
    )
      render(event.data.snapshot);
  });
  void send("snapshot");
} else {
  $("extension-label").textContent = "About this demo extension";
  $("extension-download").classList.add("hidden");
  async function poll() {
    if (polling) return;
    polling = true;
    try {
      await send("snapshot");
    } finally {
      polling = false;
    }
  }
  void poll();
  setInterval(poll, 1200);
}
$("analyze").addEventListener("click", () => void send("analyze"));
$("setup-form").addEventListener("submit", (event) => {
  event.preventDefault();
  void send("start", {
    target: Number($("target").value),
    budget: Number($("budget").value),
    brief: $("brief").value,
  });
});
for (const action of ["pause", "step", "end", "reset", "export"])
  $(action).addEventListener("click", () => void send(action));
