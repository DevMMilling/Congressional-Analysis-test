from backend.app.utils import parse_money_range


def test_parse_money_range():
    low, high, mid = parse_money_range("1K-15K")
    assert low == 1000
    assert high == 15000
    assert mid == 8000


def test_parse_undisclosed():
    assert parse_money_range("Undisclosed") == (None, None, None)
