export default async function handler(req, res) {
  // Allow the website to talk to this function
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  const { action, q, symbol } = req.query;
  const RAPID_KEY = '06c40cc462msh2a69c4bed748376p121936jsna8eb70935d62';
  const RAPID_HOST = 'yh-finance.p.rapidapi.com';

  try {
    // SEARCH ACTION
    if (action === 'search') {
      const response = await fetch(`https://${RAPID_HOST}/auto-complete?q=${encodeURIComponent(q)}&region=IN`, {
        headers: { 'x-rapidapi-key': RAPID_KEY, 'x-rapidapi-host': RAPID_HOST }
      });
      const data = await response.json();
      const results = (data.quotes || []).map(i => ({
        symbol: i.symbol,
        name: i.shortname || i.symbol
      }));
      return res.status(200).json({ results });
    }

    // QUOTE ACTION
    if (action === 'quote') {
      const sym = symbol.includes('.') ? symbol : `${symbol}.NS`;
      const response = await fetch(`https://${RAPID_HOST}/stock/v2/get-summary?symbol=${encodeURIComponent(sym)}&region=IN`, {
        headers: { 'x-rapidapi-key': RAPID_KEY, 'x-rapidapi-host': RAPID_HOST }
      });
      const d = await response.json();

      if (!d.price) return res.status(404).json({ error: 'No Data' });

      return res.status(200).json({
        symbol: d.symbol,
        name: d.price.longName || d.symbol,
        price: d.price.regularMarketPrice?.raw || 0,
        changePct: (d.price.regularMarketChangePercent?.raw || 0) * 100,
        high52: d.summaryDetail?.fiftyTwoWeekHigh?.raw || 0,
        pe: d.summaryDetail?.trailingPE?.raw || 0
      });
    }
  } catch (err) {
    return res.status(500).json({ error: 'API Error', details: err.message });
  }
}
