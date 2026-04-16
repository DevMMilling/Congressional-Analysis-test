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


TABLE_HTML = """
<html><body>
<table>
  <tr>
    <th>header</th>
  </tr>
  <tr>
    <td>
      <h2 class="politician-name"><a href="/politicians/S001214">Greg Steube</a></h2>
      <div class="politician-info">
        <span class="party">Republican</span>
        <span class="chamber">House</span>
        <span class="us-state-compact">FL</span>
      </div>
    </td>
    <td>
      <h3 class="issuer-name"><a href="/issuers/2335381">IONQ INC</a></h3>
      <span class="issuer-ticker">IONQ:US</span>
    </td>
    <td><div>13:01</div><div>Yesterday</div></td>
    <td><div>18 Mar</div><div>2026</div></td>
    <td><div>days</div><div>27</div></td>
    <td><span>Spouse</span></td>
    <td><span>buy</span></td>
    <td><span>1K-15K</span></td>
    <td><span>$32.38</span></td>
    <td><a href="/trades/20003797363"><span>Goto trade detail page.</span></a></td>
  </tr>
</table>
</body></html>
"""


def test_scraper_parses_single_trade():
    scraper = CapitolTradesScraper()
    trades = scraper.parse_html(SAMPLE_HTML)
    assert len(trades) == 1
    assert trades[0].politician_name == "John Doe"
    assert trades[0].ticker == "EXM"
    assert trades[0].transaction_type == "buy"


def test_scraper_parses_table_row_trade():
    scraper = CapitolTradesScraper()
    trades = scraper.parse_html(TABLE_HTML)
    assert len(trades) == 1
    assert trades[0].source_trade_id == "20003797363"
    assert trades[0].politician_name == "Greg Steube"
    assert trades[0].ticker == "IONQ"
    assert trades[0].transaction_type == "buy"
    assert trades[0].issuer_name == "IONQ INC"
