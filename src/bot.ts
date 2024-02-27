import { buildBundle } from './build-bundle.js';
import { calculateArb } from './calculate-arb.js';
import { mempool } from './mempool.js';
import { postSimulateFilter } from './post-simulation-filter.js';
import { preSimulationFilter } from './pre-simulation-filter.js';
import { sendBundle } from './send-bundle.js';
import { simulate } from './simulation.js';

console.log(1)
// these are async generators, so essentially streams, but typed
const mempoolUpdates = mempool();
console.log(2)
const filteredTransactions = preSimulationFilter(mempoolUpdates);
console.log(3)
const simulations = simulate(filteredTransactions);

console.log(4)
const backrunnableTrades = postSimulateFilter(simulations);
const arbIdeas = calculateArb(backrunnableTrades);
const bundles = buildBundle(arbIdeas);
await sendBundle(bundles);
