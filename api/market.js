// StockSense India — Market API v13.0 (clean rewrite)
// KEY ARCHITECTURE: Yahoo /v7/finance/quote bulk endpoint
// One HTTP call returns all 50 stocks — no per-stock loops, no timeouts
// Place at: /api/market.js

// ── SESSION ───────────────────────────────────────────────────────
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
    console.log('Session OK crumb=' + crumb.substring(0, 8));
    return { cookie, crumb };
  } catch (e) {
    console.error('getSession:', e.message);
    return null;
  }
}

// ── YAHOO CHART (single symbol, used for quote/history/indices) ───
async function yahooFetch(sym, session, range, interval) {
  range    = range    || '10d';
  interval = interval || '1d';
  const crumbParam = session && session.crumb ? '&crumb=' + encodeURIComponent(session.crumb) : '';
  const url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(sym) + '?interval=' + interval + '&range=' + range + crumbParam;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/json',
      'Cookie': session && session.cookie ? session.cookie : '',
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) { console.error('Chart ' + sym + ' HTTP ' + res.status); return null; }
  const json = await res.json();
  if (json && json.chart && json.chart.error && json.chart.error.code === 'Unauthorized') return null;
  return json;
}

// ── EXTRACT QUOTE from chart data ────────────────────────────────
function extractQuote(data, symbol) {
  var result = data && data.chart && data.chart.result && data.chart.result[0];
  if (!result) return null;
  var m      = result.meta;
  var closes = (result.indicators && result.indicators.quote && result.indicators.quote[0] && result.indicators.quote[0].close || []).filter(function(c){ return c != null && c > 0; });
  var price  = m.regularMarketPrice > 0 ? m.regularMarketPrice : closes.length > 0 ? closes[closes.length - 1] : m.previousClose || 0;
  if (price <= 0) return null;
  var prev   = closes.length >= 2 ? closes[closes.length - 2] : m.previousClose > 0 ? m.previousClose : price;
  return {
    symbol:    symbol,
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
    live:      true,
  };
}

// ── SINGLE QUOTE — uses v7 bulk for accurate real-time price ─────
async function getQuote(symbol, session) {
  // Try v7 bulk first (real-time price, correct weekend %)
  var bulkSym = symbol.replace(/&/g, '%26'); // handle M&M etc
  var quotes  = await getBulkQuotes([bulkSym], session);
  if (quotes[bulkSym] && quotes[bulkSym].price > 0) {
    console.log('Quote v7 ' + symbol + ': Rs.' + quotes[bulkSym].price + ' ' + (quotes[bulkSym].changePct >= 0 ? '+' : '') + quotes[bulkSym].changePct + '%');
    return Object.assign({}, quotes[bulkSym], { symbol: symbol });
  }
  // Fallback to chart endpoint
  var syms = [symbol + '.NS', symbol + '.BO', symbol];
  for (var i = 0; i < syms.length; i++) {
    try {
      var data = await yahooFetch(syms[i], session);
      var r    = extractQuote(data, symbol);
      if (r) { console.log('Quote chart ' + syms[i] + ': Rs.' + r.price); return Object.assign({}, r, { source: syms[i] }); }
    } catch(e) { console.error('Quote ' + syms[i] + ':', e.message); }
  }
  return null;
}

// ── BULK QUOTE — Yahoo v7 returns ALL symbols in ONE HTTP request ─
// This is the key fix. Instead of 50 separate requests that timeout,
// we send ONE request and Yahoo returns all 50 results together.
async function getBulkQuotes(symbols, session) {
  var crumbParam = session && session.crumb ? '&crumb=' + encodeURIComponent(session.crumb) : '';
  var symStr     = symbols.map(function(s){ return s + '.NS'; }).join(',');
  var fields     = 'regularMarketPrice,regularMarketChangePercent,regularMarketChange,regularMarketPreviousClose,regularMarketVolume,fiftyTwoWeekHigh,fiftyTwoWeekLow,trailingPE,marketCap,shortName,longName';
  // Do NOT encode symStr — Yahoo expects raw commas between symbols
  var url        = 'https://query1.finance.yahoo.com/v7/finance/quote?symbols=' + symStr + '&fields=' + fields + crumbParam;

  try {
    var res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Cookie': session && session.cookie ? session.cookie : '',
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) { console.error('Bulk quote HTTP ' + res.status); return {}; }

    var json      = await res.json();
    var quoteList = json && json.quoteResponse && json.quoteResponse.result || [];
    var quotes    = {};

    quoteList.forEach(function(q) {
      var price = q.regularMarketPrice || 0;
      if (price <= 0) return;
      var sym  = (q.symbol || '').replace(/\.(NS|BO)$/, '');
      var prev = q.regularMarketPreviousClose || price;
      var changePct = q.regularMarketChangePercent != null
        ? +q.regularMarketChangePercent.toFixed(2)
        : prev > 0 ? +((price - prev) / prev * 100).toFixed(2) : 0;
      quotes[sym] = {
        symbol: sym, price: +price.toFixed(2),
        change:    +(price - prev).toFixed(2),
        changePct: changePct,
        prevClose: +prev.toFixed(2),
        volume:    q.regularMarketVolume || 0,
        w52High:   +(q.fiftyTwoWeekHigh  || price).toFixed(2),
        w52Low:    +(q.fiftyTwoWeekLow   || 0).toFixed(2),
        pe:        +(q.trailingPE        || 0).toFixed(2),
        marketCap: q.marketCap || 0,
        longName:  q.longName  || q.shortName || sym,
        live:      true,
      };
    });

    console.log('Bulk quote: ' + Object.keys(quotes).length + '/' + symbols.length + ' returned');
    return quotes;
  } catch(e) {
    console.error('Bulk quote error:', e.message);
    return {};
  }
}

// ── BATCH (used by ?action=batch) ────────────────────────────────
async function getBatchQuotes(symbolsStr, session) {
  var symbols = symbolsStr.split(',').map(function(s){ return s.trim().toUpperCase(); }).filter(Boolean).slice(0, 60);
  console.log('Batch: ' + symbols.length + ' symbols via bulk endpoint');
  var quotes  = await getBulkQuotes(symbols, session);
  var loaded  = Object.keys(quotes).length;
  console.log('Batch done: ' + loaded + '/' + symbols.length);
  return { quotes: quotes, loaded: loaded, total: symbols.length, live: loaded > 0 };
}

// ── MARKET SCAN — Nifty 50 via single bulk request ───────────────
async function getMarketScan(session) {
  var NIFTY50 = [
    'RELIANCE','TCS','HDFCBANK','BHARTIARTL','ICICIBANK','SBIN','INFY','HINDUNILVR','ITC','KOTAKBANK',
    'LT','AXISBANK','BAJFINANCE','MARUTI','NTPC','HCLTECH','SUNPHARMA','POWERGRID','WIPRO','ULTRACEMCO',
    'ADANIPORTS','NESTLEIND','TITAN','TATAMOTORS','ONGC','BAJAJFINSV','MM','JSWSTEEL','TATASTEEL','COALINDIA',
    'GRASIM','CIPLA','DIVISLAB','BPCL','INDUSINDBK','TATACONSUM','DRREDDY','APOLLOHOSP','ASIANPAINT','EICHERMOT',
    'HDFCLIFE','SBILIFE','TECHM','HEROMOTOCO','BRITANNIA','HINDALCO','ADANIENT','BAJAJ-AUTO','VEDL','UPL',
  ];
  console.log('Market scan: ' + NIFTY50.length + ' stocks — single bulk request');
  var quotes = await getBulkQuotes(NIFTY50, session);
  var loaded = Object.keys(quotes).length;
  console.log('Market scan done: ' + loaded + '/' + NIFTY50.length);
  return { quotes: quotes, loaded: loaded, total: NIFTY50.length, scanned: NIFTY50.length, live: loaded > 0 };
}

// ── HISTORY ───────────────────────────────────────────────────────
async function getHistory(symbol, range, interval, session) {
  var syms = [symbol + '.NS', symbol + '.BO', symbol];
  for (var i = 0; i < syms.length; i++) {
    try {
      var data = await yahooFetch(syms[i], session, range, interval);
      var r    = data && data.chart && data.chart.result && data.chart.result[0];
      if (!r) continue;
      var ts   = r.timestamp || [];
      var cl   = r.indicators && r.indicators.quote && r.indicators.quote[0] && r.indicators.quote[0].close || [];
      var vol  = r.indicators && r.indicators.quote && r.indicators.quote[0] && r.indicators.quote[0].volume || [];
      var prices = ts.map(function(t, idx) {
        return { date: new Date(t * 1000).toISOString().split('T')[0], close: cl[idx] ? +cl[idx].toFixed(2) : null, volume: vol[idx] || 0 };
      }).filter(function(p){ return p.close !== null; });
      if (prices.length) return { prices: prices, live: true, symbol: syms[i] };
    } catch(e) { console.error('History ' + syms[i] + ':', e.message); }
  }
  return { prices: [], live: false };
}

// ── INDICES ───────────────────────────────────────────────────────
async function getIndices(session) {
  var MAP = [
    ['^NSEI','NIFTY 50'],['^BSESN','SENSEX'],['^NSEBANK','NIFTY BANK'],
    ['^CNXIT','NIFTY IT'],['^CNXPHARMA','NIFTY PHARMA'],
    ['^CNXAUTO','NIFTY AUTO'],['^CNXFMCG','NIFTY FMCG'],['^INDIAVIX','INDIA VIX'],
  ];
  var results = await Promise.all(MAP.map(async function(entry) {
    var sym = entry[0], name = entry[1];
    try {
      var data   = await yahooFetch(sym, session);
      var result = data && data.chart && data.chart.result && data.chart.result[0];
      if (!result) return null;
      var m      = result.meta;
      var price  = m.regularMarketPrice || 0;
      if (price <= 0) return null;
      var closes = (result.indicators && result.indicators.quote && result.indicators.quote[0] && result.indicators.quote[0].close || []).filter(function(c){ return c != null && c > 0; });
      var prev   = closes.length >= 2 ? closes[closes.length - 2] : (m.previousClose || price);
      return { name: name, symbol: sym, value: +price.toFixed(2), change: +(price-prev).toFixed(2), changePct: +((price-prev)/prev*100).toFixed(2), prevClose: +prev.toFixed(2) };
    } catch(e) { console.error('Index ' + sym + ':', e.message); return null; }
  }));
  var indices = results.filter(Boolean);
  console.log('Indices: ' + indices.length + '/8');
  return { indices: indices, live: indices.length > 0 };
}

// ── COMMODITIES ───────────────────────────────────────────────────
async function getCommodities(session) {
  var COMM = [
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
  var results = await Promise.all(COMM.map(async function(c) {
    try {
      var data = await yahooFetch(c.sym, session);
      var r    = data && data.chart && data.chart.result && data.chart.result[0];
      if (!r) return null;
      var price  = r.meta && r.meta.regularMarketPrice || 0;
      if (price <= 0) return null;
      var closes = (r.indicators && r.indicators.quote && r.indicators.quote[0] && r.indicators.quote[0].close || []).filter(function(v){ return v != null && v > 0; });
      var prev   = closes.length >= 2 ? closes[closes.length - 2] : (r.meta && r.meta.previousClose || price);
      return Object.assign({}, c, { price: +price.toFixed(2), changePct: +((price-prev)/prev*100).toFixed(2) });
    } catch(e) { return null; }
  }));
  var commodities = results.filter(Boolean);
  console.log('Commodities: ' + commodities.length + '/10');
  return { commodities: commodities, live: commodities.length > 0 };
}

// ── FOREX ─────────────────────────────────────────────────────────
async function getForex(session) {
  var PAIRS = [
    { sym:'INR=X',    label:'USD/INR', flag:'🇺🇸', sub:'US Dollar',       impact:'IT exports gain when rupee weakens' },
    { sym:'AEDINR=X', label:'AED/INR', flag:'🇦🇪', sub:'UAE Dirham',       impact:'Key for Indian expat remittances' },
    { sym:'EURINR=X', label:'EUR/INR', flag:'🇪🇺', sub:'Euro',             impact:'European export competitiveness' },
    { sym:'GBPINR=X', label:'GBP/INR', flag:'🇬🇧', sub:'British Pound',    impact:'UK trade and IT services' },
    { sym:'JPYINR=X', label:'JPY/INR', flag:'🇯🇵', sub:'Japanese Yen',     impact:'Japanese FDI indicator' },
    { sym:'CNHINR=X', label:'CNH/INR', flag:'🇨🇳', sub:'Chinese Yuan',     impact:'Trade competition with China' },
    { sym:'SARINR=X', label:'SAR/INR', flag:'🇸🇦', sub:'Saudi Riyal',      impact:'Oil & Gulf remittances' },
    { sym:'SGDINR=X', label:'SGD/INR', flag:'🇸🇬', sub:'Singapore Dollar', impact:'ASEAN investment flows' },
  ];
  var results = await Promise.all(PAIRS.map(async function(p) {
    try {
      var data = await yahooFetch(p.sym, session);
      var r    = data && data.chart && data.chart.result && data.chart.result[0];
      if (!r) return null;
      var rate   = r.meta && r.meta.regularMarketPrice || 0;
      if (rate <= 0) return null;
      var closes = (r.indicators && r.indicators.quote && r.indicators.quote[0] && r.indicators.quote[0].close || []).filter(function(v){ return v != null && v > 0; });
      var prev   = closes.length >= 2 ? closes[closes.length - 2] : (r.meta && r.meta.previousClose || rate);
      return Object.assign({}, p, { rate: +rate.toFixed(4), changePct: +((rate-prev)/prev*100).toFixed(2) });
    } catch(e) { return null; }
  }));
  var forex = results.filter(Boolean);
  console.log('Forex: ' + forex.length + '/8');
  return { forex: forex, live: forex.length > 0 };
}

// ── NEWS ──────────────────────────────────────────────────────────
async function getNews(q) {
  try {
    var baseQuery   = q || 'India stock market NSE Nifty Sensex economy RBI';
    var globalExtra = q ? '' : ' OR "global markets" OR "Fed rate" OR "crude oil" OR war geopolitical';
    var query       = encodeURIComponent(baseQuery + globalExtra);
    var res = await fetch('https://news.google.com/rss/search?q=' + query + '+when:3d&hl=en-IN&gl=IN&ceid=IN:en', {
      headers: { 'Accept': 'application/rss+xml, text/xml' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { news: [], live: false };
    var body  = await res.text();
    var items = [];
    var re    = /<item>([\s\S]*?)<\/item>/g;
    var m;
    while ((m = re.exec(body)) !== null && items.length < 25) {
      var c     = m[1];
      var tm    = c.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || c.match(/<title>(.*?)<\/title>/);
      var title = tm ? tm[1] : '';
      var sm    = c.match(/<source[^>]*>(.*?)<\/source>/);
      var src   = sm ? sm[1] : 'News';
      var pm    = c.match(/<pubDate>(.*?)<\/pubDate>/);
      var pub   = pm ? pm[1] : '';
      if (title) {
        var tl        = title.toLowerCase();
        var sentiment = tl.match(/fall|drop|crash|loss|decline|plunge|slump/) ? 'negative' : tl.match(/rise|gain|surge|rally|profit|jump|soar/) ? 'positive' : 'neutral';
        var hrs       = Math.round((Date.now() - new Date(pub)) / 3600000);
        items.push({ title: title.replace(/ - [^-]+$/, '').replace(/&amp;/g, '&').trim().slice(0, 130), source: src, sentiment: sentiment, timeAgo: isNaN(hrs) ? 'Recently' : hrs < 1 ? 'Just now' : hrs < 24 ? hrs + 'h ago' : Math.round(hrs/24) + 'd ago' });
      }
    }
    console.log('News: ' + items.length + ' items');
    return { news: items, live: items.length > 0 };
  } catch(e) { return { news: [], live: false, error: e.message }; }
}

// ── FUNDAMENTALS ──────────────────────────────────────────────────
async function getFundamentals(symbol, session) {
  var modules = 'financialData,defaultKeyStatistics,incomeStatementHistory,balanceSheetHistory';
  var syms    = [symbol + '.NS', symbol + '.BO', symbol];
  for (var i = 0; i < syms.length; i++) {
    var sym = syms[i];
    try {
      var crumbParam = session && session.crumb ? '&crumb=' + encodeURIComponent(session.crumb) : '';
      var url = 'https://query1.finance.yahoo.com/v10/finance/quoteSummary/' + encodeURIComponent(sym) + '?modules=' + modules + crumbParam;
      var res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Accept': 'application/json', 'Cookie': session && session.cookie ? session.cookie : '' },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) continue;
      var json = await res.json();
      if (json && json.quoteSummary && json.quoteSummary.error) continue;
      var r = json && json.quoteSummary && json.quoteSummary.result && json.quoteSummary.result[0];
      if (!r) continue;
      var isList = r.incomeStatementHistory && r.incomeStatementHistory.incomeStatementHistory || [];
      var income = isList.slice(0, 4).map(function(q) { return { date: q.endDate && q.endDate.fmt || '-', revenue: q.totalRevenue && q.totalRevenue.raw || 0, profit: q.netIncome && q.netIncome.raw || 0, ebitda: q.ebitda && q.ebitda.raw || 0, eps: q.basicEPS && q.basicEPS.raw || 0 }; });
      var ks = r.defaultKeyStatistics || {};
      var fd = r.financialData        || {};
      console.log('Fundamentals ' + sym + ': ' + income.length + ' years');
      return { symbol: symbol, source: sym, live: true, income: income,
        roe:           fd.returnOnEquity  && fd.returnOnEquity.raw   ? +(fd.returnOnEquity.raw * 100).toFixed(1)  : null,
        profitMargin:  fd.profitMargins   && fd.profitMargins.raw    ? +(fd.profitMargins.raw * 100).toFixed(1)   : null,
        revenueGrowth: fd.revenueGrowth   && fd.revenueGrowth.raw   ? +(fd.revenueGrowth.raw * 100).toFixed(1)   : null,
        earningsGrowth:fd.earningsGrowth  && fd.earningsGrowth.raw  ? +(fd.earningsGrowth.raw * 100).toFixed(1)  : null,
        debtToEquity:  fd.debtToEquity    && fd.debtToEquity.raw    ? +fd.debtToEquity.raw.toFixed(2)            : null,
        currentRatio:  fd.currentRatio    && fd.currentRatio.raw    ? +fd.currentRatio.raw.toFixed(2)            : null,
        freeCashFlow:  fd.freeCashflow    && fd.freeCashflow.raw    || null,
        priceToBook:   ks.priceToBook     && ks.priceToBook.raw     ? +ks.priceToBook.raw.toFixed(2)             : null,
        beta:          ks.beta            && ks.beta.raw            ? +ks.beta.raw.toFixed(2)                    : null,
        forwardPE:     ks.forwardPE       && ks.forwardPE.raw       ? +ks.forwardPE.raw.toFixed(1)               : null,
      };
    } catch(e) { console.error('Fundamentals ' + sym + ':', e.message); }
  }
  return null;
}

// ── HANDLER ───────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Content-Type',   'application/json');
  res.setHeader('Cache-Control',  'no-cache, no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();

  var p      = req.query || {};
  var action = p.action  || 'quote';

  try {
    var session = (action !== 'news') ? await getSession() : null;
    if (action !== 'news' && !session) {
      return res.status(200).json({ live: false, error: 'Session failed' });
    }
    var result;
    if      (action === 'quote')        result = (await getQuote(p.symbol || 'TCS', session))        || { live: false, error: 'No data' };
    else if (action === 'batch')        result = await getBatchQuotes(p.symbols || 'TCS', session);
    else if (action === 'marketscan')   result = await getMarketScan(session);
    else if (action === 'history')      result = await getHistory(p.symbol || 'TCS', p.range || '1y', p.interval || '1wk', session);
    else if (action === 'fundamentals') result = (await getFundamentals(p.symbol || 'TCS', session)) || { live: false, error: 'No fundamentals' };
    else if (action === 'indices')      result = await getIndices(session);
    else if (action === 'commodities')  result = await getCommodities(session);
    else if (action === 'forex')        result = await getForex(session);
    else if (action === 'news')         result = await getNews(p.q);
    else                                result = { error: 'Unknown action' };
    return res.status(200).json(result);
  } catch(e) {
    console.error('Handler error:', e.message);
    return res.status(200).json({ live: false, error: e.message });
  }
}
