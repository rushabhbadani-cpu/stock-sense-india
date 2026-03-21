// StockSense India — Market Proxy v4.2 (RapidAPI Integration)
const https = require('https');

function httpsGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const opts = new URL(url);
    const options = {
      hostname: opts.hostname,
      path: opts.pathname + opts.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'application/json',
        ...headers
      },
      timeout: 10000
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
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

  const p = req.query || {};
  const action = p.action || 'quote';

  try {
    if (action === 'search') {
      const r = await httpsGet(`https://${RAPID_HOST}/auto-complete?q=${p.q}&region=IN`, headers);
      const results = (r.body.quotes || []).map(item => ({
        symbol: item.symbol,
        name: item.shortname || item.symbol,
        exch: item.exchDisp || 'NSE'
      }));
      return res.status(200).json({ results });
    }

    if (action === 'quote') {
      const symbol = p.symbol.includes('.') ? p.symbol : `${p.symbol}.NS`;
      const r = await httpsGet(`https://${RAPID_HOST}/stock/v2/get-summary?symbol=${symbol}&region=IN`, headers);
      const d = r.body;

      if (!d.price) return res.status(404).json({ error: 'Not found' });

      const result = {
        symbol: d.symbol,
        price: d.price.regularMarketPrice?.raw || 0,
        change: d.price.regularMarketChange?.raw || 0,
        changePct: d.price.regularMarketChangePercent?.raw * 100 || 0,
        high52: d.summaryDetail?.fiftyTwoWeekHigh?.raw || 0,
        low52: d.summaryDetail?.fiftyTwoWeekLow?.raw || 0,
        pe: d.summaryDetail?.trailingPE?.raw || 0,
        name: d.price.longName || d.symbol,
        sector: d.summaryProfile?.sector || 'General',
        live: true
      };
      return res.status(200).json(result);
    }
  } catch (err) {
    res.status(500).json({ error: 'API Error' });
  }
};
