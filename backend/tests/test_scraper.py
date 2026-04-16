from backend.app.services.ingest import CapitolTradesScraper


SAMPLE_HTML = """
<html><body>
<div>John Doe</div>
<div>Democratic House CA</div>
<div>Example Corp</div>
<div>EXM:US</div>
<div>25 Mar</div>
<div>2026</div>
<div>12 Mar</div>
<div>2026</div>
<div>days</div>
<div>13</div>
<div>Self</div>
<div>buy</div>
<div>1K-15K</div>
<div>$41.03</div>
<div>Goto trade detail page.</div>
</body></html>
"""


def test_scraper_parses_single_trade():
    scraper = CapitolTradesScraper()
    trades = scraper.parse_html(SAMPLE_HTML)
    assert len(trades) == 1
    assert trades[0].politician_name == "John Doe"
    assert trades[0].ticker == "EXM"
    assert trades[0].transaction_type == "buy"
