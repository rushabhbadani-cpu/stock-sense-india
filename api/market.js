const https = require('https');

module.exports = async (req, res) => {
  const { action, q, symbol } = req.query;
  const RAPID_KEY = '06c40cc462msh2a69c4bed748376p121936jsna8eb70935d62';
  const RAPID_HOST = 'yh-finance.p.rapidapi.com';

  const headers = { 'x-rapidapi-key': RAPID_KEY, 'x-rapidapi-host': RAPID_HOST };

  try {
    if (action === 'search') {
      const url = `https://${RAPID_HOST}/auto-complete?q=${q}&region=IN`;
      https.get(url, { headers }, (apiRes) => {
        let data = '';
        apiRes.on('data', c => data += c);
        apiRes.on('end', () => {
          const body = JSON.parse(data);
          const results = (body.quotes || []).map(i => ({ symbol: i.symbol, name: i.shortname || i.symbol }));
          res.status(200).json({ results });
        });
      });
    } else if (action === 'quote') {
      const sym = symbol.includes('.') ? symbol : `${symbol}.NS`;
      const url = `https://${RAPID_HOST}/stock/v2/get-summary?symbol=${sym}&region=IN`;
      https.get(url, { headers }, (apiRes) => {
        let data = '';
        apiRes.on('data', c => data += c);
        apiRes.on('end', () => {
          const d = JSON.parse(data);
          if (!d.price) return res.status(404).json({ error: 'N/A' });
          res.status(200).json({
            symbol: d.symbol,
            name: d.price.longName || d.symbol,
            price: d.price.regularMarketPrice?.raw || 0,
            changePct: d.price.regularMarketChangePercent?.raw * 100 || 0,
            high52: d.summaryDetail?.fiftyTwoWeekHigh?.raw || 0,
            pe: d.summaryDetail?.trailingPE?.raw || 0
          });
        });
      });
    }
  } catch (e) { res.status(500).json({ error: 'error' }); }
};
