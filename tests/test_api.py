import asyncio
import time

from fastapi.testclient import TestClient
import pytest

from dickerer_demo.app import Store, create_app
from dickerer_demo.domain import Proposal, Setup
from dickerer_demo.model import ModelUnavailable


class Model:
    name = "synthetic-test-model"

    def __init__(self, delay=0, fail=False):
        self.calls, self.delay, self.fail = 0, delay, fail

    async def propose(self, state):
        self.calls += 1
        await asyncio.sleep(self.delay)
        if self.fail:
            raise ModelUnavailable("The model is offline. Try again later.")
        return Proposal(action="offer", price=350, message="Could you consider this after inspection?",
                        reason="Condition supports this opening.", tactic="opening_anchor"), .01


@pytest.fixture
def client(tmp_path):
    with TestClient(create_app(tmp_path / "test.sqlite", Model(.1), gateway_key="")) as c:
        yield c


def start(client):
    result = client.post("/api/sessions", json={}).json()
    return result["session_id"], {"Authorization": "Bearer " + result["token"]}


def wait(client, sid, headers):
    for _ in range(100):
        result = client.get("/api/sessions/" + sid, headers=headers).json()
        if not result["busy"]:
            return result
        time.sleep(.01)
    raise AssertionError("turn did not complete")


def test_session_isolation(client):
    sid, own = start(client)
    _, other = start(client)
    assert client.get("/api/sessions/" + sid).status_code == 401
    assert client.get("/api/sessions/" + sid, headers=other).status_code == 404
    assert client.post(f"/api/sessions/{sid}/turn", headers=other, json={"version":0}).status_code == 404
    assert client.delete("/api/sessions/" + sid, headers=other).status_code == 404
    view = client.get("/api/sessions/" + sid, headers=own).json()
    assert "seller_floor" not in view


def test_duplicate_requests_cannot_generate_extra_turns(client):
    sid, headers = start(client)
    url = f"/api/sessions/{sid}/turn"
    assert client.post(url, headers=headers, json={"version":0}).status_code == 202
    assert client.post(url, headers=headers, json={"version":0}).status_code == 202
    result = wait(client, sid, headers)
    assert result["version"] == 1 and len(result["messages"]) == 1
    assert client.post(url, headers=headers, json={"version":0}).json()["version"] == 1
    assert client.post(url, headers=headers, json={"version":3}).status_code == 409


def test_stop_prevents_inflight_result_from_being_applied(client):
    sid, headers = start(client)
    client.post(f"/api/sessions/{sid}/turn", headers=headers, json={"version":0})
    assert client.post(f"/api/sessions/{sid}/stop", headers=headers).json()["status"] == "stopped"
    time.sleep(.15)
    result = client.get("/api/sessions/" + sid, headers=headers).json()
    assert result["status"] == "stopped" and result["version"] == 0


def test_delete_removes_session(client):
    sid, headers = start(client)
    assert client.delete("/api/sessions/" + sid, headers=headers).json()["deleted"]
    assert client.get("/api/sessions/" + sid, headers=headers).status_code == 404


def test_request_limits_and_security_headers(client):
    assert client.post("/api/sessions", content='x'*5000).status_code == 413
    response = client.get("/")
    assert response.headers["x-content-type-options"] == "nosniff"
    assert "frame-ancestors 'none'" in response.headers["content-security-policy"]
    for _ in range(12):
        assert client.post("/api/sessions", json={}).status_code == 201
    assert client.post("/api/sessions", json={}).status_code == 429


def test_gateway_key_required(tmp_path):
    with TestClient(create_app(tmp_path/"test.sqlite", Model(), gateway_key="test-only-shared-secret")) as client:
        assert client.get("/api/scenarios").status_code == 403
        assert client.get("/api/scenarios", headers={"X-Demo-Gateway":"test-only-shared-secret"}).status_code == 200


def test_model_outage_is_recoverable_without_fake_transcript(tmp_path):
    model = Model(fail=True)
    with TestClient(create_app(tmp_path/"test.sqlite", model, gateway_key="")) as client:
        sid, headers = start(client)
        client.post(f"/api/sessions/{sid}/turn", headers=headers, json={"version":0})
        result = wait(client, sid, headers)
        assert result["error"] and not result["messages"] and result["version"] == 0
        model.fail = False
        client.post(f"/api/sessions/{sid}/turn", headers=headers, json={"version":0})
        assert wait(client, sid, headers)["version"] == 1


def test_restart_preserves_completed_turns_and_recovers_busy(tmp_path):
    path = tmp_path/"sessions.sqlite"
    first = Store(path)
    sid, token, state = first.create(Setup())
    state["busy"] = True
    first.save(sid, state)
    second = Store(path)
    state = second.load(sid, token)
    assert not state["busy"] and "restarted" in state["error"]


def test_expired_session_is_inaccessible(tmp_path):
    store = Store(tmp_path/"sessions.sqlite")
    sid, token, _ = store.create(Setup())
    with store.connect() as db:
        db.execute("UPDATE sessions SET expires=0 WHERE id=?", (sid,))
    with pytest.raises(Exception) as caught:
        store.load(sid, token)
    assert caught.value.status_code == 404


def test_public_queue_has_a_hard_capacity(tmp_path):
    model = Model(delay=1)
    with TestClient(create_app(tmp_path/"test.sqlite", model, gateway_key="")) as client:
        sessions = [start(client) for _ in range(4)]
        for sid, headers in sessions[:3]:
            assert client.post(f"/api/sessions/{sid}/turn", headers=headers, json={"version":0}).status_code == 202
        sid, headers = sessions[3]
        assert client.post(f"/api/sessions/{sid}/turn", headers=headers, json={"version":0}).status_code == 503
