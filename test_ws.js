const WebSocket = require('ws');
const ws = new WebSocket('wss://fstream.binance.com/ws/btcusdt@depth50@100ms');
ws.on('open', () => console.log('connected'));
ws.on('message', (data) => { console.log(data.toString().substring(0, 100)); ws.close(); });
ws.on('error', (err) => { console.log('error', err.message); });
