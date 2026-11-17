# Dickerer — Negotiation lab

**[Try the public demo](https://cbring.synology.me/dickerer/)** · [Automated checks](https://github.com/csbring/dickerer-demo/actions)

A public, interactive demo of a local AI buyer negotiating with a separately prompted local AI seller. Visitors choose a fictional listing, set a target and hard budget, and run or step through the exchange. Offers, counteroffers and decision explanations are generated live through Ollama.

**Status:** working simulation demo. The broader Dickerer marketplace buying copilot is incomplete. This demo does not contact real sellers, send marketplace messages, make purchases, or establish real-world savings.

![Dickerer negotiation demo](docs/demo.png)

## Run locally

Requires Python 3.11+, Ollama, and `qwen3.5:27b` (or a compatible model supporting structured output). The hosted demo runs on the author's local GPU. Model size affects hardware requirements and response time.

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e '.[test]'
ollama pull qwen3.5:27b
python -m dickerer_demo.app
```

Open `http://127.0.0.1:8770`. Use `OLLAMA_MODEL` and `OLLAMA_URL` to configure your own local inference server. No cloud fallback or fake conversation is substituted when a model fails.

## What the demo demonstrates

- Separate role contexts: the seller does not receive the buyer's budget, target, private brief or decision explanations. The buyer never receives the seller's floor.
- Deterministic price checks reject over-budget offers, below-floor seller prices, invalid acceptances and contradictory price movements. These checks are adapted from the budget-first approach in the original Dickerer copilot.
- Actual local generation for both roles, with one bounded retry for malformed or invalid replies.
- Automatic play, pause, single-message stepping, ending, refresh recovery and transcript download.
- Genuine no-deal outcomes: a firm seller may be incompatible with the buyer's budget.
- Mobile and desktop layouts, keyboard controls, reduced-motion support and accessible status messages.

The price and action fields are authoritative. Matching price mentions in model prose are replaced with “this price”; conflicting numeric or dollar-word amounts are rejected. Model wording can still be imperfect. The same model plays two separate roles; these are not independent trained systems. Comparables, condition details, seller personas and price floors are invented scenario inputs, not scraped market data. Decision explanations are short model-written summaries, not an exposure of hidden reasoning.

## Public hosting architecture

Synology serves the static interface and a narrow PHP API gateway. The workstation runs the FastAPI service and local Ollama. The inference service is not directly exposed to the internet. The gateway forwards only allowlisted demo routes and authenticates to the backend with a server-side key. See [deployment instructions](deploy/README.md).

Visitor sessions use high-entropy bearer tokens, separate authorization checks, and SQLite persistence. A session lasts 24 hours and is deleted when the visitor resets it. No account login is required. Do not enter personal details: the host stores the fictional brief and conversation until deletion/expiry cleanup. Expired rows are removed on startup and new-session creation. No analytics, external fonts, model API credentials or datasets are bundled.

Public inference is bounded: one generation at a time, at most three queued/in-flight sessions, 12 messages per session, 20 turn attempts per session, 80 turns/hour per IP, and 300 turns/hour globally. Each turn can use at most two model requests. One backend process owns the queue; run exactly one worker. The host must remain online, and model speed depends on its hardware and other load.

## Configuration

| Variable | Default |
|---|---|
| `OLLAMA_URL` | `http://127.0.0.1:11434` |
| `OLLAMA_MODEL` | `qwen3.5:27b` |
| `DICKERER_BIND` | `127.0.0.1` |
| `DICKERER_PORT` | `8770` |
| `DICKERER_DATA_DIR` | `~/.local/share/dickerer-demo` |
| `DICKERER_GATEWAY_KEY` | unset; required for non-loopback binding |

Runtime keys and the session database belong outside the checkout. The published repository contains source code, synthetic tests and fictional scenarios only.

## Verification

```bash
pytest -q
```

Tests use an isolated database and a fake model adapter to exercise negotiation invariants, isolation, authorization, duplicate requests, pause/end behavior, persistence and failure recovery. The public app always uses Ollama; test doubles are not exposed as a runtime mode. An explicit live smoke script exercises both agents against your own local Ollama without contacting a seller.

The original Dickerer app remains separate. This repository is the focused demo, not a claim that its extension, marketplace integrations or full product are finished.

See [verification notes](docs/VALIDATION.md) for the tested scope and limitations.
