"use strict";
const $ = (id) => document.getElementById(id);
const base = document.querySelector('meta[name="api-base"]').content;
const money = (value) =>
  value == null
    ? "—"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      }).format(value);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let catalog = [],
  health = null,
  session = null,
  state = null,
  analyzed = false,
  auto = false,
  working = false,
  loading = true,
  errorText = "",
  rendered = 0,
  nativeUntil = 0;
const frame = $("assistant-frame");
const listing = () => catalog.find((item) => item.id === $("scenario").value);

async function api(path, method = "GET", body = null, auth = session) {
  const headers = { "Content-Type": "application/json" };
  if (auth) headers.Authorization = `Bearer ${auth.token}`;
  const response = await fetch(base ? base + encodeURIComponent(path) : path, {
    method,
    headers,
    body: body === null ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
    cache: "no-store",
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(
      "The demo service is unavailable. Please try again shortly.",
    );
  }
  if (!response.ok) {
    let message = data.detail;
    if (Array.isArray(message))
      message = message
        .map((x) => x.msg.replace("Value error, ", ""))
        .join(" ");
    throw new Error(
      typeof message === "string"
        ? message
        : "The request could not be completed.",
    );
  }
  return data;
}
function snapshot() {
  return {
    listing: listing() || null,
    health,
    state,
    hasSession: !!session && !!state,
    analyzed,
    auto,
    working,
    loading,
    error: errorText,
  };
}
function broadcast() {
  const payload = { type: "dickerer:state", snapshot: snapshot() };
  frame.contentWindow?.postMessage(payload, location.origin);
  // Deliberately sends only the public session projection, never the bearer token.
  window.postMessage(payload, location.origin);
  $("scenario").disabled = !!session || loading;
  $("persona").disabled = !!session || loading;
}
function showSidebar() {
  if (nativeUntil > Date.now()) return;
  $("browser-layout").classList.remove("sidebar-closed");
  $("open-sidebar").setAttribute("aria-expanded", "true");
}
$("open-sidebar").addEventListener("click", showSidebar);
$("focus-assistant").addEventListener("click", showSidebar);
$("close-sidebar").addEventListener("click", () => {
  $("browser-layout").classList.add("sidebar-closed");
  $("open-sidebar").setAttribute("aria-expanded", "false");
  $("open-sidebar").focus();
});
if (innerWidth <= 740) $("browser-layout").classList.add("sidebar-closed");
function resetChat() {
  rendered = 0;
  $("transcript").replaceChildren();
  $("chat-outcome").classList.add("hidden");
  const day = document.createElement("p");
  day.className = "chat-day";
  day.textContent = "TODAY · FICTIONAL CONVERSATION";
  const empty = document.createElement("p");
  empty.className = "empty-chat";
  empty.id = "empty-chat";
  empty.textContent =
    "Your conversation with Alex will appear here. Open the buying assistant in the sidebar to analyze this listing and negotiate.";
  $("transcript").append(day, empty);
}
function selectListing() {
  const item = listing();
  if (!item) return;
  $("product-art").innerHTML = illustrations[item.id];
  $("listing-title").textContent = item.title;
  $("asking-price").textContent = money(item.asking);
  $("category").textContent = item.category.toLowerCase();
  $("chat-item").textContent = `${item.title} · ${money(item.asking)}`;
  $("facts").replaceChildren(
    ...item.facts.map((text) => {
      const li = document.createElement("li");
      li.textContent = text;
      return li;
    }),
  );
  analyzed = false;
  resetChat();
  broadcast();
}
function addMessage(m) {
  const article = document.createElement("article");
  article.className = `message ${m.actor}`;
  const meta = document.createElement("div");
  meta.className = "message-meta";
  meta.textContent = m.actor === "buyer" ? "You" : "Alex Morgan";
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  const text = document.createElement("div");
  text.textContent = m.message;
  bubble.append(text);
  const offer = document.createElement("div");
  offer.className = "offer-label";
  const label = document.createElement("span");
  label.textContent = {
    offer: "Offer",
    accept: "Accepted",
    walk_away: "Decision",
  }[m.action];
  const value = document.createElement("strong");
  value.textContent = m.action === "walk_away" ? "No deal" : money(m.price);
  offer.append(label, value);
  bubble.append(offer);
  article.append(meta, bubble);
  $("transcript").append(article);
}
function render(next) {
  state = next;
  analyzed = true;
  $("thinking")?.remove();
  if (next.messages.length) $("empty-chat")?.remove();
  const added = next.messages.length > rendered;
  for (let i = rendered; i < next.messages.length; i++)
    addMessage(next.messages[i]);
  rendered = next.messages.length;
  if (next.busy) {
    const typing = document.createElement("div");
    typing.id = "thinking";
    typing.className = "thinking";
    typing.textContent =
      next.next_actor === "seller"
        ? "Alex is typing…"
        : "Your reply is being prepared…";
    $("transcript").append(typing);
  }
  if (added || next.busy)
    $("transcript").scrollTop = $("transcript").scrollHeight;
  if (next.error) {
    errorText = next.error;
    auto = false;
  }
  if (next.status !== "active") {
    auto = false;
    $("chat-outcome").classList.remove("hidden");
    $("chat-outcome").textContent =
      next.status === "agreed"
        ? `You and Alex agreed on ${money(next.agreed_price)} in this simulation.`
        : next.status === "stopped"
          ? "You ended this simulated conversation."
          : "The simulated conversation ended without an agreement.";
  }
  broadcast();
}
async function advance() {
  if (working || !session || state?.status !== "active") return;
  working = true;
  errorText = "";
  broadcast();
  const id = session.session_id;
  try {
    let next = state.busy
      ? state
      : await api(`/api/sessions/${id}/turn`, "POST", {
          version: state.version,
        });
    if (session?.session_id !== id) return;
    render(next);
    while (next.busy && session?.session_id === id) {
      await sleep(1000);
      next = await api(`/api/sessions/${id}`);
      if (session?.session_id === id) render(next);
    }
  } catch (e) {
    if (session?.session_id === id) {
      auto = false;
      errorText =
        e.name === "TimeoutError"
          ? "The connection timed out. Resume to recover your saved turn."
          : e.message;
    }
  } finally {
    working = false;
    broadcast();
  }
  if (auto && state?.status === "active" && !state.error) {
    await sleep(650);
    if (auto) void advance();
  }
}
async function command(action, payload = {}) {
  if (action === "snapshot") return;
  if (loading) throw new Error("The listing is still loading.");
  if (action === "analyze") {
    analyzed = true;
    errorText = "";
    return;
  }
  if (action === "start") {
    if (working || auto) return;
    if (!analyzed) throw new Error("Analyze the open listing first.");
    if (!session) {
      working = true;
      errorText = "";
      broadcast();
      try {
        const result = await api(
          "/api/sessions",
          "POST",
          {
            scenario: $("scenario").value,
            persona: $("persona").value,
            target: Number(payload.target),
            budget: Number(payload.budget),
            brief: String(payload.brief || "").slice(0, 280),
          },
          null,
        );
        session = { session_id: result.session_id, token: result.token };
        sessionStorage.setItem("dickerer-session", JSON.stringify(session));
        render(result.state);
      } finally {
        working = false;
      }
    }
    auto = true;
    void advance();
    return;
  }
  if (action === "pause") {
    auto = false;
    return;
  }
  if (action === "step") {
    auto = false;
    void advance();
    return;
  }
  if (action === "end") {
    auto = false;
    if (session)
      render(await api(`/api/sessions/${session.session_id}/stop`, "POST"));
    return;
  }
  if (action === "reset") {
    auto = false;
    if (working)
      throw new Error(
        "Pause and let the current reply finish, or end the conversation before resetting.",
      );
    if (session) await api(`/api/sessions/${session.session_id}`, "DELETE");
    session = null;
    state = null;
    sessionStorage.removeItem("dickerer-session");
    errorText = "";
    selectListing();
    return;
  }
  if (action === "export") {
    if (!state) return;
    const blob = new Blob(
      [
        JSON.stringify(
          {
            demo: "Dickerer fictional negotiation",
            exported_at: new Date().toISOString(),
            ...state,
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = "dickerer-negotiation.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  throw new Error("Unknown sidebar action.");
}
const allowed = new Set([
  "snapshot",
  "analyze",
  "start",
  "pause",
  "step",
  "end",
  "reset",
  "export",
]);
window.addEventListener("message", async (event) => {
  if (event.origin !== location.origin) return;
  const fromFrame = event.source === frame.contentWindow;
  const fromExtension =
    event.source === window && event.data?.channel === "dickerer-extension";
  if (
    (!fromFrame && !fromExtension) ||
    event.data?.type !== "dickerer:command" ||
    !allowed.has(event.data.action)
  )
    return;
  if (fromExtension && event.data.action === "snapshot") {
    nativeUntil = Date.now() + 5000;
    $("browser-layout").classList.add("native-panel");
    $("open-sidebar").textContent = "Browser extension connected";
    $("open-sidebar").disabled = true;
  }
  try {
    await command(event.data.action, event.data.payload);
  } catch (e) {
    errorText = e.message;
    auto = false;
  }
  broadcast();
  if (fromExtension)
    window.postMessage(
      {
        type: "dickerer:response",
        requestId: event.data.requestId,
        snapshot: snapshot(),
      },
      location.origin,
    );
});
setInterval(() => {
  if (nativeUntil && nativeUntil < Date.now()) {
    nativeUntil = 0;
    $("browser-layout").classList.remove("native-panel");
    $("open-sidebar").textContent = "Open buying assistant";
    $("open-sidebar").disabled = false;
  }
}, 1500);
$("scenario").addEventListener("change", () => {
  if (!session) selectListing();
});
async function init() {
  try {
    const results = await Promise.all([
      api("/api/scenarios", "GET", null, null),
      api("/api/health", "GET", null, null),
    ]);
    catalog = results[0].scenarios;
    health = results[1];
    selectListing();
    try {
      session = JSON.parse(
        sessionStorage.getItem("dickerer-session") || "null",
      );
    } catch {
      session = null;
    }
    if (session) {
      try {
        const restored = await api(`/api/sessions/${session.session_id}`);
        $("scenario").value = restored.setup.scenario;
        $("persona").value = restored.setup.persona;
        selectListing();
        render(restored);
        if (restored.busy) void advance();
      } catch {
        session = null;
        sessionStorage.removeItem("dickerer-session");
      }
    }
  } catch (e) {
    errorText = e.message;
  } finally {
    loading = false;
    broadcast();
  }
}
void init();
