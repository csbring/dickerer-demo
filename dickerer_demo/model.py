"""Ollama adapter: actual generation for each side, no scripted fallback."""
import json
import time

import httpx

from .domain import Proposal, agent_context, validate_proposal, price_neutral_message


class ModelUnavailable(Exception):
    pass


class LocalModel:
    def __init__(self, url: str, name: str):
        self.url, self.name = url.rstrip("/"), name

    async def propose(self, state: dict) -> tuple[Proposal, float]:
        system, context = agent_context(state)
        system += "\nReturn exactly these five keys: action, price, message, reason, tactic. "
        system += "The output JSON schema is:\n" + json.dumps(Proposal.model_json_schema())
        messages = [{"role": "system", "content": system}, {"role": "user", "content": context}]
        start = time.monotonic()
        async with httpx.AsyncClient(timeout=httpx.Timeout(75, connect=5), trust_env=False) as client:
            for attempt in range(2):
                try:
                    response = await client.post(self.url + "/api/chat", json={
                        "model": self.name, "stream": False,
                        **({"think": False} if self.name.startswith("qwen3") else {}),
                        "messages": messages, "format": Proposal.model_json_schema(),
                        "options": {"temperature": .55, "num_predict": 350, "num_ctx": 4096},
                        "keep_alive": "10m",
                    })
                    response.raise_for_status()
                    text = response.json()["message"]["content"]
                except (httpx.HTTPError, KeyError, ValueError) as exc:
                    raise ModelUnavailable("The local model is temporarily unavailable. Your last completed turn is saved; try again.") from exc
                try:
                    proposal = price_neutral_message(Proposal.model_validate_json(text))
                    validate_proposal(state, proposal)
                    return proposal, time.monotonic() - start
                except ValueError as exc:
                    # A second actual model call can repair invalid output; no fake dialogue.
                    messages += [{"role": "assistant", "content": text[:2500]},
                                 {"role": "user", "content": "Revise your JSON. Rule violation: " + str(exc)[:700]}]
        raise ModelUnavailable("The model's reply did not pass the negotiation rules. Nothing was sent. You can retry this turn.")
