"""Tests for the shared interval helpers."""

from app.services.market import SUPPORTED_INTERVALS, nearest_intervals


def test_nearest_intervals_start_with_the_closest():
    """5min falls back to 1min/15min first and to monthly last."""
    order = nearest_intervals("5min")
    assert set(order[:2]) == {"1min", "15min"}
    assert order[-1] == "monthly"
    assert nearest_intervals("weekly")[:2] == ["monthly", "daily"]  # 4x vs 7x apart


def test_nearest_intervals_cover_every_other_interval():
    """Every interval except the requested one is a candidate, once."""
    for interval in SUPPORTED_INTERVALS:
        order = nearest_intervals(interval)
        assert sorted(order) == sorted(i for i in SUPPORTED_INTERVALS if i != interval)
