# TradingView UDF Data Feed Server

A comprehensive TradingView Universal Data Feed (UDF) implementation in Node.js with Express.

## Features

- Full TradingView UDF protocol support
- Multiple timeframe resolutions (1min to 1 month)
- 17 pre-configured trading symbols (Forex, Crypto, Commodities, Indices)
- Automatic data resampling from base 5-minute timeframe
- Bar replay support with caching
- Real-time quotes endpoint
- Symbol search and filtering
- Admin API for adding symbols dynamically

## Quick Start

### Install Dependencies
```bash
npm install
```

### Start Server
```bash
npm start
```

The server will start on `http://localhost:3000`

## Available Endpoints

### Core UDF Endpoints
- `GET /config` - UDF configuration
- `GET /symbols?symbol=<SYMBOL>` - Symbol information
- `GET /search?query=<QUERY>` - Search symbols
- `GET /history?symbol=<SYMBOL>&resolution=<RES>&from=<FROM>&to=<TO>` - Historical data
- `GET /quotes?symbols=<SYMBOLS>` - Real-time quotes
- `GET /time` - Server timestamp

### Replay Features
- `GET /replay/history` - Dedicated replay endpoint with metadata
- `GET /replay/cache` - View replay cache information
- `POST /replay/cache/clear` - Clear replay cache

### Data Access
- `GET /data` - List all available symbols and data
- `GET /data/<SYMBOL>.json` - Direct access to symbol data

### Debug & Admin
- `GET /health` - Server health check
- `GET /debug/<SYMBOL>` - Detailed symbol debug info
- `POST /admin/add_symbol` - Add new symbol (requires JSON body)

## Supported Resolutions

- `1` - 1 minute
- `5` - 5 minutes
- `15` - 15 minutes
- `30` - 30 minutes
- `60` - 1 hour
- `240` - 4 hours
- `1D` - 1 day
- `1W` - 1 week
- `1M` - 1 month

## Pre-configured Symbols

### Forex (13 pairs)
- EURUSD, GBPUSD, USDJPY, USDCHF, AUDUSD, USDCAD, NZDUSD
- GBPJPY, AUDJPY, CADJPY

### Commodities (2)
- XAUUSD (Gold)
- USOIL (Crude Oil)

### Indices (4)
- SPX500 (S&P 500)
- US30 (Dow Jones)
- NAS100 (NASDAQ 100)
- NIFTY (Nifty 50)

### Crypto (1)
- BTCUSDT (Bitcoin/Tether)

## Usage Examples

### Get Symbol Information
```bash
curl http://localhost:3000/symbols?symbol=EURUSD
```

### Search Symbols
```bash
curl http://localhost:3000/search?query=USD
```

### Get Historical Data
```bash
curl "http://localhost:3000/history?symbol=EURUSD&resolution=5&from=1705000000&to=1705100000"
```

### Get Quotes
```bash
curl http://localhost:3000/quotes?symbols=EURUSD,GBPUSD,USDJPY
```

### Add Custom Symbol
```bash
curl -X POST http://localhost:3000/admin/add_symbol \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "TSLA",
    "name": "Tesla Inc",
    "exchange": "NASDAQ",
    "type": "stock",
    "pricescale": 100
  }'
```

## Configuration

Edit `data/symbols.json` to customize symbols or add new ones. Each symbol requires:
- `name` - Full name/description
- `exchange` - Exchange code
- `type` - Symbol type (forex, crypto, commodity, index, stock)
- `session` - Trading session (e.g., "24x7" or "0930-1600")
- `timezone` - Timezone (e.g., "UTC", "America/New_York")
- `minmov` - Minimum price movement
- `pricescale` - Price scale (e.g., 10000 for 4 decimal places)

## Replay Mode

The server supports TradingView's bar replay functionality with enhanced features:
- Automatic caching of replay requests
- Enhanced logging for debugging
- Dedicated `/replay/history` endpoint
- Cache management via `/replay/cache` endpoints

## Architecture

- Base timeframe: 5 minutes
- Automatic resampling to higher timeframes
- In-memory data storage with 10,000 bars per symbol
- LRU cache for replay requests (max 100 entries)

## Port Configuration

Default port is `3000`. Change via environment variable:
```bash
PORT=5000 npm start
```

## License

MIT
