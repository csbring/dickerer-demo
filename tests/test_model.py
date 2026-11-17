import asyncio
import json

import httpx
import pytest

from dickerer_demo.domain import Setup, create_state
from dickerer_demo.model import LocalModel, ModelUnavailable


def test_bad_model_reply_is_retried_and_never_applied(monkeypatch):
    calls = []
    def handle(request):
        calls.append(json.loads(request.content))
        value = {"action": "offer", "price": 600 if len(calls) == 1 else 360,
                 "message": "Could you consider this after inspection?",
                 "reason": "A considered opening based on the known condition.", "tactic": "condition"}
        return httpx.Response(200, json={"message": {"content": json.dumps(value)}})
    real_client = httpx.AsyncClient
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kw: real_client(transport=httpx.MockTransport(handle), **kw))
    state = create_state(Setup())
    proposal, _ = asyncio.run(LocalModel("http://test", "qwen3.5:27b").propose(state))
    assert len(calls) == 2 and proposal.price == 360
    assert state["messages"] == []
    assert "exceeds your hard budget" in calls[1]["messages"][-1]["content"]


def test_repeated_invalid_replies_fail_without_scripted_dialogue(monkeypatch):
    calls = []
    def handle(request):
        calls.append(request)
        return httpx.Response(200, json={"message": {"content": "{}"}})
    real_client = httpx.AsyncClient
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kw: real_client(transport=httpx.MockTransport(handle), **kw))
    with pytest.raises(ModelUnavailable):
        asyncio.run(LocalModel("http://test", "qwen3.5:27b").propose(create_state(Setup())))
    assert len(calls) == 2
