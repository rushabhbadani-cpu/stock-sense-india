const https = require('https');

function httpsGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const opts = new URL(url);
    const options = {
      hostname: opts.hostname,
      path: opts.pathname + opts.search,
      method: 'GET',
      headers: { ...headers, 'User-Agent': 'Mozilla/5.0' },
      timeout: 10000
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error("Parser Error")); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  const RAPID_KEY = '06c40cc462msh2a69c4bed748376p121936jsna8eb70935d62';
  const RAPID_HOST = 'yh-finance.p.rapidapi.com';
  const headers = { 'x-rapidapi-key': RAPID_KEY, 'x-rapidapi-host': RAPID_HOST };

  const { action, q, symbol } = req.query;

  try {
    if (action === 'search') {
      const data = await httpsGet(`https://${RAPID_HOST}/auto-complete?q=${q}&region=IN`, headers);
      const results = (data.quotes || []).map(item => ({
        symbol: item.symbol,
        name: item.shortname || item.longname || item.symbol
      }));
      return res.status(200).json({ results });
    }

    if (action === 'quote') {
      // Clean symbol: Ensure it has .NS for Indian markets if missing
      const cleanSymbol = symbol.includes('.') ? symbol : `${symbol}.NS`;
      const data = await httpsGet(`https://${RAPID_HOST}/stock/v2/get-summary?symbol=${cleanSymbol}&region=IN`, headers);

      if (!data.price) return res.status(404).json({ error: 'Data not found' });

      // Map API data to simple names for the frontend
      const result = {
        symbol: data.symbol || symbol,
        name: data.price.longName || data.price.shortName || symbol,
        price: data.price.regularMarketPrice?.raw || 0,
        changePct: data.price.regularMarketChangePercent?.raw * 100 || 0,
        high52: data.summaryDetail?.fiftyTwoWeekHigh?.raw || 0,
        low52: data.summaryDetail?.fiftyTwoWeekLow?.raw || 0,
        pe: data.summaryDetail?.trailingPE?.raw || 0,
        sector: data.summaryProfile?.sector || 'Market'
      };
      return res.status(200).json(result);
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
