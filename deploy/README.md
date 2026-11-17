# Synology deployment

Serve a new `/dickerer/` directory with Web Station/PHP 8.1+ and HTTPS. Keep the original Dickerer product and its database private. Only this standalone demo backend is reachable through the gateway.

1. Install the Python package in an isolated virtual environment on the inference workstation. Run exactly one process; its background queue is process-local.
2. Create a long random `DICKERER_GATEWAY_KEY`. Store it in an owner-readable runtime environment file outside the repository, together with the LAN bind address, port, Ollama model and private data path. The service refuses a non-loopback bind without a key. Keep Ollama on loopback.
3. Adapt `dickerer-demo.service` to the checkout's location, install it as a user service, and enable it. Ensure user lingering is enabled for boot recovery. No broker, marketplace or original Dickerer services are required.
4. Put `dickerer_demo/static/`, `deploy/index.php`, and `deploy/api.php` in the public directory. Replace `__PRIVATE_CONFIG_PATH__` in the deployed `api.php` with the absolute path of a JSON file **outside web root**. That file contains `backend` (the demo's LAN URL), `origin` (the HTTPS public origin), and `key` (the matching gateway key). Grant read access only to the serving PHP user and deployment owner.
5. Verify the PHP gateway rejects arbitrary routes, the backend rejects calls without the key, and sessions reject another visitor's token. The public client never receives the shared gateway key or an Ollama endpoint.
6. Exercise an entire negotiation through the public HTTPS URL on desktop and mobile. Check an agreement and an incompatible-budget outcome. Confirm stopping an in-flight turn cannot append another message.

Copy only the explicit files above. Do not copy runtime environments, SQLite databases, browser profiles, SSH files or model data. Stage updates in a separate directory and preserve the previous public release for rollback.

## Operations

Inspect `systemctl --user status dickerer-demo` and its journal. Logs record failure types, not model prompts or transcripts. `/api/health` checks the configured model exists on Ollama; it does not guarantee an inference will succeed. The public gateway can serve the interface while the workstation is offline, but negotiations require the workstation, service and local model to be available.

Data defaults to `~/.local/share/dickerer-demo/sessions.sqlite`. Its rows contain fictional sessions and hashed bearer tokens. Session IDs and tokens are generated with Python's `secrets` module. The browser keeps its bearer token in session storage; downloaded transcripts omit it. Expired sessions are inaccessible immediately and cleaned up on restart or new-session creation. Reset deletes a session. A model request can continue consuming inference briefly after cancellation at the HTTP layer.

Per-IP limits use a keyed hash of the gateway's remote address, not an IP-address record. If a front proxy collapses all addresses to loopback, limits are shared; do not trust arbitrary client-supplied forwarding headers to bypass this. The global inference budget remains enforced.

This is a bounded demonstration deployment, not an SLA-backed multi-tenant service. It intentionally excludes payments, real seller messaging, marketplace scraping and visitor uploads.
