# Demo verification — 17 November 2026

This record describes the bounded demo, not validation of the full Dickerer product or its marketplace integrations.

- 25 deterministic tests cover role-context separation, hard budgets and seller floors, exact acceptance, rejected conflicting prose prices, bounded retries, authentication, session isolation, expiration, restart recovery, cancellation, queue capacity and duplicate turn requests.
- Local Qwen 3.5 27B trial, reasonable seller: the fictional camera negotiation reached $400 against a $480 ask and a $400 hard limit.
- Local Qwen trial, firm seller: the seller stayed above budget and Dickerer walked away. No agreement was forced.
- Public HTTPS browser run: pause held after the first message, single-step added exactly one reply, refresh restored the session, and resume reached a fictional $390 agreement. Export contained the conversation but no session token; reset deleted the session.
- Desktop (1440 px) and mobile (390 px) had no horizontal overflow. No JavaScript page errors occurred in the public browser run. An alternate listing updated its default prices correctly.
- The public gateway served the interface and model-readiness check, and rejected a non-allowlisted route. The backend requires the gateway key; session access requires a separate bearer token.

Outcomes vary between model runs. Prices and comparable ranges are fictional scenario data. Model explanations and prose are fallible even when numeric constraints pass. The hosted workstation and Ollama must be available for live negotiation.

## Marketplace sidebar revision

- Dickerer is confined to the sidebar; the main page contains a fictional marketplace listing and buyer/seller chat. Buyer messages are displayed as “You”.
- The sidebar restores the original extension's dark-green visual direction and its listing-analysis → private price plan → negotiation workflow. Analysis reads scenario data; it does not claim a new live-market appraisal.
- 26 API/domain/model tests passed. Only the local sidebar document permits same-origin embedding; the main page and API retain framing restrictions.
- Browser checks passed for analysis, private configuration, pause, one-message stepping, reload recovery, agreement, transcript download, reset, alternate listings, sidebar open/close and mobile layout, with no page errors.
- Loaded the actual Manifest V3 package in Chromium. Verified its native `sidePanel` registration, toolbar behavior, extension messaging through the allowlisted content script, and automatic removal of the embedded preview. A real local-model buyer message reached the marketplace chat through the extension. Switching to an unsupported tab cleared the sidebar and disabled actions.
- The extension archive contains exactly six local source files. It requests `sidePanel` and `activeTab`, injects only on the fictional public demo, and receives neither the API bearer token nor the gateway key.
