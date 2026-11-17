from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager, closing
import hashlib
import hmac
import json
import logging
import os
from pathlib import Path
import secrets
import sqlite3
import time

import httpx

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field

from .domain import PERSONAS, SCENARIOS, Setup, apply_proposal, create_state, public_state
from .model import LocalModel, ModelUnavailable

STATIC = Path(__file__).parent / "static"


class Store:
    def __init__(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.path = path
        with closing(self.connect()) as db, db:
            db.executescript("""
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY, token_hash TEXT NOT NULL, expires REAL NOT NULL, state TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires REAL NOT NULL);
            """)
            db.execute("DELETE FROM sessions WHERE expires < ?", (time.time(),))
            for sid, raw in db.execute("SELECT id,state FROM sessions").fetchall():
                state = json.loads(raw)
                if state["busy"]:
                    state["busy"] = False
                    state["error"] = "The demo restarted during this turn. Your completed messages are saved; retry to continue."
                    db.execute("UPDATE sessions SET state=? WHERE id=?", (json.dumps(state), sid))
        path.chmod(0o600)

    def connect(self):
        db = sqlite3.connect(self.path, timeout=5)
        db.execute("PRAGMA journal_mode=WAL")
        return db

    def limit(self, key: str, maximum: int, seconds: int = 3600):
        now = time.time()
        with closing(self.connect()) as db, db:
            db.execute("DELETE FROM limits WHERE expires < ?", (now,))
            db.execute("INSERT OR IGNORE INTO limits VALUES (?,0,?)", (key, now + seconds))
            count = db.execute("SELECT count FROM limits WHERE key=?", (key,)).fetchone()[0]
            if count >= maximum:
                raise HTTPException(429, "This public demo's usage limit has been reached. Please try again later.", headers={"Retry-After": "60"})
            db.execute("UPDATE limits SET count=count+1 WHERE key=?", (key,))

    def create(self, setup: Setup):
        sid, token = secrets.token_hex(16), secrets.token_urlsafe(32)
        state = create_state(setup)
        with closing(self.connect()) as db, db:
            db.execute("DELETE FROM sessions WHERE expires < ?", (time.time(),))
            if db.execute("SELECT COUNT(*) FROM sessions").fetchone()[0] >= 1000:
                raise HTTPException(503, "The demo is at capacity. Please try again later.")
            db.execute("INSERT INTO sessions VALUES (?,?,?,?)",
                       (sid, hashlib.sha256(token.encode()).hexdigest(), time.time() + 86400, json.dumps(state)))
        return sid, token, state

    def load(self, sid: str, token: str | None = None):
        with closing(self.connect()) as db:
            row = db.execute("SELECT token_hash,expires,state FROM sessions WHERE id=?", (sid,)).fetchone()
        if not row or row[1] < time.time():
            raise HTTPException(404, "This session expired or does not exist. Start a new negotiation.")
        if token is not None and not hmac.compare_digest(row[0], hashlib.sha256(token.encode()).hexdigest()):
            raise HTTPException(404, "This session expired or does not exist. Start a new negotiation.")
        return json.loads(row[2])

    def save(self, sid: str, state: dict):
        with closing(self.connect()) as db, db:
            db.execute("UPDATE sessions SET state=? WHERE id=?", (json.dumps(state), sid))

    def delete(self, sid: str):
        with closing(self.connect()) as db, db:
            db.execute("DELETE FROM sessions WHERE id=?", (sid,))


class Turn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version: int = Field(ge=0, le=12, strict=True)


def create_app(data_path: Path | None = None, model=None, gateway_key: str | None = None):
    key = gateway_key if gateway_key is not None else os.environ.get("DICKERER_GATEWAY_KEY", "")
    path = data_path or Path(os.environ.get("DICKERER_DATA_DIR", Path.home() / ".local/share/dickerer-demo")) / "sessions.sqlite"
    store = Store(path)
    local_model = model or LocalModel(os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434"),
                                     os.environ.get("OLLAMA_MODEL", "qwen3.5:27b"))
    pending: dict[str, asyncio.Task] = {}
    model_lock = asyncio.Semaphore(1)
    reservation_lock = asyncio.Lock()
    readiness = {"checked": 0.0, "ready": False}

    @asynccontextmanager
    async def lifespan(app):
        yield
        for task in list(pending.values()):
            task.cancel()
        await asyncio.gather(*pending.values(), return_exceptions=True)

    app = FastAPI(title="Dickerer negotiation demo", docs_url=None, redoc_url=None,
                  openapi_url=None, lifespan=lifespan)
    app.state.store, app.state.pending = store, pending

    @app.middleware("http")
    async def boundary(request: Request, call_next):
        if request.url.path.startswith("/api/"):
            if key and not hmac.compare_digest(request.headers.get("x-demo-gateway", ""), key):
                return JSONResponse({"detail": "Gateway authentication required."}, status_code=403)
            if request.method not in {"GET", "POST", "DELETE"}:
                return JSONResponse({"detail": "Method not allowed."}, status_code=405)
            body = bytearray()
            async for chunk in request.stream():
                body.extend(chunk)
                if len(body) > 4096:
                    return JSONResponse({"detail": "Request too large."}, status_code=413)
            request._body = bytes(body)
        response = await call_next(request)
        response.headers.update({
            "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
            "Referrer-Policy": "no-referrer", "X-Frame-Options": "DENY",
            "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
        })
        if request.url.path == "/static/panel.html":
            response.headers["X-Frame-Options"] = "SAMEORIGIN"
            response.headers["Content-Security-Policy"] = response.headers["Content-Security-Policy"].replace(
                "frame-ancestors 'none'", "frame-ancestors 'self'")
        return response

    @app.exception_handler(HTTPException)
    async def http_error(request, exc):
        return JSONResponse({"detail": exc.detail}, status_code=exc.status_code, headers=exc.headers)

    def client_id(request):
        ip = request.headers.get("x-demo-client", "unknown") if key else request.client.host
        return hmac.new((key or "development").encode(), ip.encode(), hashlib.sha256).hexdigest()

    def authorized(sid, request):
        header = request.headers.get("authorization", "")
        if not header.startswith("Bearer ") or len(header) > 160:
            raise HTTPException(401, "This browser does not have access to that session.")
        return store.load(sid, header[7:])

    @app.get("/api/health")
    async def health():
        if time.monotonic() - readiness["checked"] > 20:
            try:
                if isinstance(local_model, LocalModel):
                    async with httpx.AsyncClient(timeout=3, trust_env=False) as client:
                        response = await client.get(local_model.url + "/api/tags")
                        response.raise_for_status()
                        readiness["ready"] = any(m["name"] == local_model.name for m in response.json()["models"])
                else:
                    readiness["ready"] = True
            except (httpx.HTTPError, ValueError, KeyError):
                readiness["ready"] = False
            readiness["checked"] = time.monotonic()
        return {"status": "ok", "model": local_model.name, "simulation": True,
                "model_ready": readiness["ready"], "active_turns": len(pending), "capacity": 3}

    @app.get("/api/scenarios")
    async def scenarios():
        return {"scenarios": list(SCENARIOS.values()),
                "personas": [{"id": k, "label": v["label"]} for k, v in PERSONAS.items()]}

    @app.post("/api/sessions", status_code=201)
    async def start(payload: Setup, request: Request):
        store.limit("create:" + client_id(request), 12)
        store.limit("create:global", 120)
        sid, token, state = store.create(payload)
        return {"session_id": sid, "token": token, "state": public_state(state)}

    @app.get("/api/sessions/{sid}")
    async def get_session(sid: str, request: Request):
        return public_state(authorized(sid, request))

    async def generate(sid: str, version: int):
        try:
            async with model_lock:
                state = store.load(sid)
                if state["version"] != version or state["status"] != "active":
                    return
                proposal, elapsed = await local_model.propose(state)
                # Recheck after generation: a visitor can end/delete a session meanwhile.
                current = store.load(sid)
                if current["version"] == version and current["status"] == "active":
                    store.save(sid, apply_proposal(current, proposal, elapsed, local_model.name))
        except asyncio.CancelledError:
            try:
                state = store.load(sid)
                state["busy"] = False
                state["error"] = "That turn was interrupted. Retry when you are ready."
                store.save(sid, state)
            except HTTPException:
                pass
            raise
        except Exception as exc:
            try:
                state = store.load(sid)
                state["busy"] = False
                state["error"] = str(exc) if isinstance(exc, ModelUnavailable) else "That reply could not be completed safely. Your previous messages are saved; retry this turn."
                store.save(sid, state)
            except HTTPException:
                pass
            logging.warning("Negotiation turn failed: %s", type(exc).__name__)
        finally:
            pending.pop(sid, None)

    @app.post("/api/sessions/{sid}/turn", status_code=202)
    async def next_turn(sid: str, payload: Turn, request: Request):
        async with reservation_lock:
            state = authorized(sid, request)
            if state["busy"] or payload.version < state["version"]:
                return public_state(state)  # Retry/duplicate cannot purchase extra inference.
            if payload.version != state["version"] or state["status"] != "active":
                raise HTTPException(409, "This negotiation has advanced or ended. Refresh its state.")
            if state["attempts"] >= 20:
                raise HTTPException(429, "This session has reached its generation limit. Start a new negotiation later.")
            if len(pending) >= 3:
                raise HTTPException(503, "The local model is helping other visitors. Please retry shortly.", headers={"Retry-After": "10"})
            store.limit("turn:" + client_id(request), 80)
            store.limit("turn:global", 300)
            state["busy"], state["error"] = True, None
            state["attempts"] += 1
            store.save(sid, state)
            pending[sid] = asyncio.create_task(generate(sid, state["version"]))
            return public_state(state)

    @app.post("/api/sessions/{sid}/stop")
    async def stop(sid: str, request: Request):
        async with reservation_lock:
            state = authorized(sid, request)
            if state["status"] == "active":
                state["status"], state["busy"] = "stopped", False
                store.save(sid, state)
                task = pending.get(sid)
                if task:
                    task.cancel()
            return public_state(state)

    @app.delete("/api/sessions/{sid}")
    async def delete(sid: str, request: Request):
        authorized(sid, request)
        task = pending.get(sid)
        if task:
            task.cancel()
        store.delete(sid)
        return {"deleted": True}

    @app.get("/")
    async def index():
        return FileResponse(STATIC / "index.html")

    app.mount("/static", StaticFiles(directory=STATIC), name="static")
    return app


def main():
    import uvicorn
    host = os.environ.get("DICKERER_BIND", "127.0.0.1")
    if host not in {"127.0.0.1", "::1"} and not os.environ.get("DICKERER_GATEWAY_KEY"):
        raise SystemExit("A gateway key is required when binding outside loopback.")
    uvicorn.run(create_app(), host=host, port=int(os.environ.get("DICKERER_PORT", "8770")),
                access_log=False, proxy_headers=False)


if __name__ == "__main__":
    main()
