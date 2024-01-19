import { mempool } from './mempool.js';
import { simulate } from './simulation.js';
import { postSimulateFilter } from './post-simulation-filter.js';
import { preSimulationFilter } from './pre-simulation-filter.js';
import { calculateArb } from './calculate-arb.js';
import { buildBundle } from './build-bundle.js';
import { sendBundle } from './send-bundle.js';
import { accountsOfInterest } from './markets/index.js';
import { PublicKey } from '@solana/web3.js';
// these are async generators, so essentially streams, but typed

const mempoolUpdates = mempool(accountsOfInterest().map((a) => new PublicKey(a)));
const filteredTransactions = preSimulationFilter(mempoolUpdates);
const simulations = simulate(filteredTransactions);
const backrunnableTrades = postSimulateFilter(simulations);
const arbIdeas = calculateArb(backrunnableTrades);
const bundles = buildBundle(arbIdeas);
await sendBundle(bundles);
