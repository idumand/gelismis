const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const analyzeStart = code.indexOf('function analyzeOrderFlowAndInflow(');
let analyzeEnd = code.indexOf('// Server-side persistent Binance WebSocket streams', analyzeStart);

const loopStart = code.indexOf('async function mainQuantEngineLoop() {');
const loopEnd = code.indexOf('// Data Sync Loop', loopStart);

console.log("Analyze Start:", analyzeStart, "Analyze End:", analyzeEnd);
console.log("Loop Start:", loopStart, "Loop End:", loopEnd);
