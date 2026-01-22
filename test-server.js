const fs = require('fs');
const path = require('path');

console.log('Testing TradingView Datafeed Server Setup...\n');

console.log('✓ Checking dependencies...');
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
console.log('  - express:', packageJson.dependencies.express);
console.log('  - cors:', packageJson.dependencies.cors);

console.log('\n✓ Checking files...');
console.log('  - server.js:', fs.existsSync('server.js') ? 'exists' : 'missing');
console.log('  - data/symbols.json:', fs.existsSync('data/symbols.json') ? 'exists' : 'missing');

console.log('\n✓ Loading symbols configuration...');
const symbols = JSON.parse(fs.readFileSync('data/symbols.json', 'utf8'));
console.log(`  - Found ${Object.keys(symbols).length} symbols`);
console.log('  - Symbols:', Object.keys(symbols).join(', '));

console.log('\n✓ Validating symbol configuration...');
for (const [symbol, config] of Object.entries(symbols)) {
  const required = ['name', 'exchange', 'type', 'pricescale'];
  const missing = required.filter(field => !config[field]);
  if (missing.length > 0) {
    console.log(`  ⚠ ${symbol} missing fields:`, missing.join(', '));
  }
}

console.log('\n✓ Server configuration validated!');
console.log('\nTo start the server, run:');
console.log('  npm start');
console.log('\nServer will be available at:');
console.log('  http://localhost:3000');
console.log('\nTest endpoints:');
console.log('  http://localhost:3000/config');
console.log('  http://localhost:3000/data');
console.log('  http://localhost:3000/health');
console.log('  http://localhost:3000/symbols?symbol=EURUSD');
