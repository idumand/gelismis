const ccxt = require('ccxt');
const ex = new ccxt.binanceusdm();
try {
  ex.setSandboxMode(true);
  console.log("binanceusdm sandbox worked");
} catch(e) {
  console.log("binanceusdm error: ", e.message);
}

const ex2 = new ccxt.binance({options: {defaultType: 'future'}});
try {
  ex2.setSandboxMode(true);
  console.log("binance sandbox worked");
} catch(e) {
  console.log("binance error: ", e.message);
}
