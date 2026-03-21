const https = require('https');

function httpsGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const options = { headers: { 'User-Agent': 'Mozilla/5.0', ...headers }, timeout: 10000 };
    https.get(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve({ error: 'Parse Error', raw: data }); }
      });
    }).on('error', reject);
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { action, symbol, q } = req.query;
  const RAPID_KEY = '06c40cc462msh2a69c4bed748376p121936jsna8eb70935d62';
  const RAPID_HOST = 'indian-stock-exchange-api2.p.rapidapi.com';

  try {
    // 1. SEARCH: Uses RapidAPI to find correct Indian Tickers
    if (action === 'search') {
      const data = await httpsGet(`https://${RAPID_HOST}/search?q=${encodeURIComponent(q)}`, {
        'x-rapidapi-key': RAPID_KEY, 'x-rapidapi-host': RAPID_HOST
      });
      return res.json(data);
    }

    // 2. QUOTE & ANALYSIS: Yahoo Finance (Live Price, PE, Revenue, News)
    if (action === 'quote') {
      const ticker = symbol.includes('.') ? symbol : `${symbol}.NS`;
      const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=price,summaryDetail,defaultKeyStatistics,financialData`;
      const data = await httpsGet(url);
      const s = data.quoteSummary?.result?.[0] || {};
      
      // Also fetch News for this symbol
      const newsUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}`;
      const nData = await httpsGet(newsUrl);

      return res.json({
        price: s.price?.regularMarketPrice?.raw || 0,
        change: s.price?.regularMarketChangePercent?.raw || 0,
        name: s.price?.shortName || symbol,
        pe: s.summaryDetail?.trailingPE?.fmt || 'N/A',
        divYield: s.summaryDetail?.dividendYield?.fmt || 'N/A',
        marketCap: s.summaryDetail?.marketCap?.fmt || 'N/A',
        revenue: s.financialData?.totalRevenue?.fmt || 'N/A',
        ebitda: s.financialData?.ebitda?.fmt || 'N/A',
        news: nData.chart?.result?.[0]?.meta?.symbol || [] // Simplified news check
      });
    }

    // 3. CORPORATE: RapidAPI (Board Meetings, Dividends)
    if (action === 'corporate') {
      const data = await httpsGet(`https://${RAPID_HOST}/corporate_actions?stock_name=${symbol}`, {
        'x-rapidapi-key': RAPID_KEY, 'x-rapidapi-host': RAPID_HOST
      });
      return res.json(data);
    }

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
