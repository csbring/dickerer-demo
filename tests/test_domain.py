import json

import pytest

from dickerer_demo.domain import Setup, Proposal, agent_context, apply_proposal, create_state, public_state, validate_proposal, price_neutral_message


def proposal(action="offer", price=350, **kwargs):
    return Proposal(action=action, price=price, message="Could you consider this offer after inspection?",
                    reason="The known wear supports a measured opening.", tactic="opening_anchor", **kwargs)


def test_setup_rejects_incoherent_limits():
    for args in ({"target": 410, "budget": 400}, {"budget": 600}, {"budget": 5}, {"brief": "x" * 281}):
        with pytest.raises(ValueError):
            Setup(**args)


def test_private_contexts_are_separate():
    state = create_state(Setup(brief="PRIVATE BUYER NOTE", budget=397, target=371))
    buyer = json.loads(agent_context(state)[1])
    assert "private_seller_floor" not in buyer
    state["next_actor"] = "seller"
    seller = json.loads(agent_context(state)[1])
    assert "private_buyer_constraints" not in seller
    assert "PRIVATE BUYER NOTE" not in json.dumps(seller)
    assert "397" not in json.dumps(seller)


@pytest.mark.parametrize("action,price", [("offer", 401), ("accept", 480), ("accept", 390)])
def test_buyer_cannot_exceed_budget_or_accept_invented_price(action, price):
    with pytest.raises(ValueError):
        validate_proposal(create_state(Setup()), proposal(action, price))


def test_seller_cannot_accept_below_floor_or_invent_acceptance():
    state = create_state(Setup())
    apply_proposal(state, proposal(price=350), .1, "test")
    for action, price in [("accept", 350), ("accept", 400), ("offer", 350), ("offer", 500)]:
        with pytest.raises(ValueError):
            validate_proposal(state, proposal(action, price))


def test_acceptance_is_exact_and_inside_both_constraints():
    state = create_state(Setup())
    apply_proposal(state, proposal(price=390), .1, "test")
    apply_proposal(state, proposal("accept", 390), .1, "test")
    assert state["status"] == "agreed" and state["agreed_price"] == 390
    assert state["seller_floor"] <= state["agreed_price"] <= state["setup"]["budget"]


def test_opponent_never_receives_private_decision_explanation():
    state = create_state(Setup())
    p = proposal(); p.reason = "PRIVATE PLAN: stay within the buyer's ceiling."
    apply_proposal(state, p, .1, "test")
    assert "PRIVATE PLAN" not in agent_context(state)[1]


def test_public_projection_hides_seller_reason_and_floor_until_end():
    state = create_state(Setup())
    apply_proposal(state, proposal(), .1, "test")
    p = proposal(price=420); p.reason = "PRIVATE SELLER FLOOR"
    apply_proposal(state, p, .1, "test")
    view = public_state(state)
    assert "seller_floor" not in view and "seller_debrief" not in view
    assert "PRIVATE SELLER FLOOR" not in json.dumps(view)
    assert "reason" in view["messages"][0]
    apply_proposal(state, proposal("walk_away", None), .1, "test")
    assert "seller_debrief" in public_state(state)


def test_money_in_message_rejected_to_prevent_conflicting_prices():
    p = proposal(); p.message = "I can pay $500, regardless of what the offer field says."
    with pytest.raises(ValueError):
        validate_proposal(create_state(Setup()), p)


def test_buyer_cannot_reduce_previous_offer():
    state = create_state(Setup()); state["buyer_offer"] = 370
    with pytest.raises(ValueError):
        validate_proposal(state, proposal(price=350))


def test_round_cap_does_not_fabricate_a_deal():
    state = create_state(Setup())
    for _ in range(6):
        apply_proposal(state, proposal(price=350), .1, "test")
        apply_proposal(state, proposal(price=420), .1, "test")
    assert state["status"] == "round_limit" and state["agreed_price"] is None


def test_matching_prose_prices_are_normalized_but_conflicts_are_rejected():
    p = proposal(price=380)
    for text in ("Three hundred eighty dollars works for me.", "I can offer $380."):
        p.message = text
        cleaned = price_neutral_message(p)
        validate_proposal(create_state(Setup()), cleaned)
        assert "this price" in cleaned.message.lower()
    for text in ("I can offer four hundred fifty dollars.", "My maximum is $420."):
        p.message = text
        with pytest.raises(ValueError):
            price_neutral_message(p)
