// StockSense India — Market Proxy v11.0
// Key change: batch quote action fetches multiple symbols in one serverless call
// This means ONE session fetch + parallel data fetches instead of N×session fetches
// Place at: /api/market.js

// ── YAHOO SESSION ─────────────────────────────────────────────────
async function getSession() {
  try {
    const r1 = await fetch('https://fc.yahoo.com', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(6000),
      redirect: 'follow',
    });
    const rawCookie = r1.headers.get('set-cookie') || '';
    const cookie = rawCookie.split(',').map(c => c.trim().split(';')[0]).filter(c => c.includes('=')).join('; ');
    const r2 = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Cookie': cookie,
      },
      signal: AbortSignal.timeout(6000),
    });
    const crumb = (await r2.text()).trim();
    if (!crumb || crumb.includes('<') || crumb.length < 3) return null;
    console.log(`Session OK crumb=${crumb.substring(0, 8)}`);
    return { cookie, crumb };
  } catch (e) {
    console.error('getSession:', e.message);
    return null;
  }
}

// ── YAHOO FETCH — always 5d/1d for real daily % change ───────────
async function yahooFetch(sym, session, range = '5d', interval = '1d') {
  const crumbParam = session?.crumb ? `&crumb=${encodeURIComponent(session.crumb)}` : '';
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=${interval}&range=${range}${crumbParam}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/json',
      'Cookie': session?.cookie || '',
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) { console.error(`Yahoo ${sym} HTTP ${res.status}`); return null; }
  const json = await res.json();
  if (json?.chart?.error?.code === 'Unauthorized') { console.error(`Yahoo ${sym} Unauthorized`); return null; }
  return json;
}

// ── EXTRACT QUOTE from 5d data (price + real daily change) ────────
function extractQuote(data, symbol) {
  const result = data?.chart?.result?.[0];
  if (!result) return null;
  const m     = result.meta;
  // Price: prefer regularMarketPrice, fall back to previousClose, then last close in array
  const closes = (result.indicators?.quote?.[0]?.close || []).filter(c => c != null && c > 0);
  const price  = m.regularMarketPrice > 0 ? m.regularMarketPrice
               : m.previousClose      > 0 ? m.previousClose
               : closes.length > 0        ? closes[closes.length - 1]
               : 0;
  if (price <= 0) return null;
  // Real daily change from last two valid closes
  const prev = closes.length >= 2 ? closes[closes.length - 2]
             : m.previousClose > 0 ? m.previousClose
             : price;
  return {
    symbol,
    price:     +price.toFixed(2),
    change:    +(price - prev).toFixed(2),
    changePct: prev > 0 ? +((price - prev) / prev * 100).toFixed(2) : 0,
    open:      +(m.regularMarketOpen    || price).toFixed(2),
    high:      +(m.regularMarketDayHigh || price).toFixed(2),
    low:       +(m.regularMarketDayLow  || price).toFixed(2),
    prevClose: +prev.toFixed(2),
    volume:    m.regularMarketVolume || 0,
    w52High:   +(m.fiftyTwoWeekHigh  || price).toFixed(2),
    w52Low:    +(m.fiftyTwoWeekLow   || 0).toFixed(2),
    pe:        +(m.trailingPE        || 0).toFixed(2),
    marketCap: m.marketCap || 0,
    longName:  m.longName  || m.shortName || symbol,
    currency:  m.currency  || 'INR',
    live: true,
  };
}

// ── SINGLE QUOTE ──────────────────────────────────────────────────
async function getQuote(symbol, session) {
  for (const sym of [`${symbol}.NS`, `${symbol}.BO`, symbol]) {
    try {
      const data   = await yahooFetch(sym, session);
      const result = extractQuote(data, symbol);
      if (result) {
        console.log(`Quote ${sym}: ₹${result.price} ${result.changePct >= 0 ? '+' : ''}${result.changePct}%`);
        return { ...result, source: sym };
      }
    } catch (e) { console.error(`Quote ${sym}:`, e.message); }
  }
  return null;
}

// ── BATCH QUOTES — all symbols in ONE serverless call ─────────────
// Frontend sends symbols as comma-separated string: ?action=batch&symbols=TCS,INFY,HDFCBANK
async function getBatchQuotes(symbolsStr, session) {
  const symbols = symbolsStr.split(',').map(s => s.trim().toUpperCase()).filter(Boolean).slice(0, 25);
  console.log(`Batch: fetching ${symbols.length} symbols in parallel`);

  // Fetch all in parallel — session already established, so this is fast
  const results = await Promise.allSettled(
    symbols.map(async (symbol) => {
      for (const sym of [`${symbol}.NS`, `${symbol}.BO`, symbol]) {
        try {
          const data   = await yahooFetch(sym, session);
          const result = extractQuote(data, symbol);
          if (result) return { ...result, source: sym };
        } catch {}
      }
      return null;
    })
  );

  const quotes = {};
  results.forEach((r, i) => {
    const q = r.status === 'fulfilled' ? r.value : null;
    if (q) {
      quotes[symbols[i]] = q;
      console.log(`  ${symbols[i]}: ₹${q.price} ${q.changePct >= 0 ? '+' : ''}${q.changePct}%`);
    } else {
      console.warn(`  ${symbols[i]}: no data`);
    }
  });

  const loaded = Object.keys(quotes).length;
  console.log(`Batch complete: ${loaded}/${symbols.length} loaded`);
  return { quotes, loaded, total: symbols.length, live: loaded > 0 };
}

// ── HISTORY ───────────────────────────────────────────────────────
async function getHistory(symbol, range, interval, session) {
  for (const sym of [`${symbol}.NS`, `${symbol}.BO`, symbol]) {
    try {
      const data = await yahooFetch(sym, session, range, interval);
      const r    = data?.chart?.result?.[0];
      if (!r) continue;
      const ts  = r.timestamp || [];
      const cl  = r.indicators?.quote?.[0]?.close || [];
      const prices = ts
        .map((t, i) => ({ date: new Date(t * 1000).toISOString().split('T')[0], close: cl[i] ? +cl[i].toFixed(2) : null }))
        .filter(p => p.close !== null);
      if (prices.length) return { prices, live: true, symbol: sym };
    } catch (e) { console.error(`History ${sym}:`, e.message); }
  }
  return { prices: [], live: false };
}

// ── INDICES ───────────────────────────────────────────────────────
async function getIndices(session) {
  const MAP = {
    '^NSEI':'NIFTY 50', '^BSESN':'SENSEX', '^NSEBANK':'NIFTY BANK',
    '^CNXIT':'NIFTY IT', '^CNXPHARMA':'NIFTY PHARMA',
    '^CNXAUTO':'NIFTY AUTO', '^CNXFMCG':'NIFTY FMCG', '^INDIAVIX':'INDIA VIX',
  };
  const results = await Promise.all(
    Object.entries(MAP).map(async ([sym, name]) => {
      try {
        const data   = await yahooFetch(sym, session);
        const result = data?.chart?.result?.[0];
        if (!result) return null;
        const m      = result.meta;
        const price  = m.regularMarketPrice || 0;
        if (price <= 0) return null;
        const closes = (result.indicators?.quote?.[0]?.close || []).filter(c => c != null && c > 0);
        const prev   = closes.length >= 2 ? closes[closes.length - 2] : (m.previousClose || price);
        return { name, symbol: sym, value: +price.toFixed(2), change: +(price-prev).toFixed(2), changePct: +((price-prev)/prev*100).toFixed(2), prevClose: +prev.toFixed(2) };
      } catch (e) { console.error(`Index ${sym}:`, e.message); return null; }
    })
  );
  const indices = results.filter(Boolean);
  console.log(`Indices: ${indices.length}/8 loaded`);
  return { indices, live: indices.length > 0 };
}

// ── COMMODITIES ───────────────────────────────────────────────────
async function getCommodities(session) {
  const COMM = [
    { sym:'GC=F',  label:'Gold',      icon:'🥇', unit:'USD/oz',    impact:'Safe haven — rises in uncertainty' },
    { sym:'SI=F',  label:'Silver',    icon:'🥈', unit:'USD/oz',    impact:'Industrial + safe haven demand' },
    { sym:'CL=F',  label:'Crude Oil', icon:'🛢️', unit:'USD/bbl',   impact:'Rising oil hurts aviation & paints' },
    { sym:'NG=F',  label:'Nat Gas',   icon:'🔥', unit:'USD/MMBtu', impact:'Affects power & fertiliser margins' },
    { sym:'HG=F',  label:'Copper',    icon:'🔶', unit:'USD/lb',    impact:'Economic barometer — rises with growth' },
    { sym:'ALI=F', label:'Aluminium', icon:'🔩', unit:'USD/MT',    impact:'Auto & packaging sector input' },
    { sym:'ZC=F',  label:'Corn',      icon:'🌽', unit:'USc/bu',    impact:'Agri input — affects FMCG costs' },
    { sym:'ZW=F',  label:'Wheat',     icon:'🌾', unit:'USc/bu',    impact:'Food inflation indicator' },
    { sym:'ZS=F',  label:'Soybean',   icon:'🫘', unit:'USc/bu',    impact:'Edible oil prices — FMCG impact' },
    { sym:'CT=F',  label:'Cotton',    icon:'☁️', unit:'USc/lb',    impact:'Textile sector input cost' },
  ];
  const results = await Promise.all(
    COMM.map(async (c) => {
      try {
        const data   = await yahooFetch(c.sym, session);
        const result = data?.chart?.result?.[0];
        if (!result) return null;
        const price  = result.meta?.regularMarketPrice || 0;
        if (price <= 0) return null;
        const closes = (result.indicators?.quote?.[0]?.close || []).filter(v => v != null && v > 0);
        const prev   = closes.length >= 2 ? closes[closes.length - 2] : (result.meta?.previousClose || price);
        return { ...c, price: +price.toFixed(2), changePct: +((price-prev)/prev*100).toFixed(2) };
      } catch (e) { console.error(`Commodity ${c.sym}:`, e.message); return null; }
    })
  );
  const commodities = results.filter(Boolean);
  console.log(`Commodities: ${commodities.length}/10 loaded`);
  return { commodities, live: commodities.length > 0 };
}

// ── FOREX ─────────────────────────────────────────────────────────
async function getForex(session) {
  const PAIRS = [
    { sym:'INR=X',    label:'USD/INR', flag:'🇺🇸', sub:'US Dollar',       impact:'IT exports gain when rupee weakens' },
    { sym:'AEDINR=X', label:'AED/INR', flag:'🇦🇪', sub:'UAE Dirham',       impact:'Key for Indian expat remittances' },
    { sym:'EURINR=X', label:'EUR/INR', flag:'🇪🇺', sub:'Euro',             impact:'European export competitiveness' },
    { sym:'GBPINR=X', label:'GBP/INR', flag:'🇬🇧', sub:'British Pound',    impact:'UK trade and IT services' },
    { sym:'JPYINR=X', label:'JPY/INR', flag:'🇯🇵', sub:'Japanese Yen',     impact:'Japanese FDI indicator' },
    { sym:'CNHINR=X', label:'CNH/INR', flag:'🇨🇳', sub:'Chinese Yuan',     impact:'Trade competition with China' },
    { sym:'SARINR=X', label:'SAR/INR', flag:'🇸🇦', sub:'Saudi Riyal',      impact:'Oil & Gulf remittances' },
    { sym:'SGDINR=X', label:'SGD/INR', flag:'🇸🇬', sub:'Singapore Dollar', impact:'ASEAN investment flows' },
  ];
  const results = await Promise.all(
    PAIRS.map(async (p) => {
      try {
        const data   = await yahooFetch(p.sym, session);
        const result = data?.chart?.result?.[0];
        if (!result) return null;
        const rate   = result.meta?.regularMarketPrice || 0;
        if (rate <= 0) return null;
        const closes = (result.indicators?.quote?.[0]?.close || []).filter(v => v != null && v > 0);
        const prev   = closes.length >= 2 ? closes[closes.length - 2] : (result.meta?.previousClose || rate);
        return { ...p, rate: +rate.toFixed(4), changePct: +((rate-prev)/prev*100).toFixed(2) };
      } catch (e) { console.error(`Forex ${p.sym}:`, e.message); return null; }
    })
  );
  const forex = results.filter(Boolean);
  console.log(`Forex: ${forex.length}/8 loaded`);
  return { forex, live: forex.length > 0 };
}

// ── NEWS ──────────────────────────────────────────────────────────
async function getNews(q) {
  try {
    // Use broader query and 3d window (catches weekends + more global news)
    const baseQuery = q || 'India stock market NSE Nifty Sensex economy RBI';
    const globalExtra = q ? '' : ' OR "global markets" OR "Fed rate" OR "crude oil" OR "US economy" OR war geopolitical';
    const query = encodeURIComponent(baseQuery + globalExtra);
    const res   = await fetch(`https://news.google.com/rss/search?q=${query}+when:3d&hl=en-IN&gl=IN&ceid=IN:en`, {
      headers: { 'Accept': 'application/rss+xml, text/xml' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { news: [], live: false };
    const body  = await res.text();
    const items = [];
    const re    = /<item>([\s\S]*?)<\/item>/g;
    let m;
    while ((m = re.exec(body)) !== null && items.length < 25) {
      const c     = m[1];
      const title = (c.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || c.match(/<title>(.*?)<\/title>/))?.[1] || '';
      const src   = c.match(/<source[^>]*>(.*?)<\/source>/)?.[1] || 'News';
      const pub   = c.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || '';
      if (title) {
        const tl  = title.toLowerCase();
        const sentiment = tl.match(/fall|drop|crash|loss|decline|plunge|slump/) ? 'negative'
          : tl.match(/rise|gain|surge|rally|profit|jump|soar/) ? 'positive' : 'neutral';
        const hrs = Math.round((Date.now() - new Date(pub)) / 3600000);
        items.push({
          title: title.replace(/ - [^-]+$/, '').replace(/&amp;/g, '&').trim().slice(0, 130),
          source: src, sentiment,
          timeAgo: isNaN(hrs) ? 'Recently' : hrs < 1 ? 'Just now' : hrs < 24 ? `${hrs}h ago` : `${Math.round(hrs / 24)}d ago`,
        });
      }
    }
    console.log(`News: ${items.length} items loaded`);
    return { news: items, live: items.length > 0 };
  } catch (e) {
    console.error('News:', e.message);
    return { news: [], live: false, error: e.message };
  }
}

// ── VERCEL HANDLER ────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Content-Type',   'application/json');
  res.setHeader('Cache-Control',  'no-cache, no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const p      = req.query || {};
  const action = p.action || 'quote';

  try {
    const needsSession = action !== 'news';
    const session = needsSession ? await getSession() : null;
    if (needsSession && !session) {
      return res.status(200).json({ live: false, error: 'Could not connect to data source' });
    }

    let result;
    if      (action === 'quote')       result = (await getQuote(p.symbol || 'TCS', session)) || { live: false, error: 'No data', symbol: p.symbol };
    else if (action === 'batch')       result = await getBatchQuotes(p.symbols || 'TCS', session);
    else if (action === 'history')     result = await getHistory(p.symbol || 'TCS', p.range || '1y', p.interval || '1wk', session);
    else if (action === 'indices')     result = await getIndices(session);
    else if (action === 'commodities') result = await getCommodities(session);
    else if (action === 'forex')       result = await getForex(session);
    else if (action === 'news')        result = await getNews(p.q);
    else                               result = { error: 'Unknown action' };

    return res.status(200).json(result);
  } catch (e) {
    console.error('Handler:', e.message);
    return res.status(200).json({ live: false, error: e.message });
  }
}
