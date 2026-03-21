export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  const { action, q, symbol } = req.query;
  const RAPID_KEY = '06c40cc462msh2a69c4bed748376p121936jsna8eb70935d62';
  const RAPID_HOST = 'yh-finance.p.rapidapi.com';

  try {
    // 1. SEARCH LOGIC
    if (action === 'search') {
      const response = await fetch(`https://${RAPID_HOST}/auto-complete?q=${encodeURIComponent(q)}&region=IN`, {
        headers: { 'x-rapidapi-key': RAPID_KEY, 'x-rapidapi-host': RAPID_HOST }
      });
      const data = await response.json();
      return res.status(200).json({ results: data.quotes || [] });
    }

    // 2. QUOTE LOGIC (The "Price" Fetcher)
    if (action === 'quote') {
      const cleanSymbol = symbol.includes('.') ? symbol : `${symbol}.NS`;
      
      // We are switching to 'get-insights' or 'get-quotes' which is more reliable for NSE
      const response = await fetch(`https://${RAPID_HOST}/market/v2/get-quotes?region=IN&symbols=${encodeURIComponent(cleanSymbol)}`, {
        headers: { 'x-rapidapi-key': RAPID_KEY, 'x-rapidapi-host': RAPID_HOST }
      });
      
      const d = await response.json();
      const stock = d.quoteResponse?.result?.[0];

      if (!stock) {
        return res.status(404).json({ error: `Market closed or Symbol ${cleanSymbol} not found.` });
      }

      return res.status(200).json({
        symbol: stock.symbol,
        name: stock.longName || stock.shortName || stock.symbol,
        price: stock.regularMarketPrice || 0,
        changePct: stock.regularMarketChangePercent || 0,
        high52: stock.fiftyTwoWeekHigh || 0,
        pe: stock.trailingPE || 0
      });
    }
  } catch (err) {
    return res.status(500).json({ error: 'System Timeout', details: err.message });
  }
}
