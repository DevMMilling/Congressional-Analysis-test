from bs4 import BeautifulSoup
SAMPLE_HTML = '''
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
'''

soup = BeautifulSoup(SAMPLE_HTML, "lxml")
lines = [div.get_text(strip=True) for div in soup.find_all('div')]
print(lines)
