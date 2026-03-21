export default async function handler(req, res) {
  // 1. Set Security & Type Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  const { action, q, symbol } = req.query;
  
  // 2. Your Credentials
  const RAPID_KEY = '06c40cc462msh2a69c4bed748376p121936jsna8eb70935d62';
  const RAPID_HOST = 'yh-finance.p.rapidapi.com';

  try {
    // --- ACTION: SEARCH ---
    if (action === 'search') {
      const url = `https://${RAPID_HOST}/auto-complete?q=${encodeURIComponent(q)}&region=IN`;
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'x-rapidapi-key': RAPID_KEY, 'x-rapidapi-host': RAPID_HOST }
      });
      const data = await response.json();
      return res.status(200).json({ results: data.quotes || [] });
    }

    // --- ACTION: QUOTE (Price Data) ---
    if (action === 'quote') {
      // Ensure Indian stocks have the .NS suffix
      const cleanSymbol = symbol.includes('.') ? symbol : `${symbol}.NS`;
      const url = `https://${RAPID_HOST}/stock/v2/get-summary?symbol=${encodeURIComponent(cleanSymbol)}&region=IN`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'x-rapidapi-key': RAPID_KEY, 'x-rapidapi-host': RAPID_HOST }
      });
      
      const d = await response.json();

      // Check if price data actually exists in the response
      if (!d.price) {
        return res.status(404).json({ error: 'Market data unavailable for this symbol' });
      }

      // Format the data for your frontend
      const result = {
        symbol: d.symbol,
        name: d.price.longName || d.symbol,
        price: d.price.regularMarketPrice?.raw || 0,
        changePct: (d.price.regularMarketChangePercent?.raw || 0) * 100,
        high52: d.summaryDetail?.fiftyTwoWeekHigh?.raw || 0,
        pe: d.summaryDetail?.trailingPE?.raw || 0
      };

      return res.status(200).json(result);
    }

    return res.status(400).json({ error: 'Invalid action' });

  } catch (err) {
    // This logs the specific error to your Vercel Dashboard
    console.error("API Error:", err.message);
    return res.status(500).json({ error: 'Server crashed', details: err.message });
  }
}
