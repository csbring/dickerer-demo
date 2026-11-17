"""Explicit local-model acceptance check; no real listing or seller is contacted."""
import argparse
import asyncio
import os

from dickerer_demo.domain import Setup, apply_proposal, create_state
from dickerer_demo.model import LocalModel


async def main(persona):
    state = create_state(Setup(persona=persona))
    model = LocalModel(os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434"), os.environ.get("OLLAMA_MODEL", "qwen3.5:27b"))
    while state["status"] == "active":
        proposal, seconds = await model.propose(state)
        actor = state["next_actor"]
        apply_proposal(state, proposal, seconds, model.name)
        print(actor, proposal.action, proposal.price, proposal.message, f"({seconds:.1f}s)", flush=True)
    print("Outcome:", state["status"], "Agreed:", state["agreed_price"], flush=True)
    if state["agreed_price"]:
        assert state["seller_floor"] <= state["agreed_price"] <= state["setup"]["budget"]


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--persona", choices=["balanced", "firm", "quick"], default="balanced")
    asyncio.run(main(parser.parse_args().persona))
