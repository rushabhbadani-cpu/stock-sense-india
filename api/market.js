// StockSense India — Market Proxy v6.0 (Vercel Serverless)
// Uses built-in fetch (Node 18+) — no require() needed at all
// Place this file at: /api/market.js

async function yahooFetch(symbol, range = '1d', interval = '1d') {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) return null;
  return res.json();
}

async function getQuote(symbol) {
  const variants = [`${symbol}.NS`, `${symbol}.BO`, symbol];
  for (const sym of variants) {
    try {
      const data = await yahooFetch(sym);
      if (data?.chart?.result?.[0]) {
        const m = data.chart.result[0].meta;
        const price = m.regularMarketPrice || m.previousClose || 0;
        const prev  = m.previousClose || price;
        if (price > 0) return {
          symbol, price:      +price.toFixed(2),
          change:             +(price - prev).toFixed(2),
          changePct:          +((price - prev) / prev * 100).toFixed(2),
          open:               +(m.regularMarketOpen     || price).toFixed(2),
          high:               +(m.regularMarketDayHigh  || price).toFixed(2),
          low:                +(m.regularMarketDayLow   || price).toFixed(2),
          prevClose:          +prev.toFixed(2),
          volume:             m.regularMarketVolume || 0,
          w52High:            +(m.fiftyTwoWeekHigh  || price).toFixed(2),
          w52Low:             +(m.fiftyTwoWeekLow   || 0).toFixed(2),
          pe:                 +(m.trailingPE        || 0).toFixed(2),
          marketCap:          m.marketCap  || 0,
          longName:           m.longName   || m.shortName || symbol,
          currency:           m.currency   || 'INR',
          exchangeName:       m.exchangeName || 'NSE',
          source: sym, live: true,
        };
      }
    } catch { /* try next variant */ }
  }
  return null;
}

async function getHistory(symbol, range, interval) {
  const variants = [`${symbol}.NS`, `${symbol}.BO`, symbol];
  for (const sym of variants) {
    try {
      const data = await yahooFetch(sym, range, interval);
      if (data?.chart?.result?.[0]) {
        const r  = data.chart.result[0];
        const ts = r.timestamp || [];
        const cl = r.indicators?.quote?.[0]?.close || [];
        const prices = ts
          .map((t, i) => ({ date: new Date(t * 1000).toISOString().split('T')[0], close: cl[i] ? +cl[i].toFixed(2) : null }))
          .filter(p => p.close !== null);
        if (prices.length) return { prices, live: true, symbol: sym };
      }
    } catch { /* try next variant */ }
  }
  return { prices: [], live: false };
}

async function getIndices() {
  const INDEX_MAP = {
    '^NSEI':       'NIFTY 50',
    '^BSESN':      'SENSEX',
    '^NSEBANK':    'NIFTY BANK',
    '^CNXIT':      'NIFTY IT',
    '^CNXPHARMA':  'NIFTY PHARMA',
    '^CNXAUTO':    'NIFTY AUTO',
    '^CNXFMCG':    'NIFTY FMCG',
    '^INDIAVIX':   'INDIA VIX',
  };
  const results = await Promise.all(
    Object.entries(INDEX_MAP).map(async ([sym, name]) => {
      try {
        const data = await yahooFetch(sym);
        if (data?.chart?.result?.[0]) {
          const m     = data.chart.result[0].meta;
          const price = m.regularMarketPrice || 0;
          const prev  = m.previousClose      || price;
          if (price > 0) return {
            name, symbol: sym,
            value:     +price.toFixed(2),
            change:    +(price - prev).toFixed(2),
            changePct: +((price - prev) / prev * 100).toFixed(2),
            prevClose: +prev.toFixed(2),
          };
        }
      } catch {}
      return null;
    })
  );
  const indices = results.filter(Boolean);
  return { indices, live: indices.length > 0 };
}

async function getCommodities() {
  const COMM = [
    { sym:'GC=F',  label:'Gold',       icon:'🥇', unit:'USD/oz',    impact:'Safe haven — rises in uncertainty' },
    { sym:'SI=F',  label:'Silver',     icon:'🥈', unit:'USD/oz',    impact:'Industrial + safe haven demand' },
    { sym:'CL=F',  label:'Crude Oil',  icon:'🛢️', unit:'USD/bbl',   impact:'Rising oil = bad for aviation & paints' },
    { sym:'NG=F',  label:'Nat Gas',    icon:'🔥', unit:'USD/MMBtu', impact:'Affects power sector & fertiliser margins' },
    { sym:'HG=F',  label:'Copper',     icon:'🔶', unit:'USD/lb',    impact:'Economic barometer — rises with growth' },
    { sym:'ALI=F', label:'Aluminium',  icon:'🔩', unit:'USD/MT',    impact:'Auto & packaging sector input cost' },
    { sym:'ZC=F',  label:'Corn',       icon:'🌽', unit:'USc/bu',    impact:'Agri input — affects FMCG costs' },
    { sym:'ZW=F',  label:'Wheat',      icon:'🌾', unit:'USc/bu',    impact:'Food inflation indicator' },
    { sym:'ZS=F',  label:'Soybean',    icon:'🫘', unit:'USc/bu',    impact:'Edible oil prices — FMCG impact' },
    { sym:'CT=F',  label:'Cotton',     icon:'☁️', unit:'USc/lb',    impact:'Textile sector input cost' },
  ];
  const results = await Promise.all(
    COMM.map(async (c) => {
      try {
        const data = await yahooFetch(c.sym);
        if (data?.chart?.result?.[0]) {
          const m     = data.chart.result[0].meta;
          const price = m.regularMarketPrice || 0;
          const prev  = m.previousClose      || price;
          if (price > 0) return { ...c, price: +price.toFixed(2), changePct: +((price - prev) / prev * 100).toFixed(2) };
        }
      } catch {}
      return null;
    })
  );
  const commodities = results.filter(Boolean);
  return { commodities, live: commodities.length > 0 };
}

async function getForex() {
  const PAIRS = [
    { sym:'INR=X',    label:'USD/INR', flag:'🇺🇸', sub:'US Dollar',         impact:'IT exports gain when rupee weakens' },
    { sym:'AEDINR=X', label:'AED/INR', flag:'🇦🇪', sub:'UAE Dirham',         impact:'Key for Indian expat remittances' },
    { sym:'EURINR=X', label:'EUR/INR', flag:'🇪🇺', sub:'Euro',               impact:'European export competitiveness' },
    { sym:'GBPINR=X', label:'GBP/INR', flag:'🇬🇧', sub:'British Pound',      impact:'UK trade and IT services' },
    { sym:'JPYINR=X', label:'JPY/INR', flag:'🇯🇵', sub:'Japanese Yen',       impact:'Japanese FDI indicator' },
    { sym:'CNHINR=X', label:'CNH/INR', flag:'🇨🇳', sub:'Chinese Yuan',       impact:'Trade competition with China' },
    { sym:'SARINR=X', label:'SAR/INR', flag:'🇸🇦', sub:'Saudi Riyal',        impact:'Oil prices & Gulf remittances' },
    { sym:'SGDINR=X', label:'SGD/INR', flag:'🇸🇬', sub:'Singapore Dollar',   impact:'ASEAN investment flows' },
  ];
  const results = await Promise.all(
    PAIRS.map(async (p) => {
      try {
        const data = await yahooFetch(p.sym);
        if (data?.chart?.result?.[0]) {
          const m    = data.chart.result[0].meta;
          const rate = m.regularMarketPrice || 0;
          const prev = m.previousClose      || rate;
          if (rate > 0) return { ...p, rate: +rate.toFixed(4), changePct: +((rate - prev) / prev * 100).toFixed(2) };
        }
      } catch {}
      return null;
    })
  );
  const forex = results.filter(Boolean);
  return { forex, live: forex.length > 0 };
}

async function getNews(q) {
  try {
    const query = encodeURIComponent(q || 'India stock market NSE Nifty Sensex');
    const url   = `https://news.google.com/rss/search?q=${query}+when:1d&hl=en-IN&gl=IN&ceid=IN:en`;
    const res   = await fetch(url, {
      headers: { 'Accept': 'application/rss+xml, text/xml' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { news: [], live: false };
    const body = await res.text();
    const items = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;
    while ((match = itemRegex.exec(body)) !== null && items.length < 25) {
      const c = match[1];
      const title  = (c.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || c.match(/<title>(.*?)<\/title>/))?.[1] || '';
      const source = c.match(/<source[^>]*>(.*?)<\/source>/)?.[1] || 'News';
      const pubDate= c.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || '';
      if (title) {
        const tl = title.toLowerCase();
        const sentiment =
          tl.match(/fall|drop|crash|loss|decline|plunge|slump/) ? 'negative' :
          tl.match(/rise|gain|surge|rally|profit|jump|soar/)    ? 'positive' : 'neutral';
        const hrs     = Math.round((Date.now() - new Date(pubDate)) / 3600000);
        const timeAgo = isNaN(hrs) ? 'Recently' : hrs < 1 ? 'Just now' : hrs < 24 ? `${hrs}h ago` : `${Math.round(hrs/24)}d ago`;
        items.push({
          title: title.replace(/ - [^-]+$/, '').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').trim().slice(0, 130),
          source, sentiment, timeAgo,
        });
      }
    }
    return { news: items, live: items.length > 0 };
  } catch (e) {
    return { news: [], live: false, error: e.message };
  }
}

// ── VERCEL EXPORT ─────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Content-Type',   'application/json');
  res.setHeader('Cache-Control',  'no-cache, no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const p      = req.query || {};
  const action = p.action  || 'quote';

  try {
    let result;
    if      (action === 'quote')       result = (await getQuote(p.symbol || 'TCS')) || { live:false, error:'No data', symbol:p.symbol };
    else if (action === 'history')     result = await getHistory(p.symbol || 'TCS', p.range || '1y', p.interval || '1wk');
    else if (action === 'indices')     result = await getIndices();
    else if (action === 'commodities') result = await getCommodities();
    else if (action === 'forex')       result = await getForex();
    else if (action === 'news')        result = await getNews(p.q);
    else                               result = { error: 'Unknown action. Valid: quote, history, indices, commodities, forex, news' };
    return res.status(200).json(result);
  } catch (e) {
    return res.status(200).json({ live:false, error: e.message });
  }
}
