export default async function handler(req, res) {
  const { action, q, symbol } = req.query;
  const RAPID_KEY = '06c40cc462msh2a69c4bed748376p121936jsna8eb70935d62';
  const RAPID_HOST = 'yh-finance.p.rapidapi.com';

  const headers = {
    'x-rapidapi-key': RAPID_KEY,
    'x-rapidapi-host': RAPID_HOST
  };

  try {
    if (action === 'search') {
      const response = await fetch(`https://${RAPID_HOST}/auto-complete?q=${encodeURIComponent(q)}&region=IN`, { headers });
      const data = await response.json();
      return res.status(200).json({ results: data.quotes || [] });
    }

    if (action === 'quote') {
      const sym = symbol.includes('.') ? symbol : `${symbol}.NS`;
      const response = await fetch(`https://${RAPID_HOST}/stock/v2/get-summary?symbol=${encodeURIComponent(sym)}&region=IN`, { headers });
      const d = await response.json();
      
      const result = {
        symbol: d.symbol,
        name: d.price?.longName || d.symbol,
        price: d.price?.regularMarketPrice?.raw || 0,
        changePct: (d.price?.regularMarketChangePercent?.raw || 0) * 100,
        high52: d.summaryDetail?.fiftyTwoWeekHigh?.raw || 0,
        pe: d.summaryDetail?.trailingPE?.raw || 0
      };
      return res.status(200).json(result);
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
