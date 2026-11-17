"use strict";
// Fixed demo scope; no marketplace credentials, raw browsing data or tokens.
const actions = new Set([
  "snapshot",
  "analyze",
  "start",
  "pause",
  "step",
  "end",
  "reset",
  "export",
]);
const waiting = new Map();
window.addEventListener("message", (event) => {
  if (
    event.source !== window ||
    event.origin !== location.origin ||
    event.data?.type !== "dickerer:response"
  )
    return;
  const pending = waiting.get(event.data.requestId);
  if (!pending) return;
  clearTimeout(pending.timer);
  waiting.delete(event.data.requestId);
  pending.reply({ snapshot: event.data.snapshot });
});
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (
    sender.id !== chrome.runtime.id ||
    message?.type !== "dickerer:sidebar" ||
    !actions.has(message.action)
  )
    return false;
  if (
    location.pathname !== "/dickerer/" &&
    location.pathname !== "/dickerer/index.php"
  ) {
    reply({ error: "Open the demo marketplace page." });
    return false;
  }
  const requestId = crypto.randomUUID();
  const timer = setTimeout(() => {
    waiting.delete(requestId);
    reply({
      error: "The marketplace page did not respond. Refresh it and retry.",
    });
  }, 20000);
  waiting.set(requestId, { reply, timer });
  window.postMessage(
    {
      type: "dickerer:command",
      channel: "dickerer-extension",
      requestId,
      action: message.action,
      payload: message.payload || {},
    },
    location.origin,
  );
  return true;
});
