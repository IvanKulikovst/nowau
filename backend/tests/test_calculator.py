from datetime import date

import pytest

from app.services.calculator import CalcInput, calculate

DOC = dict(amount=8e6, executed_amount=2e6, claim_date=date(2025, 1, 1), filing_date=date(2026, 3, 1),
           execution_date=date(2026, 1, 1), total_assets=150e6, current_expenses=10e6, sigma3=120e6)


def test_doc_chapter14_style():
    r = calculate(CalcInput(mode="P4", **DOC, judge_stats={"n_cases": 45, "approval_rate": 0.70, "is_significant": True}))
    assert r["p_ch"] == 0.65 and r["p_zero"] == 0.5 and r["p_sub"] == 0.1
    assert r["expected_amount"] == pytest.approx(5e6)
    assert sum(s["probability"] for s in r["scenarios"]) == pytest.approx(1, abs=1e-3)
    assert r["range_low"] <= r["expected_amount"] <= r["range_high"]
    assert any(a["key"] == "defend_deal" for a in r["actions"])
    assert r["actions"][0]["key"] == "registry"        # П0 всегда первым


def test_probabilistic_mode_uses_industry():
    r = calculate(CalcInput(mode="P1", amount=10e6))
    assert r["method"] == "probabilistic"
    assert r["expected_pct"] == pytest.approx(0.9 * 0.57 * 0.06 * 0.57, rel=1e-2)
    assert r["confidence"] == "low"
    assert r["range_high"] - r["range_low"] >= 0.9 * r["expected_amount"] - 1   # расширенный диапазон


def test_exact_mode_discounts():
    base = dict(amount=10e6, total_assets=500e6, sigma3=100e6)
    r4 = calculate(CalcInput(mode="P4", **base))
    r6 = calculate(CalcInput(mode="P6", **base))
    assert r6["method"] == "exact" and r6["expected_amount"] < r4["expected_amount"]


def test_subordination_zeroes_payout():
    r = calculate(CalcInput(mode="P4", amount=10e6, status="kdl", crisis=True, rescue_form=True,
                            unusual_conditions=True, total_assets=100e6, sigma3=200e6, sigma_sub=10e6))
    assert r["p_sub"] == 0.85
    assert any(a["key"] == "fight_subordination" for a in r["actions"])
    assert r["priorities"][1].startswith("П1")


def test_critical_au_flag():
    r = calculate(CalcInput(mode="P4", amount=10e6, total_assets=100e6, sigma3=50e6,
                            au_signals={"removed": True, "disqualification_filed": True}))
    assert r["p_zero"] >= 0.85 and r["expected_pct"] <= 0.05
    assert any(a["key"] == "remove_au" for a in r["actions"])


def test_secured_creditor():
    r = calculate(CalcInput(mode="P4", amount=80e6, construction_type="pledge", is_credit_contract=True,
                            claim_date=date(2025, 1, 1), filing_date=date(2026, 1, 1), total_assets=150e6,
                            current_expenses=10e6, collateral=[{"C": 100e6, "L": 0.9}], sigma3=120e6))
    assert r["queue"] == "secured" and r["m1"]["alpha"] == 0.8
    assert r["audit"]["G"] == pytest.approx(72e6)
    assert r["expected_pct"] > 0.5


def test_penalty_goes_to_third():
    r = calculate(CalcInput(mode="P4", amount=1e6, construction_type="penalty", total_assets=10e6, sigma3=20e6))
    assert r["m0"]["passes"] is False and r["queue"] == "third"


def test_low_payout_only_registry():
    r = calculate(CalcInput(mode="P4", amount=300_000, total_assets=0, sigma3=50e6, executed_amount=0))
    assert r["p_zero"] == 0.85
    assert "П3" in " ".join(r["priorities"])
    assert [a["key"] for a in r["actions"]] == ["registry"]


def test_no_execution_means_no_challenge():
    r = calculate(CalcInput(mode="P4", amount=5e6, total_assets=100e6, sigma3=50e6))
    assert r["p_ch"] == 0


def test_unknown_data_adds_assumptions():
    r = calculate(CalcInput(mode="P3", amount=5e6))
    assert any("Σ3" in a for a in r["assumptions"]) and r["confidence"] == "low"
