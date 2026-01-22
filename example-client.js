const http = require('http');

const BASE_URL = 'http://localhost:3000';

function makeRequest(endpoint) {
  return new Promise((resolve, reject) => {
    http.get(`${BASE_URL}${endpoint}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(data);
        }
      });
    }).on('error', reject);
  });
}

async function testDatafeed() {
  console.log('TradingView Datafeed Client Example\n');
  console.log('=====================================\n');

  try {
    console.log('1. Getting server configuration...');
    const config = await makeRequest('/config');
    console.log('   Supported resolutions:', config.supported_resolutions);
    console.log('   Exchanges:', config.exchanges.map(e => e.value).join(', '));

    console.log('\n2. Searching for USD symbols...');
    const searchResults = await makeRequest('/search?query=USD&limit=5');
    console.log(`   Found ${searchResults.length} symbols:`);
    searchResults.forEach(s => console.log(`   - ${s.symbol}: ${s.description}`));

    console.log('\n3. Getting EURUSD symbol info...');
    const symbolInfo = await makeRequest('/symbols?symbol=EURUSD');
    console.log('   Name:', symbolInfo.description);
    console.log('   Exchange:', symbolInfo['exchange-traded']);
    console.log('   Type:', symbolInfo.type);
    console.log('   Pricescale:', symbolInfo.pricescale);

    console.log('\n4. Getting historical data for EURUSD...');
    const now = Math.floor(Date.now() / 1000);
    const from = now - 86400;
    const history = await makeRequest(`/history?symbol=EURUSD&resolution=5&from=${from}&to=${now}`);
    if (history.s === 'ok') {
      console.log(`   Received ${history.t.length} bars`);
      console.log('   First bar:', {
        time: new Date(history.t[0] * 1000).toISOString(),
        open: history.o[0],
        high: history.h[0],
        low: history.l[0],
        close: history.c[0],
        volume: history.v[0]
      });
      console.log('   Last bar:', {
        time: new Date(history.t[history.t.length - 1] * 1000).toISOString(),
        open: history.o[history.o.length - 1],
        high: history.h[history.h.length - 1],
        low: history.l[history.l.length - 1],
        close: history.c[history.c.length - 1],
        volume: history.v[history.v.length - 1]
      });
    }

    console.log('\n5. Getting quotes...');
    const quotes = await makeRequest('/quotes?symbols=EURUSD,GBPUSD,USDJPY');
    console.log(`   Received quotes for ${quotes.d.length} symbols`);
    quotes.d.forEach(q => {
      if (q.s === 'ok') {
        console.log(`   ${q.n}: ${q.v.lp} (${q.v.chp > 0 ? '+' : ''}${q.v.chp.toFixed(2)}%)`);
      }
    });

    console.log('\n6. Getting available data...');
    const dataList = await makeRequest('/data');
    console.log(`   Total symbols with data: ${dataList.total_symbols}`);
    console.log('   Base timeframe:', dataList.base_timeframe);

    console.log('\n7. Getting server health...');
    const health = await makeRequest('/health');
    console.log('   Status:', health.status);
    console.log('   Symbols count:', health.symbols_count);
    console.log('   Version:', health.version);

    console.log('\n✅ All tests passed!');
    console.log('\nYou can now integrate this datafeed with TradingView:');
    console.log('   datafeed: new Datafeeds.UDFCompatibleDatafeed("http://localhost:3000")');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.log('\nMake sure the server is running:');
    console.log('   npm start');
  }
}

if (require.main === module) {
  testDatafeed();
}

module.exports = { makeRequest, testDatafeed };
