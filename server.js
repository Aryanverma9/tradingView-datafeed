const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

class DataStore {
  constructor() {
    this.symbols = this.loadSymbolsConfig();
    this.historicalData = {};
    this.baseTimeframe = 5;
    this.replayCache = {};
    this.loadHistoricalData();
  }

  loadSymbolsConfig() {
    try {
      const data = fs.readFileSync(path.join(__dirname, 'data/symbols.json'), 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('symbols.json not found, using default symbols');
      return {
        'EURUSD': {
          name: 'Euro / US Dollar',
          exchange: 'FOREX',
          type: 'forex',
          session: '24x7',
          timezone: 'UTC',
          minmov: 1,
          pricescale: 10000,
          has_intraday: true,
          has_daily: true,
          has_weekly_and_monthly: true,
          data_status: 'streaming'
        }
      };
    }
  }

  loadHistoricalData() {
    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) {
      console.log(`Data directory not found, generating sample data`);
      this.generateSampleData();
      return;
    }

    for (const symbol of Object.keys(this.symbols)) {
      const filePath = path.join(dataDir, `${symbol}.json`);
      try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        this.historicalData[symbol] = this.convertJsonToBars(data);
        console.log(`Loaded ${this.historicalData[symbol].length} bars for ${symbol}`);
      } catch (error) {
        console.log(`Data file for ${symbol} not found, generating sample data`);
        this.generateSampleDataForSymbol(symbol);
      }
    }
  }

  convertJsonToBars(data) {
    const bars = [];

    if (Array.isArray(data)) {
      for (const item of data) {
        const bar = this.normalizeBarData(item);
        if (bar) bars.push(bar);
      }
    } else if (typeof data === 'object') {
      if (data.time && data.open) {
        for (let i = 0; i < data.time.length; i++) {
          bars.push({
            time: data.time[i],
            open: data.open[i],
            high: data.high[i],
            low: data.low[i],
            close: data.close[i],
            volume: data.volume ? data.volume[i] : 0
          });
        }
      } else {
        const dataArray = data.data || data.bars || [];
        for (const item of dataArray) {
          const bar = this.normalizeBarData(item);
          if (bar) bars.push(bar);
        }
      }
    }

    bars.sort((a, b) => a.time - b.time);
    return bars;
  }

  normalizeBarData(item) {
    try {
      let timestamp = item.time || item.timestamp || item.t || item.date;

      if (!timestamp) return null;

      if (typeof timestamp === 'string') {
        timestamp = new Date(timestamp).getTime() / 1000;
      }

      timestamp = parseFloat(timestamp);
      if (timestamp > 1e10) {
        timestamp = Math.floor(timestamp / 1000);
      } else {
        timestamp = Math.floor(timestamp);
      }

      if (timestamp < 946684800 || timestamp > Date.now() / 1000 + 86400) {
        return null;
      }

      return {
        time: timestamp,
        open: parseFloat(item.open || item.o || 0),
        high: parseFloat(item.high || item.h || 0),
        low: parseFloat(item.low || item.l || 0),
        close: parseFloat(item.close || item.c || 0),
        volume: parseInt(item.volume || item.v || 0)
      };
    } catch (error) {
      console.error('Error normalizing bar data:', error);
      return null;
    }
  }

  getCachedReplayData(symbol, resolution, fromTime, toTime) {
    const cacheKey = `${symbol}_${resolution}_${fromTime}_${toTime}`;
    if (this.replayCache[cacheKey]) {
      console.log(`📦 Cache hit for replay data: ${cacheKey}`);
      return this.replayCache[cacheKey];
    }
    return null;
  }

  cacheReplayData(symbol, resolution, fromTime, toTime, data) {
    const cacheKey = `${symbol}_${resolution}_${fromTime}_${toTime}`;
    this.replayCache[cacheKey] = data;

    if (Object.keys(this.replayCache).length > 100) {
      const oldestKeys = Object.keys(this.replayCache).slice(0, 10);
      for (const key of oldestKeys) {
        delete this.replayCache[key];
      }
    }

    console.log(`💾 Cached replay data: ${cacheKey}`);
  }

  resampleData(bars, targetResolution) {
    if (!bars || bars.length === 0) return [];

    const resolutionMinutes = this.resolutionToMinutes(targetResolution);

    if (resolutionMinutes <= this.baseTimeframe) {
      return bars;
    }

    const resampledBars = [];
    let currentGroup = [];
    const intervalSeconds = resolutionMinutes * 60;

    for (const bar of bars) {
      const periodStart = Math.floor(bar.time / intervalSeconds) * intervalSeconds;

      if (currentGroup.length > 0 &&
          Math.floor(currentGroup[0].time / intervalSeconds) !== Math.floor(periodStart / intervalSeconds)) {
        const prevPeriodStart = Math.floor(currentGroup[0].time / intervalSeconds) * intervalSeconds;
        const resampled = this.createResampledBar(currentGroup, prevPeriodStart);
        if (resampled) resampledBars.push(resampled);
        currentGroup = [];
      }

      currentGroup.push(bar);
    }

    if (currentGroup.length > 0) {
      const periodStart = Math.floor(currentGroup[currentGroup.length - 1].time / intervalSeconds) * intervalSeconds;
      const resampled = this.createResampledBar(currentGroup, periodStart);
      if (resampled) resampledBars.push(resampled);
    }

    return resampledBars;
  }

  createResampledBar(bars, periodStart) {
    if (!bars || bars.length === 0) return null;

    bars.sort((a, b) => a.time - b.time);

    return {
      time: periodStart,
      open: bars[0].open,
      high: Math.max(...bars.map(b => b.high)),
      low: Math.min(...bars.map(b => b.low)),
      close: bars[bars.length - 1].close,
      volume: bars.reduce((sum, b) => sum + b.volume, 0)
    };
  }

  resolutionToMinutes(resolution) {
    const map = {
      '1': 1,
      '5': 5,
      '15': 15,
      '30': 30,
      '60': 60,
      '240': 240,
      '1D': 1440,
      '1W': 10080,
      '1M': 43200
    };
    return map[resolution] || 60;
  }

  generateSampleDataForSymbol(symbol) {
    const bars = [];

    const basePrices = {
      'EURUSD': 1.0800, 'GBPUSD': 1.2600, 'USDJPY': 149.50, 'USDCHF': 0.8800,
      'AUDUSD': 0.6650, 'USDCAD': 1.3450, 'NZDUSD': 0.6150, 'GBPJPY': 188.00,
      'AUDJPY': 99.30, 'CADJPY': 111.20, 'XAUUSD': 2030.00, 'USOIL': 74.50,
      'SPX500': 4580.00, 'US30': 37800.00, 'NAS100': 15950.00, 'NIFTY': 21350.00,
      'BTCUSDT': 42500.00
    };

    let basePrice = basePrices[symbol] || 100.0;
    let currentTime = Math.floor(Date.now() / 1000) - (10000 * 5 * 60);

    let volatility = 0.005;
    if (['XAUUSD', 'USOIL'].includes(symbol)) volatility = 0.01;
    else if (symbol === 'BTCUSDT') volatility = 0.025;
    else if (['SPX500', 'US30', 'NAS100', 'NIFTY'].includes(symbol)) volatility = 0.0075;

    for (let i = 0; i < 10000; i++) {
      const change = (Math.random() - 0.5) * 2 * volatility;
      const openPrice = basePrice;
      basePrice = basePrice * (1 + change);

      const high = Math.max(openPrice, basePrice) * (1 + Math.random() * volatility / 3);
      const low = Math.min(openPrice, basePrice) * (1 - Math.random() * volatility / 3);

      let volume;
      if (symbol.includes('USD') || symbol.includes('JPY')) {
        volume = Math.floor(Math.random() * 15000) + 5000;
      } else if (symbol === 'BTCUSDT') {
        volume = Math.floor(Math.random() * 900) + 100;
      } else {
        volume = Math.floor(Math.random() * 90000) + 10000;
      }

      let decimalPlaces = 2;
      if (['USDJPY', 'GBPJPY', 'AUDJPY', 'CADJPY'].includes(symbol)) {
        decimalPlaces = 3;
      } else if (['EURUSD', 'GBPUSD', 'USDCHF', 'AUDUSD', 'USDCAD', 'NZDUSD'].includes(symbol)) {
        decimalPlaces = 5;
      }

      bars.push({
        time: currentTime,
        open: parseFloat(openPrice.toFixed(decimalPlaces)),
        high: parseFloat(high.toFixed(decimalPlaces)),
        low: parseFloat(low.toFixed(decimalPlaces)),
        close: parseFloat(basePrice.toFixed(decimalPlaces)),
        volume: volume
      });

      currentTime += 300;
    }

    this.historicalData[symbol] = bars;
  }

  generateSampleData() {
    for (const symbol of Object.keys(this.symbols)) {
      this.generateSampleDataForSymbol(symbol);
    }
  }
}

const dataStore = new DataStore();

app.get('/favicon.ico', (req, res) => {
  res.status(204).send();
});

app.get('/config', (req, res) => {
  res.json({
    supports_search: true,
    supports_group_request: false,
    supports_marks: false,
    supports_timescale_marks: false,
    supports_time: true,
    exchanges: [
      { value: 'FOREX', name: 'FOREX', desc: 'Foreign Exchange Market' },
      { value: 'CRYPTO', name: 'CRYPTO', desc: 'Cryptocurrency Exchange' },
      { value: 'COMMODITIES', name: 'COMMODITIES', desc: 'Commodities Market' },
      { value: 'INDEX', name: 'INDEX', desc: 'Stock Market Indices' },
      { value: 'NSE', name: 'NSE', desc: 'National Stock Exchange of India' }
    ],
    symbols_types: [
      { name: 'All types', value: '' },
      { name: 'Forex', value: 'forex' },
      { name: 'Crypto', value: 'crypto' },
      { name: 'Commodity', value: 'commodity' },
      { name: 'Index', value: 'index' }
    ],
    supported_resolutions: ['1', '5', '15', '30', '60', '240', '1D', '1W', '1M']
  });
});

app.get('/symbols', (req, res) => {
  const symbol = req.query.symbol || '';

  if (dataStore.symbols[symbol]) {
    const symbolInfo = dataStore.symbols[symbol];
    res.json({
      name: symbol,
      'exchange-traded': symbolInfo.exchange,
      'exchange-listed': symbolInfo.exchange,
      timezone: symbolInfo.timezone,
      minmov: symbolInfo.minmov,
      minmov2: 0,
      pointvalue: 1,
      session: symbolInfo.session,
      has_intraday: symbolInfo.has_intraday,
      visible_plots_set: 'ohlcv',
      description: symbolInfo.name,
      type: symbolInfo.type,
      supported_resolutions: ['1', '5', '15', '30', '60', '240', '1D', '1W', '1M'],
      pricescale: symbolInfo.pricescale,
      ticker: symbol,
      data_status: symbolInfo.data_status
    });
  } else {
    res.status(404).json({ error: 'Symbol not found' });
  }
});

app.get('/symbol_info', (req, res) => {
  const group = req.query.group || '';
  console.log(`Symbol info request for group: ${group}`);

  const filteredSymbols = [];

  for (const [symbol, info] of Object.entries(dataStore.symbols)) {
    if (group === 'FOREX' && info.exchange === 'FOREX') {
      filteredSymbols.push({
        symbol: symbol,
        full_name: `${info.exchange}:${symbol}`,
        description: info.name,
        exchange: info.exchange,
        ticker: symbol,
        type: info.type
      });
    } else if (group === 'NYSE' && info.exchange === 'NSE') {
      filteredSymbols.push({
        symbol: symbol,
        full_name: `${info.exchange}:${symbol}`,
        description: info.name,
        exchange: info.exchange,
        ticker: symbol,
        type: info.type
      });
    } else if (group === 'AMEX' && info.exchange === 'INDEX') {
      filteredSymbols.push({
        symbol: symbol,
        full_name: `${info.exchange}:${symbol}`,
        description: info.name,
        exchange: info.exchange,
        ticker: symbol,
        type: info.type
      });
    }
  }

  console.log(`Returning ${filteredSymbols.length} symbols for group ${group}`);
  res.json(filteredSymbols);
});

app.get('/search', (req, res) => {
  const query = (req.query.query || '').toUpperCase();
  const typeFilter = req.query.type || '';
  const exchange = req.query.exchange || '';
  const limit = parseInt(req.query.limit || '30');

  const results = [];
  for (const [symbol, info] of Object.entries(dataStore.symbols)) {
    if (query && !symbol.includes(query) && !info.name.toUpperCase().includes(query)) {
      continue;
    }
    if (typeFilter && info.type !== typeFilter) continue;
    if (exchange && info.exchange !== exchange) continue;

    results.push({
      symbol: symbol,
      full_name: `${info.exchange}:${symbol}`,
      description: info.name,
      exchange: info.exchange,
      ticker: symbol,
      type: info.type
    });
  }

  res.json(results.slice(0, limit));
});

app.get('/history', (req, res) => {
  const symbol = req.query.symbol || '';
  const resolution = req.query.resolution || '5';
  const fromTime = parseInt(req.query.from || '0');
  const toTime = parseInt(req.query.to || Math.floor(Date.now() / 1000));
  const replayMode = (req.query.replay || 'false').toLowerCase() === 'true';

  if (replayMode || toTime < Math.floor(Date.now() / 1000) - 86400) {
    console.log(`🎬 REPLAY REQUEST: ${symbol}, resolution: ${resolution}`);
    console.log(`   📅 From: ${new Date(fromTime * 1000)} to ${new Date(toTime * 1000)}`);
    console.log(`   ⏱️  Time range: ${((toTime - fromTime) / 86400).toFixed(1)} days`);
  } else {
    console.log(`History request: ${symbol}, resolution: ${resolution}, from: ${fromTime}, to: ${toTime}`);
  }

  if (!dataStore.symbols[symbol]) {
    console.log(`❌ Symbol ${symbol} not found in symbols`);
    return res.status(404).json({ s: 'error', errmsg: 'Symbol not found' });
  }

  if (!dataStore.historicalData[symbol]) {
    console.log(`❌ No historical data found for ${symbol}`);
    return res.json({ s: 'no_data' });
  }

  if (replayMode) {
    const cached = dataStore.getCachedReplayData(symbol, resolution, fromTime, toTime);
    if (cached) return res.json(cached);
  }

  const baseBars = dataStore.historicalData[symbol];
  console.log(`📊 Total bars available: ${baseBars.length}`);

  if (baseBars.length > 0) {
    const earliestTime = Math.min(...baseBars.map(b => b.time));
    const latestTime = Math.max(...baseBars.map(b => b.time));
    if (replayMode) {
      console.log(`📈 Data range: ${new Date(earliestTime * 1000)} to ${new Date(latestTime * 1000)}`);
    }
  }

  const filteredBars = baseBars.filter(bar => bar.time >= fromTime && bar.time <= toTime);

  if (replayMode) {
    console.log(`🔍 Filtered bars count: ${filteredBars.length} (replay mode)`);
  } else {
    console.log(`Filtered bars count: ${filteredBars.length}`);
  }

  if (filteredBars.length === 0) {
    console.log('⚠️  No data in requested time range');
    if (baseBars.length > 0) {
      const latestBars = baseBars.slice(-100);
      console.log(`📦 Returning latest ${latestBars.length} bars instead`);
      const resampledBars = dataStore.resampleData(latestBars, resolution);
      if (resampledBars.length > 0) {
        const response = {
          s: 'ok',
          t: resampledBars.map(b => b.time),
          o: resampledBars.map(b => b.open),
          h: resampledBars.map(b => b.high),
          l: resampledBars.map(b => b.low),
          c: resampledBars.map(b => b.close),
          v: resampledBars.map(b => b.volume)
        };
        return res.json(response);
      }
    }
    return res.json({ s: 'no_data' });
  }

  const resampledBars = dataStore.resampleData(filteredBars, resolution);

  if (replayMode) {
    console.log(`🎯 Resampled bars count: ${resampledBars.length} (replay mode)`);
  } else {
    console.log(`Resampled bars count: ${resampledBars.length}`);
  }

  if (resampledBars.length === 0) {
    console.log('❌ No data after resampling');
    return res.json({ s: 'no_data' });
  }

  const response = {
    s: 'ok',
    t: resampledBars.map(b => b.time),
    o: resampledBars.map(b => b.open),
    h: resampledBars.map(b => b.high),
    l: resampledBars.map(b => b.low),
    c: resampledBars.map(b => b.close),
    v: resampledBars.map(b => b.volume)
  };

  if (replayMode) {
    response.replay_mode = true;
    response.replay_time = toTime;
    response.bars_count = resampledBars.length;
    dataStore.cacheReplayData(symbol, resolution, fromTime, toTime, response);
  }

  if (replayMode) {
    console.log(`✅ Returning ${resampledBars.length} bars for ${symbol} (REPLAY MODE)`);
  } else {
    console.log(`✅ Returning ${resampledBars.length} bars for ${symbol}`);
  }

  res.json(response);
});

app.get('/replay/history', (req, res) => {
  const symbol = req.query.symbol || '';
  const resolution = req.query.resolution || '5';
  const fromTime = parseInt(req.query.from || '0');
  const toTime = parseInt(req.query.to || Math.floor(Date.now() / 1000));

  console.log(`🎬 DEDICATED REPLAY REQUEST: ${symbol}`);
  console.log(`   📅 From: ${new Date(fromTime * 1000)} (${fromTime})`);
  console.log(`   📅 To: ${new Date(toTime * 1000)} (${toTime})`);
  console.log(`   🔍 Resolution: ${resolution}`);

  if (!dataStore.symbols[symbol]) {
    return res.status(404).json({ s: 'error', errmsg: 'Symbol not found' });
  }

  if (!dataStore.historicalData[symbol]) {
    return res.json({ s: 'no_data' });
  }

  const cached = dataStore.getCachedReplayData(symbol, resolution, fromTime, toTime);
  if (cached) return res.json(cached);

  const baseBars = dataStore.historicalData[symbol];
  const filteredBars = baseBars.filter(bar => bar.time >= fromTime && bar.time <= toTime);

  if (filteredBars.length === 0) {
    return res.json({ s: 'no_data' });
  }

  const resampledBars = dataStore.resampleData(filteredBars, resolution);

  if (resampledBars.length === 0) {
    return res.json({ s: 'no_data' });
  }

  const response = {
    s: 'ok',
    t: resampledBars.map(b => b.time),
    o: resampledBars.map(b => b.open),
    h: resampledBars.map(b => b.high),
    l: resampledBars.map(b => b.low),
    c: resampledBars.map(b => b.close),
    v: resampledBars.map(b => b.volume),
    replay_mode: true,
    replay_time: toTime,
    replay_start: fromTime,
    bars_count: resampledBars.length,
    symbol: symbol,
    resolution: resolution,
    data_range: {
      start: resampledBars.length > 0 ? new Date(resampledBars[0].time * 1000).toISOString() : null,
      end: resampledBars.length > 0 ? new Date(resampledBars[resampledBars.length - 1].time * 1000).toISOString() : null
    }
  };

  dataStore.cacheReplayData(symbol, resolution, fromTime, toTime, response);

  console.log(`✅ Replay response ready: ${resampledBars.length} bars from ${response.data_range.start} to ${response.data_range.end}`);

  res.json(response);
});

app.get('/quotes', (req, res) => {
  const symbols = (req.query.symbols || '').split(',');

  const quotes = [];
  for (const symbol of symbols) {
    if (dataStore.symbols[symbol] && dataStore.historicalData[symbol]) {
      const latestBar = dataStore.historicalData[symbol][dataStore.historicalData[symbol].length - 1];
      quotes.push({
        n: symbol,
        s: 'ok',
        v: {
          ch: (Math.random() - 0.5) * 4,
          chp: (Math.random() - 0.5) * 4,
          short_name: symbol,
          exchange: dataStore.symbols[symbol].exchange,
          description: dataStore.symbols[symbol].name,
          lp: latestBar.close,
          ask: latestBar.close + 0.01,
          bid: latestBar.close - 0.01,
          spread: 0.02,
          open_price: latestBar.open,
          high_price: latestBar.high,
          low_price: latestBar.low,
          prev_close_price: latestBar.close - (Math.random() - 0.5) * 2,
          volume: latestBar.volume
        }
      });
    }
  }

  res.json({ d: quotes });
});

app.get('/time', (req, res) => {
  res.send(Math.floor(Date.now() / 1000).toString());
});

app.get('/marks', (req, res) => {
  res.json([]);
});

app.get('/timescale_marks', (req, res) => {
  res.json([]);
});

app.get('/streaming', (req, res) => {
  res.json({
    streaming_supported: false,
    streaming_url: 'ws://localhost:3000/stream'
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: Math.floor(Date.now() / 1000),
    symbols_count: Object.keys(dataStore.symbols).length,
    base_timeframe: `${dataStore.baseTimeframe} minutes`,
    replay_cache_size: Object.keys(dataStore.replayCache).length,
    replay_features: {
      caching_enabled: true,
      dedicated_endpoint: true,
      enhanced_logging: true
    },
    version: '1.0.1'
  });
});

app.get('/replay/cache', (req, res) => {
  const cacheInfo = {};
  for (const [key, data] of Object.entries(dataStore.replayCache)) {
    cacheInfo[key] = {
      bars_count: data.t ? data.t.length : 0,
      cached_at: new Date().toISOString(),
      size_kb: Math.round(JSON.stringify(data).length / 1024 * 100) / 100
    };
  }

  res.json({
    cache_entries: Object.keys(dataStore.replayCache).length,
    total_size_mb: Math.round(Object.values(dataStore.replayCache).reduce((sum, data) =>
      sum + JSON.stringify(data).length, 0) / (1024 * 1024) * 100) / 100,
    entries: cacheInfo
  });
});

app.post('/replay/cache/clear', (req, res) => {
  const cacheSize = Object.keys(dataStore.replayCache).length;
  dataStore.replayCache = {};

  res.json({
    message: `Cleared ${cacheSize} cache entries`,
    status: 'success'
  });
});

app.get('/data/:symbol.json', (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  if (dataStore.historicalData[symbol]) {
    res.json(dataStore.historicalData[symbol]);
  } else {
    res.status(404).json({ error: `No data found for symbol ${symbol}` });
  }
});

app.get('/data', (req, res) => {
  const availableSymbols = {};
  for (const symbol of Object.keys(dataStore.symbols)) {
    if (dataStore.historicalData[symbol]) {
      const bars = dataStore.historicalData[symbol];
      const barCount = bars.length;
      const latestTime = Math.max(...bars.map(b => b.time));
      availableSymbols[symbol] = {
        bars: barCount,
        timeframe: `${dataStore.baseTimeframe} minutes`,
        latest_timestamp: latestTime,
        latest_date: new Date(latestTime * 1000).toISOString(),
        url: `/data/${symbol}.json`
      };
    }
  }

  res.json({
    available_symbols: availableSymbols,
    base_timeframe: `${dataStore.baseTimeframe} minutes`,
    supported_resolutions: ['1', '5', '15', '30', '60', '240', '1D', '1W', '1M'],
    total_symbols: Object.keys(availableSymbols).length,
    replay_features: {
      cache_enabled: true,
      enhanced_logging: true,
      dedicated_endpoint: true
    }
  });
});

app.get('/debug/:symbol', (req, res) => {
  const symbol = req.params.symbol.toUpperCase();

  const debugInfo = {
    symbol: symbol,
    symbol_exists: !!dataStore.symbols[symbol],
    data_exists: !!dataStore.historicalData[symbol],
    current_time: Math.floor(Date.now() / 1000),
    current_time_readable: new Date().toISOString(),
    replay_cache_entries: Object.keys(dataStore.replayCache).filter(k => k.includes(symbol)).length
  };

  if (dataStore.historicalData[symbol]) {
    const bars = dataStore.historicalData[symbol];
    const recent = bars.slice(-100);
    debugInfo.total_bars = bars.length;
    debugInfo.first_bar_time = bars[0]?.time;
    debugInfo.last_bar_time = bars[bars.length - 1]?.time;
    debugInfo.first_bar_readable = bars[0] ? new Date(bars[0].time * 1000).toISOString() : null;
    debugInfo.last_bar_readable = bars[bars.length - 1] ? new Date(bars[bars.length - 1].time * 1000).toISOString() : null;
    debugInfo.sample_bars = bars.slice(0, 5);
    debugInfo.data_quality = {
      has_gaps: false,
      avg_volume: recent.reduce((sum, b) => sum + b.volume, 0) / recent.length,
      price_range: {
        min: Math.min(...recent.map(b => b.low)),
        max: Math.max(...recent.map(b => b.high))
      }
    };
  }

  res.json(debugInfo);
});

app.post('/admin/add_symbol', (req, res) => {
  const data = req.body;

  const requiredFields = ['symbol', 'name', 'exchange', 'type'];
  if (!requiredFields.every(field => data[field])) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const symbol = data.symbol.toUpperCase();
  dataStore.symbols[symbol] = {
    name: data.name,
    exchange: data.exchange,
    type: data.type,
    session: data.session || '24x7',
    timezone: data.timezone || 'UTC',
    minmov: data.minmov || 1,
    pricescale: data.pricescale || 100,
    has_intraday: data.has_intraday !== false,
    has_daily: data.has_daily !== false,
    has_weekly_and_monthly: data.has_weekly_and_monthly !== false,
    data_status: data.data_status || 'streaming'
  };

  res.json({ message: `Symbol ${symbol} added successfully` });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Starting Enhanced TradingView UDF Data Feed Server with Bar Replay Support...');
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Base timeframe: ${dataStore.baseTimeframe} minutes`);
  console.log('\n🎬 BAR REPLAY FEATURES:');
  console.log('  ✅ Enhanced logging for replay requests');
  console.log('  ✅ Replay data caching for performance');
  console.log('  ✅ Dedicated replay endpoint');
  console.log('  ✅ Cache management endpoints');
  console.log('  ✅ Modern visible_plots_set field');
  console.log('\nAvailable endpoints:');
  console.log('  GET  /config - UDF Configuration');
  console.log('  GET  /symbols - Symbol information');
  console.log('  GET  /symbol_info - Symbol info for groups');
  console.log('  GET  /search - Symbol search');
  console.log('  GET  /history - Historical data (with replay support)');
  console.log('  GET  /replay/history - Dedicated replay endpoint');
  console.log('  GET  /quotes - Real-time quotes');
  console.log('  GET  /time - Server time');
  console.log('  GET  /health - Health check (with replay info)');
  console.log('  GET  /replay/cache - Replay cache information');
  console.log('  POST /replay/cache/clear - Clear replay cache');
  console.log('  GET  /data - List available data files');
  console.log('  GET  /data/<symbol>.json - Direct data file access');
  console.log('  GET  /debug/<symbol> - Enhanced debug with replay info');
  console.log('  POST /admin/add_symbol - Add new symbols');
  console.log('  GET  /favicon.ico - Favicon handler');
  console.log('\nSupported resolutions:', ['1', '5', '15', '30', '60', '240', '1D', '1W', '1M']);
  console.log('Loaded symbols:', Object.keys(dataStore.symbols));
  console.log('Data files available:', Object.keys(dataStore.historicalData));
  console.log('Replay cache initialized:', Object.keys(dataStore.replayCache).length, 'entries');
});
