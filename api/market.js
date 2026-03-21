// StockSense India — Market Proxy v4.1 (Vercel format)
const https = require('https');

function httpsGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const opts = new URL(url);
    const options = {
      hostname: opts.hostname,
      path: opts.pathname + opts.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'application/json, text/plain, */*',
        ...headers
      },
      timeout: 8000
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
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

async function getQuote(symbol) {
  const syms = [`${symbol}.NS`, `${symbol}.BO`, symbol];
  for (const s of syms) {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s)}?interval=1d&range=1d`;
      const r = await httpsGet(url);
      if (r.status === 200 && r.body?.chart?.result) {
        const m = r.body.chart.result[0].meta;
        const price = m.regularMarketPrice || m.previousClose || 0;
        const prev = m.previousClose || price;
        if (price > 0) return {
          symbol, price: parseFloat(price.toFixed(2)),
          change: parseFloat((price - prev).toFixed(2)),
          changePct: parseFloat(((price - prev) / prev * 100).toFixed(2)),
          open: parseFloat((m.regularMarketOpen || price).toFixed(2)),
          high: parseFloat((m.regularMarketDayHigh || price).toFixed(2)),
          low: parseFloat((m.regularMarketDayLow || price).toFixed(2)),
          prevClose: parseFloat(prev.toFixed(2)),
          volume: m.regularMarketVolume || 0,
          w52High: parseFloat((m.fiftyTwoWeekHigh || price).toFixed(2)),
          w52Low: parseFloat((m.fiftyTwoWeekLow || 0).toFixed(2)),
          pe: parseFloat((m.trailingPE || 0).toFixed(2)),
          marketCap: m.marketCap || 0,
          longName: m.longName || m.shortName || symbol,
          live: true
        };
      }
    } catch {}
  }
  return null;
}

async function getHistory(symbol, range, interval) {
  const syms = [`${symbol}.NS`, `${symbol}.BO`, symbol];
  for (const s of syms) {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s)}?interval=${interval}&range=${range}`;
      const r = await httpsGet(url);
      if (r.status === 200 && r.body?.chart?.result) {
        const res = r.body.chart.result[0];
        const timestamps = res.timestamp || [];
        const closes = res.indicators?.quote?.[0]?.close || [];
        const prices = timestamps.map((ts, i) => ({
          date: new Date(ts * 1000).toISOString().split('T')[0],
          close: closes[i] ? parseFloat(closes[i].toFixed(2)) : null
        })).filter(p => p.close !== null);
        if (prices.length > 0) return { prices, live: true };
      }
    } catch {}
  }
  return null;
}

async function getIndices() {
  const INDEX_MAP = {
    '^NSEI': 'NIFTY 50', '^BSESN': 'SENSEX', '^NSEBANK': 'NIFTY BANK',
    '^CNXIT': 'NIFTY IT', '^CNXPHARMA': 'NIFTY PHARMA',
    '^CNXAUTO': 'NIFTY AUTO', '^CNXFMCG': 'NIFTY FMCG', '^INDIAVIX': 'INDIA VIX'
  };
  const results = [];
  for (const [sym, name] of Object.entries(INDEX_MAP)) {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=1d`;
      const r = await httpsGet(url);
      if (r.status === 200 && r.body?.chart?.result) {
        const m = r.body.chart.result[0].meta;
        const price = m.regularMarketPrice || 0;
        const prev = m.previousClose || price;
        if (price > 0) results.push({
          name, symbol: sym,
          value: parseFloat(price.toFixed(2)),
          change: parseFloat((price - prev).toFixed(2)),
          changePct: parseFloat(((price - prev) / prev * 100).toFixed(2)),
          prevClose: parseFloat(prev.toFixed(2))
        });
      }
    } catch {}
  }
  return { indices: results, live: results.length > 0 };
}

async function getCommodities() {
  const COMM = [
    { sym: 'GC=F',  label: 'Gold',        icon: '🥇', unit: 'USD/oz',   impact: 'Safe haven — rises in uncertainty' },
    { sym: 'SI=F',  label: 'Silver',       icon: '🥈', unit: 'USD/oz',   impact: 'Industrial + safe haven demand' },
    { sym: 'CL=F',  label: 'Crude Oil',    icon: '🛢️', unit: 'USD/bbl',  impact: 'High = bad for aviation, paints, OMCs' },
    { sym: 'NG=F',  label: 'Natural Gas',  icon: '🔥', unit: 'USD/MMBtu',impact: 'Affects power sector margins' },
    { sym: 'HG=F',  label: 'Copper',       icon: '🔶', unit: 'USD/lb',   impact: 'Economic barometer — rises with growth' },
    { sym: 'ALI=F', label: 'Aluminium',    icon: '🔩', unit: 'USD/MT',   impact: 'Auto and packaging sector input' },
    { sym: 'ZC=F',  label: 'Corn',         icon: '🌽', unit: 'USc/bu',   impact: 'Agri commodity — FMCG input cost' },
    { sym: 'ZW=F',  label: 'Wheat',        icon: '🌾', unit: 'USc/bu',   impact: 'Food inflation indicator' },
    { sym: 'ZS=F',  label: 'Soybean',      icon: '🫘', unit: 'USc/bu',   impact: 'Edible oil prices — FMCG impact' },
    { sym: 'CT=F',  label: 'Cotton',       icon: '☁️', unit: 'USc/lb',   impact: 'Textile sector input cost' },
  ];
  const results = [];
  for (const c of COMM) {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(c.sym)}?interval=1d&range=1d`;
      const r = await httpsGet(url);
      if (r.status === 200 && r.body?.chart?.result) {
        const m = r.body.chart.result[0].meta;
        const price = m.regularMarketPrice || 0;
        const prev = m.previousClose || price;
        if (price > 0) results.push({
          ...c, price: parseFloat(price.toFixed(2)),
          changePct: parseFloat(((price - prev) / prev * 100).toFixed(2))
        });
      }
    } catch {}
  }
  return { commodities: results, live: results.length > 0 };
}

async function getForex() {
  const PAIRS = [
    { sym: 'INR=X',    label: 'USD/INR', flag: '🇺🇸', sub: 'US Dollar',       impact: 'IT exports gain when rupee weakens' },
    { sym: 'AEDINR=X', label: 'AED/INR', flag: '🇦🇪', sub: 'UAE Dirham',      impact: 'Key for Indian expat remittances' },
    { sym: 'EURINR=X', label: 'EUR/INR', flag: '🇪🇺', sub: 'Euro',            impact: 'European export competitiveness' },
    { sym: 'GBPINR=X', label: 'GBP/INR', flag: '🇬🇧', sub: 'British Pound',   impact: 'UK trade and IT services' },
    { sym: 'JPYINR=X', label: 'JPY/INR', flag: '🇯🇵', sub: 'Japanese Yen',    impact: 'Japanese FDI indicator' },
    { sym: 'CNHINR=X', label: 'CNH/INR', flag: '🇨🇳', sub: 'Chinese Yuan',    impact: 'Trade competition with China' },
    { sym: 'SARINR=X', label: 'SAR/INR', flag: '🇸🇦', sub: 'Saudi Riyal',     impact: 'Oil prices and Gulf remittances' },
    { sym: 'SGDINR=X', label: 'SGD/INR', flag: '🇸🇬', sub: 'Singapore Dollar',impact: 'ASEAN investment flows' },
  ];
  const results = [];
  for (const p of PAIRS) {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(p.sym)}?interval=1d&range=1d`;
      const r = await httpsGet(url);
      if (r.status === 200 && r.body?.chart?.result) {
        const m = r.body.chart.result[0].meta;
        const rate = m.regularMarketPrice || 0;
        const prev = m.previousClose || rate;
        if (rate > 0) results.push({
          ...p, rate: parseFloat(rate.toFixed(4)),
          changePct: parseFloat(((rate - prev) / prev * 100).toFixed(2))
        });
      }
    } catch {}
  }
  return { forex: results, live: results.length > 0 };
}

async function getNews(q) {
  try {
    const query = encodeURIComponent(q || 'India stock market NSE Nifty Sensex');
    const url = `https://news.google.com/rss/search?q=${query}+when:1d&hl=en-IN&gl=IN&ceid=IN:en`;
    const r = await httpsGet(url, { 'Accept': 'application/rss+xml, text/xml' });
    if (r.status === 200 && typeof r.body === 'string') {
      const items = [];
      const itemRegex = /<item>([\s\S]*?)<\/item>/g;
      let match;
      while ((match = itemRegex.exec(r.body)) !== null && items.length < 20) {
        const content = match[1];
        const title = (content.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || content.match(/<title>(.*?)<\/title>/))?.[1] || '';
        const source = content.match(/<source[^>]*>(.*?)<\/source>/)?.[1] || 'News';
        const pubDate = content.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || '';
        if (title) {
          const tl = title.toLowerCase();
          const sentiment = tl.includes('fall')||tl.includes('drop')||tl.includes('crash')||tl.includes('loss')||tl.includes('decline') ? 'negative'
            : tl.includes('rise')||tl.includes('gain')||tl.includes('surge')||tl.includes('rally')||tl.includes('profit') ? 'positive' : 'neutral';
          const d = new Date(pubDate);
          const hrs = Math.round((new Date() - d) / 3600000);
          const timeAgo = hrs < 1 ? 'Just now' : hrs < 24 ? `${hrs}h ago` : `${Math.round(hrs/24)}d ago`;
          items.push({ title: title.replace(/ - [^-]+$/, '').trim().slice(0, 120), source, sentiment, timeAgo });
        }
      }
      return { news: items, live: items.length > 0 };
    }
  } catch {}
  return { news: [], live: false };
}

// ── VERCEL HANDLER FORMAT ─────────────────────────────────────────
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-cache');

  const p = req.query || {};
  const action = p.action || 'quote';

  try {
    let result;
    if (action === 'quote') {
      const q = await getQuote(p.symbol || 'TCS');
      result = q || { live: false, error: 'No data', symbol: p.symbol };
    } else if (action === 'history') {
      result = await getHistory(p.symbol || 'TCS', p.range || '1y', p.interval || '1wk') || { live: false, prices: [] };
    } else if (action === 'indices') {
      result = await getIndices();
    } else if (action === 'commodities') {
      result = await getCommodities();
    } else if (action === 'forex') {
      result = await getForex();
    } else if (action === 'news') {
      result = await getNews(p.q);
    } else {
      result = { error: 'Unknown action' };
    }
    res.status(200).json(result);
  } catch (e) {
    res.status(200).json({ live: false, error: e.message });
  }
};
