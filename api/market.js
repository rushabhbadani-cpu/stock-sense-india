const https = require('https');

function fetchJson(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const options = { headers: { 'User-Agent': 'Mozilla/5.0', ...headers }, timeout: 8000 };
    https.get(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve({}); } });
    }).on('error', reject);
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { action, symbol, q } = req.query;
  const RAPID_KEY = '06c40cc462msh2a69c4bed748376p121936jsna8eb70935d62';
  const RAPID_HOST = 'indian-stock-exchange-api2.p.rapidapi.com';

  try {
    // 1. SEARCH & SYMBOL MAPPING
    if (action === 'search') {
      const data = await fetchJson(`https://${RAPID_HOST}/search?q=${encodeURIComponent(q)}`, {
        'x-rapidapi-key': RAPID_KEY, 'x-rapidapi-host': RAPID_HOST
      });
      return res.json(data);
    }

    // 2. LIVE PRICE & ANALYSIS (Yahoo Finance Open Source)
    if (action === 'quote') {
      const ticker = symbol.includes('.') ? symbol : `${symbol}.NS`;
      const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=price,summaryDetail,defaultKeyStatistics,financialData`;
      const data = await fetchJson(url);
      const s = data.quoteSummary?.result?.[0] || {};
      
      return res.json({
        price: s.price?.regularMarketPrice?.raw,
        change: s.price?.regularMarketChangePercent?.raw,
        name: s.price?.shortName,
        pe: s.summaryDetail?.trailingPE?.fmt || 'N/A',
        yield: s.summaryDetail?.dividendYield?.fmt || 'N/A',
        marketCap: s.summaryDetail?.marketCap?.fmt || 'N/A',
        revenue: s.financialData?.totalRevenue?.fmt || 'N/A',
        profit: s.financialData?.grossProfits?.fmt || 'N/A'
      });
    }

    // 3. CORPORATE LEDGER (RapidAPI)
    if (action === 'corporate') {
      const data = await fetchJson(`https://${RAPID_HOST}/corporate_actions?stock_name=${symbol}`, {
        'x-rapidapi-key': RAPID_KEY, 'x-rapidapi-host': RAPID_HOST
      });
      return res.json(data);
    }

    // 4. NEWS
    if (action === 'news') {
      const data = await fetchJson(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}.NS`);
      // Yahoo news usually comes from a separate RSS/API, for now we return a stub or use symbol news
      return res.json({ news: [] });
    }

  } catch (err) { res.status(500).json({ error: err.message }); }
};
