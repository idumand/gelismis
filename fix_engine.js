const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

// We will overwrite analyzeOrderFlowAndInflow and mainQuantEngineLoop
// Because they might have changed, we'll use a regex or string split to replace them.

// Find the start of analyzeOrderFlowAndInflow
const analyzeStart = code.indexOf('function analyzeOrderFlowAndInflow(');
// Find the end of analyzeOrderFlowAndInflow
let analyzeEnd = code.indexOf('// Server-side persistent Binance WebSocket streams', analyzeStart);

// Find the start of mainQuantEngineLoop
const loopStart = code.indexOf('async function mainQuantEngineLoop() {');
// Find the end of mainQuantEngineLoop
const loopEnd = code.indexOf('// Data Sync Loop', loopStart);

console.log("Analyze Start:", analyzeStart, "Analyze End:", analyzeEnd);
console.log("Loop Start:", loopStart, "Loop End:", loopEnd);
