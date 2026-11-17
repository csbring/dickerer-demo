# Demo verification — 17 November 2026

This record describes the bounded demo, not validation of the full Dickerer product or its marketplace integrations.

- 25 deterministic tests cover role-context separation, hard budgets and seller floors, exact acceptance, rejected conflicting prose prices, bounded retries, authentication, session isolation, expiration, restart recovery, cancellation, queue capacity and duplicate turn requests.
- Local Qwen 3.5 27B trial, reasonable seller: the fictional camera negotiation reached $400 against a $480 ask and a $400 hard limit.
- Local Qwen trial, firm seller: the seller stayed above budget and Dickerer walked away. No agreement was forced.
- Public HTTPS browser run: pause held after the first message, single-step added exactly one reply, refresh restored the session, and resume reached a fictional $390 agreement. Export contained the conversation but no session token; reset deleted the session.
- Desktop (1440 px) and mobile (390 px) had no horizontal overflow. No JavaScript page errors occurred in the public browser run. An alternate listing updated its default prices correctly.
- The public gateway served the interface and model-readiness check, and rejected a non-allowlisted route. The backend requires the gateway key; session access requires a separate bearer token.

Outcomes vary between model runs. Prices and comparable ranges are fictional scenario data. Model explanations and prose are fallible even when numeric constraints pass. The hosted workstation and Ollama must be available for live negotiation.
