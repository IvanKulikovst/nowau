import pytest

from app.services.formulas import D, E_R, E_R_final, R_3, R_sec, R_sub, discount_factor


class TestF1:
    def test_doc_example(self):  # 100·10/120
        assert D(10, 100, 120) == pytest.approx(8.3333, rel=1e-3)

    def test_capped_by_claim(self):
        assert D(10, 1000, 120) == 10

    def test_zero_sigma(self):
        assert D(10, 100, 0) == 0

    def test_zero_pool(self):
        assert D(10, 0, 120) == 0

    def test_zero_claim(self):
        assert D(0, 100, 120) == 0

    def test_full_payout_when_pool_equals_sigma(self):
        assert D(10, 120, 120) == 10


class TestF2:
    def test_doc_example(self):  # G=72, остаток 8 → D(8, 68, 120)
        r = R_sec(80, 90, 0.8, 68, 120)
        assert r == pytest.approx(72 + 68 * 8 / 120)

    def test_pledge_covers_all(self):
        assert R_sec(50, 100, 0.8, 0, 100) == 50

    def test_no_collateral(self):
        assert R_sec(50, 0, 0.7, 10, 100) == pytest.approx(5)

    def test_alpha_70(self):
        assert R_sec(100, 100, 0.7, 0, 100) == 70

    def test_never_exceeds_claim(self):
        assert R_sec(10, 100, 0.8, 1000, 10) <= 10


class TestF3:
    def test_basic(self):
        assert R_3(10, 60, 120) == 5

    def test_full(self):
        assert R_3(10, 1000, 120) == 10

    def test_empty_mass(self):
        assert R_3(10, 0, 120) == 0

    def test_equals_D(self):
        assert R_3(7, 33, 99) == D(7, 33, 99)

    def test_tiny_share(self):
        assert R_3(1, 100, 1_000_000) == pytest.approx(1e-4)


class TestF4:
    def test_zero_when_independents_unpaid(self):
        assert R_sub(10, 100, 120, 10) == 0

    def test_gets_remainder(self):
        assert R_sub(10, 130, 120, 10) == 10

    def test_partial(self):
        assert R_sub(10, 125, 120, 20) == pytest.approx(2.5)

    def test_exact_boundary(self):
        assert R_sub(10, 120, 120, 10) == 0

    def test_zero_sub_sigma(self):
        assert R_sub(10, 200, 120, 0) == 0


class TestF5:
    def test_no_risks(self):
        assert E_R(0, 0, 10, 5, 0) == 10

    def test_certain_challenge(self):
        assert E_R(0, 1, 10, 5, 0) == 5

    def test_certain_subordination(self):
        assert E_R(1, 0, 10, 5, 2) == 2

    def test_weights_sum_to_one(self):
        assert E_R(0.3, 0.4, 1, 1, 1, 1) == pytest.approx(1)

    def test_mixed(self):
        assert E_R(0.1, 0.5, 10, 4, 0) == pytest.approx(0.9 * 0.5 * 10 + 0.5 * 0.9 * 4)

    def test_sub_after_ch(self):
        assert E_R(1, 1, 10, 5, 2, 3) == 3


class TestF6:
    def test_doc_example(self):
        assert E_R_final(5, 0.4) == 3

    def test_zero_pzero(self):
        assert E_R_final(5, 0) == 5

    def test_certain_zero(self):
        assert E_R_final(5, 1) == 0

    def test_monotonic(self):
        assert E_R_final(5, 0.2) > E_R_final(5, 0.6)

    def test_discount(self):
        assert discount_factor(0.1, 1) == pytest.approx(1 / 1.1)
