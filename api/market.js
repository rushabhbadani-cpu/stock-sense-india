const https = require('https');

module.exports = async (req, res) => {
  // Set headers so the website can talk to this API
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  const { action, q, symbol } = req.query;
  const RAPID_KEY = '06c40cc462msh2a69c4bed748376p121936jsna8eb70935d62';
  const RAPID_HOST = 'yh-finance.p.rapidapi.com';

  try {
    if (action === 'search') {
      const options = {
        hostname: RAPID_HOST,
        path: `/auto-complete?q=${encodeURIComponent(q)}&region=IN`,
        headers: { 'x-rapidapi-key': RAPID_KEY, 'x-rapidapi-host': RAPID_HOST }
      };

      https.get(options, (apiRes) => {
        let rawData = '';
        apiRes.on('data', (chunk) => { rawData += chunk; });
        apiRes.on('end', () => {
          const body = JSON.parse(rawData);
          const results = (body.quotes || []).map(i => ({
            symbol: i.symbol,
            name: i.shortname || i.longname || i.symbol
          }));
          res.status(200).json({ results });
        });
      }).on('error', (e) => res.status(500).json({ error: e.message }));

    } else if (action === 'quote') {
      const sym = symbol.includes('.') ? symbol : `${symbol}.NS`;
      const options = {
        hostname: RAPID_HOST,
        path: `/stock/v2/get-summary?symbol=${encodeURIComponent(sym)}&region=IN`,
        headers: { 'x-rapidapi-key': RAPID_KEY, 'x-rapidapi-host': RAPID_HOST }
      };

      https.get(options, (apiRes) => {
        let rawData = '';
        apiRes.on('data', (chunk) => { rawData += chunk; });
        apiRes.on('end', () => {
          const d = JSON.parse(rawData);
          if (!d.price) return res.status(404).json({ error: 'No Data' });
          
          res.status(200).json({
            symbol: d.symbol,
            name: d.price.longName || d.symbol,
            price: d.price.regularMarketPrice?.raw || 0,
            changePct: (d.price.regularMarketChangePercent?.raw || 0) * 100,
            high52: d.summaryDetail?.fiftyTwoWeekHigh?.raw || 0,
            pe: d.summaryDetail?.trailingPE?.raw || 0
          });
        });
      }).on('error', (e) => res.status(500).json({ error: e.message }));
    }
  } catch (err) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
};
