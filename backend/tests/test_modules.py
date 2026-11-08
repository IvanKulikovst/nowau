from datetime import date

import pytest

from app.services.level_detector import detect_levels
from app.services.mode_detector import mode_from_bundle
from app.services.modules.m0_filter import m0_filter
from app.services.modules.m1_queue import m1_queue
from app.services.modules.m2_1_subordination import m2_1_subordination as sub
from app.services.modules.m2_2_challenging import m2_2_challenging as ch
from app.services.modules.m3_economics import executive_fee, m3_economics
from app.services.modules.m4_practice import au_delta, au_independence_score, judge_delta
from app.tasks.recalculate import is_critical
from app.tasks.update_stats import delta_new


def test_m0():
    assert m0_filter("pledge")["passes"] and m0_filter("surety")["passes"]
    assert not m0_filter("penalty")["passes"] and not m0_filter("deposit")["passes"]
    assert m0_filter("supply") == {"passes": True, "queue": "third"}


def test_m1():
    d = date(2026, 1, 1)
    assert m1_queue(date(2026, 2, 1), d, "supply", False, False)["queue"] == "current"
    assert m1_queue(date(2025, 1, 1), d, "pledge", False, False) == {"queue": "secured", "alpha": 0.7}
    assert m1_queue(date(2025, 1, 1), d, "pledge", True, False)["alpha"] == 0.8
    assert m1_queue(date(2025, 1, 1), d, "loan", False, True)["queue"] == "third_subordinated"
    assert m1_queue(date(2025, 1, 1), d, "supply", False, False)["queue"] == "third"


@pytest.mark.parametrize("kw,expected", [
    (dict(status="kdl", crisis=True, rescue_form=True, unusual_conditions=True), 0.85),
    (dict(status="affiliated", crisis=True, rescue_form=True), 0.70),
    (dict(status="affiliated", crisis=True), 0.50),
    (dict(status="independent"), 0.10),
    (dict(status="kdl", crisis=True, rescue_form=True, exception_surety_before_crisis=True), 0.05),
    (dict(status="kdl", crisis=True, rescue_form=True, exception_non_voluntary=True), 0.05),
    (dict(status="kdl", crisis=True, rescue_form=True, exception_market_practice=True), 0.10),
    (dict(status="kdl", crisis=True, rescue_form=True, exception_majority_consent=True), 0.10),
    (dict(status="kdl", crisis=True, rescue_form=True, only_covenants=True), 0.15),
    (dict(status="kdl", crisis=True, rescue_form=True, only_covenants=True, beneficial_interest=True), 0.70),
])
def test_m2_1(kw, expected):
    assert sub(**kw)["p_sub"] == expected


def test_m2_2_windows():
    f = date(2026, 6, 1)
    big = dict(amount=5e6, total_assets=100e6)
    assert ch(None, f, **big)["p_ch"] == 0
    assert ch(date(2026, 5, 15), f, **big)["p_ch"] == 0.70
    assert ch(date(2026, 3, 1), f, **big)["p_ch"] == 0.50
    assert ch(date(2025, 10, 1), f, is_equivalent=False, **big)["p_ch"] == 0.60
    assert ch(date(2025, 10, 1), f, **big)["p_ch"] == 0.05
    assert ch(date(2024, 6, 1), f, is_gratuitous=True, **big)["p_ch"] == 0.40
    assert ch(date(2020, 6, 1), f, is_gratuitous=True, **big)["p_ch"] == 0.05


def test_m2_2_ordinary_activity():
    assert ch(date(2026, 5, 20), date(2026, 6, 1), amount=1e6, total_assets=100e6)["p_ch"] == 0.05
    assert ch(date(2026, 5, 20), date(2026, 6, 1), amount=1_000_001, total_assets=100e6)["p_ch"] == 0.70


def test_m3():
    r = m3_economics(150e6, 10e6, 0, 0, 0, [], None)
    assert r["M"] == 140e6 and r["p_zero"] == 0.50
    r = m3_economics(150e6, 10e6, 0, 0, 0, [{"C": 100e6, "L": 0.9}])
    assert r["total_collateral_net"] == pytest.approx(90e6) and r["p_zero"] == 0.20
    assert m3_economics(5, 10, 0, 0, 0, [])["p_zero"] == 0.85
    assert m3_economics(5, 10, 0, 0, 0, [])["M"] == 0


def test_executive_fee():
    assert executive_fee(1_000_000) == 120_000
    assert executive_fee(10_000) == 20_000
    assert executive_fee(10_000, is_citizen=True) == 2_000
    assert executive_fee(0) == 0


def test_m4_judge():
    assert not judge_delta({"n_cases": 9, "approval_rate": 0.9})["profile"]
    assert judge_delta({"n_cases": 45, "approval_rate": 0.70, "is_significant": True})["delta_ch"] == 0.15
    assert judge_delta({"n_cases": 45, "approval_rate": 0.45, "is_significant": True})["delta_ch"] == 0
    assert judge_delta({"n_cases": 45, "approval_rate": 0.20, "is_significant": True})["delta_ch"] == pytest.approx(-0.138)
    assert judge_delta({"n_cases": 20, "approval_rate": 0.70, "is_significant": False})["delta_ch"] == 0.075
    assert judge_delta({"n_cases": 45, "approval_rate": 0.55, "is_significant": True})["delta_ch"] == pytest.approx(0.072)


def test_m4_au():
    assert not au_delta({"n_cases": 4})["profile"]
    assert au_delta({"n_cases": 10, "filed_on_your_deal": True})["delta_ch"] == 0.10
    assert au_delta({"n_cases": 10, "filed_similar": 2})["delta_ch"] == 0.06
    assert au_delta({"n_cases": 10, "filed_similar": 20})["delta_ch"] == 0.20      # потолок
    a = au_delta({"n_cases": 10, "passive_on_suspicious": True, "losses_recovered": 1, "rau_top20": True})
    assert a["delta_zero"] == pytest.approx(0.15)


def test_au_index():
    assert au_independence_score({})["score"] == 0
    r = au_independence_score({"removed": True, "disqualification_filed": True})
    assert r["score"] == 80 and r["critical"]
    assert au_independence_score({"removed": True})["critical"] is False   # 50 ≤ 60
    assert au_independence_score({k: True for k in ["removed", "disqualified", "sro_match"]})["score"] == 100


def test_mode_detector():
    assert mode_from_bundle({"found": False})["mode"] == "P1"
    assert mode_from_bundle({"found": False, "crisis_signs": True})["mode"] == "P2"
    m = lambda *t: {"found": True, "debtor": {"name": "x"}, "messages": [{"type": x} for x in t]}
    assert mode_from_bundle(m("case_opened"))["mode"] == "P3"
    assert mode_from_bundle(m("judge_appointed", "au_appointed"))["mode"] == "P4"
    assert mode_from_bundle(m("judge_appointed", "au_appointed", "registry_closed"))["mode"] == "P5"
    assert mode_from_bundle(m("registry_closed", "trading_started"))["mode"] == "P6"
    assert mode_from_bundle({"found": True, "messages": []})["mode"] == "P3"


def test_levels():
    assert detect_levels("P0", {})["M3"] == 0
    assert detect_levels("P4", {"has_assets": True})["M3"] == 3
    assert detect_levels("P5", {"has_assets": True, "has_collateral": True})["M3"] == 5
    assert detect_levels("P4", {"has_execution": True, "facts_confirmed": True, "has_payment_docs": True})["M2.2"] == 5


def test_recalc_rules():
    assert is_critical(0.60, 0.80)
    assert is_critical(0.69, 0.71)
    assert not is_critical(0.50, 0.55)
    assert delta_new(5, 8, 40, 100, 1) == 0
    assert delta_new(30, 45, 43, 100, 1) != 0
