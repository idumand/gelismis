const ccxt = require('ccxt');
async function test() {
  const ex = new ccxt.binance({
    apiKey: 'mykey',
    secret: 'mysecret',
    options: {
        defaultType: 'future'
    }
  });
  ex.setSandboxMode(true);
  try {
    await ex.fetchBalance({type: 'future'});
    console.log("Success");
  } catch(e) {
    console.log("Error: ", e.message);
  }
}
test();
