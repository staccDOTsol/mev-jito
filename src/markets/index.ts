import { defaultImport } from 'default-import';
import fs from 'fs';
import jsbi from 'jsbi';

//import { OrcaWhirpoolDEX } from './orca-whirlpool/index.js';
import {
  Quote as JupiterQuote,
  QuoteParams,
  SwapLegAndAccounts,
  SwapParams,
} from '@jup-ag/core/dist/lib/amm.js';
import {
  AccountInfo,
  PublicKey,
} from '@solana/web3.js';

//import { RaydiumClmmDEX } from './raydium-clmm/index.js';
import {
  AccountSubscriptionHandlersMap,
  geyserAccountUpdateClient,
} from '../clients/geyser.js';
import { connection } from '../clients/rpc.js';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { WorkerPool } from '../worker-pool.js';
//import fetch from 'node-fetch';
import { MintMarketGraph } from './market-graph.js';
import { RaydiumDEX } from './raydium/index.js';
import {
  AccountUpdateResultPayload,
  AddPoolResultPayload,
  AmmCalcWorkerParamMessage,
  AmmCalcWorkerResultMessage,
  CalculateQuoteResultPayload,
  CalculateRouteResultPayload,
  DEX,
  GetSwapLegAndAccountsResultPayload,
  Market,
  Quote,
  SerializableRoute,
} from './types.js';
import {
  toAccountMeta,
  toJupiterQuote,
  toSerializableAccountInfo,
  toSerializableQuoteParams,
  toSerializableSwapParams,
} from './utils.js';

const JSBI = defaultImport(jsbi);

const NUM_WORKER_THREADS = config.get('num_worker_threads');

const ammCalcWorkerPool = new WorkerPool(
  NUM_WORKER_THREADS,
  './build/src/markets/amm-calc-worker.js',
);
await ammCalcWorkerPool.initialize();
function randomDelay(min, max) {
  return Math.floor(Math.random() * (max - min + 1) + min);
}

async function waitForPromise() {
  return new Promise((resolve) => {
      const delay = randomDelay(1, 6); 
      setTimeout(() => {
          resolve('Promise resolved after ' + delay + ' milliseconds');
      }, delay);
  });
}
logger.info('Initialized AMM calc worker pool');
const awaited = await waitForPromise();
console.log(awaited)
const dexs: DEX[] = [
  new RaydiumDEX(),
];

const accountsForGeyserUpdate: any = [];
for (const dex of dexs) {
  for (const addPoolMessage of dex.getAmmCalcAddPoolMessages()) {
    const results = ammCalcWorkerPool.runTaskOnAllWorkers<
      AmmCalcWorkerParamMessage,
      AmmCalcWorkerResultMessage
    >(addPoolMessage);
    
    const resultsPromises = results.map(resultPromise => resultPromise.then((result) => {
      if (result.type !== 'addPool') {
        throw new Error('Unexpected result type in addPool response');
      }
      const payload = result.payload as AddPoolResultPayload;
      return payload.accountsForUpdate;
    }));
    
    const resolvedResults = await Promise.all(resultsPromises);
    accountsForGeyserUpdate.push(...resolvedResults);
}
}

const accountsForGeyserUpdateFlat = accountsForGeyserUpdate.flat();
const accountsForGeyserUpdateSet = new Set(accountsForGeyserUpdateFlat);

logger.info('Got account list for pools');

const initialAccountBuffers: Map<string, AccountInfo<Buffer> | null> =
  new Map();
const addressesToFetch: PublicKey[] = [...accountsForGeyserUpdateSet].map(
  (a) => new PublicKey(a),
);
for (let i = 0; i < addressesToFetch.length; i += 50000) {
  const batchPromises = [];
  for (let j = 0; j < 5; j++) {
    const batchStart = i + (j * 10000);
    const batch = addressesToFetch.slice(batchStart, batchStart + 10000);
    batchPromises.push(connection.getMultipleAccountsInfo(batch));
    await new Promise((resolve) => setTimeout(resolve, 10));

  }
  const accountsArray = await Promise.all(batchPromises);
  for (let j = 0; j < accountsArray.length; j++) {
    const accounts = accountsArray[j];
    const batchStart = i + (j * 10000);
    const batch = addressesToFetch.slice(batchStart, batchStart + 10000);
    for (let k = 0; k < accounts.length; k++) {
      initialAccountBuffers.set(batch[k].toBase58(), accounts[k]);
    }
  }
  console.log(`Fetched ${i + 10000} accounts / total: ` + addressesToFetch.length);
}

let seedAccountInfoPromises: Promise<AmmCalcWorkerResultMessage>[] = [];
// seed account info in workers
for (const [id, accountInfo] of initialAccountBuffers) {
  const message: AmmCalcWorkerParamMessage = {
    type: 'accountUpdate',
    payload: {
      id,
      accountInfo: accountInfo ? toSerializableAccountInfo(accountInfo) : null,
    },
  };
  const results = ammCalcWorkerPool.runTaskOnAllWorkers<
    AmmCalcWorkerParamMessage,
    AmmCalcWorkerResultMessage
  >(message);
 
  const resultsPromises = results.map(resultPromise => resultPromise);
  seedAccountInfoPromises.push(...resultsPromises);
  
  if (seedAccountInfoPromises.length > 10000) {
    await Promise.all(seedAccountInfoPromises);
    seedAccountInfoPromises = [];
  }
}


logger.info('Seeded account info in workers');

const accountSubscriptionsHandlersMap: AccountSubscriptionHandlersMap =
  new Map();
  let geysers: any = []
// set up geyser subs
for (const account of accountsForGeyserUpdateSet) {
  const callback = async (accountInfo: AccountInfo<Buffer>) => {
    const message: AmmCalcWorkerParamMessage = {
      type: 'accountUpdate',
      payload: {
        id: account as string,
        accountInfo: toSerializableAccountInfo(accountInfo),
      },
    };
    const resultPromises = ammCalcWorkerPool.runTaskOnAllWorkers<
      AmmCalcWorkerParamMessage,
      AmmCalcWorkerResultMessage
    >(message);
    geysers.push(...resultPromises)
  if (geysers.length > 10000) {
   const results = await Promise.all(geysers);
    geysers = [];
    const error = results.find((result) => {
      const payload = result.payload as AccountUpdateResultPayload;
      return payload.error === true;
    });

    if (error) {
      logger.warn(
        `Error updating pool account ${account}, re-seeding with data from rpc`,
      );
      const accountInfo = await connection.getAccountInfo(
        new PublicKey(account),
      );
      const message: AmmCalcWorkerParamMessage = {
        type: 'accountUpdate',
        payload: {
          id: account as string,
          accountInfo: toSerializableAccountInfo(accountInfo),
        },
      };
      ammCalcWorkerPool.runTaskOnAllWorkers<
        AmmCalcWorkerParamMessage,
        AmmCalcWorkerResultMessage
      >(message);
    }
  }
  };
  accountSubscriptionsHandlersMap.set(account as string, [callback]);
}
geyserAccountUpdateClient.addSubscriptions(accountSubscriptionsHandlersMap);
logger.info('Initialized geyser update handlers');

// both vaults of all markets where one side of the market is USDC or SOL
const tokenAccountsOfInterest = new Map<string, Market>();
const marketGraph = new MintMarketGraph();
const mintsOfInterest: string[] = []

for (const dex of dexs) {
  for (const market of dex.getAllMarkets()) {
      tokenAccountsOfInterest.set(market.tokenVaultA, market);
      tokenAccountsOfInterest.set(market.tokenVaultB, market);
      mintsOfInterest.push(market.tokenMintA)
      mintsOfInterest.push(market.tokenMintB)
      marketGraph.addMarket(market.tokenMintA, market.tokenMintB, market);
  }
}
const objCountMints: any = {}
for (const mint of mintsOfInterest){
  if (Object.keys(objCountMints).includes(mint)){
    objCountMints[mint]++
  }
  else {
    objCountMints[mint] = 1
  }
}
fs.writeFileSync('obj.json', JSON.stringify(objCountMints))
const setOfmintsOfInterest = new Set(mintsOfInterest)
console.log(setOfmintsOfInterest.size + ' mints of interest yo')
export const accountsOfInterest = (): string[] => {
  return [...tokenAccountsOfInterest.keys()].filter(
    (account) => account !== undefined,
  )
  // dedupe
    .filter((value, index, self) => self.indexOf(value) === index);

}
const isTokenAccountOfInterest = (tokenAccount: string): boolean => {
  return tokenAccountsOfInterest.has(tokenAccount);
};

function getMarketForVault(vault: string): Market {
  const market = tokenAccountsOfInterest.get(vault);

  return market;
}

const getMarketsForPair = (mintA: string, mintB: string): Market[] => {
  const markets: Market[] = [];
  for (const dex of dexs) {
    markets.push(...dex.getMarketsForPair(mintA, mintB));
  }
  return markets;
};

type Route = {
  hop1: Market;
  hop2: Market;
};

const routeCache: Map<string, Route[]> = new Map();

function getAll2HopRoutes(
  sourceMint: string,
  destinationMint: string,
): Route[] {
  const cacheKey = `${sourceMint}-${destinationMint}`;
  const cacheKeyReverse = `${destinationMint}-${sourceMint}`;

  if (routeCache.has(cacheKey)) {
    logger.debug(`Cache hit for ${cacheKey}`);
    return routeCache.get(cacheKey);
  }
  const sourceNeighbours = marketGraph.getNeighbours(sourceMint);
  const destNeighbours = marketGraph.getNeighbours(destinationMint);
  let intersections: Set<string> = new Set();
  if (sourceNeighbours.size < destNeighbours.size) {
    intersections = new Set(
      [...sourceNeighbours].filter((i) => destNeighbours.has(i)),
    );
  } else {
    intersections = new Set(
      [...destNeighbours].filter((i) => sourceNeighbours.has(i)),
    );
  }

  const routes: {
    hop1: Market;
    hop2: Market;
  }[] = [];
  const routesReverse: {
    hop1: Market;
    hop2: Market;
  }[] = [];

  for (const intersection of intersections) {
    const hop1 = marketGraph.getMarkets(sourceMint, intersection);
    const hop2 = marketGraph.getMarkets(intersection, destinationMint);
    for (const hop1Market of hop1) {
      for (const hop2Market of hop2) {
        routes.push({
          hop1: hop1Market,
          hop2: hop2Market,
        });
        routesReverse.push({
          hop1: hop2Market,
          hop2: hop1Market,
        });
      }
    }
  }
  routeCache.set(cacheKey, routes);
  routeCache.set(cacheKeyReverse, routesReverse);
  return routes;
}

async function calculateQuote(
  poolId: string,
  params: QuoteParams,
  timeout?: number,
  prioritze?: boolean,
): Promise<JupiterQuote | null> {
  logger.debug(`Calculating quote for ${poolId} ${JSON.stringify(params)}`);
  const serializableQuoteParams = toSerializableQuoteParams(params);
  const message: AmmCalcWorkerParamMessage = {
    type: 'calculateQuote',
    payload: {
      id: poolId,
      params: serializableQuoteParams,
    },
  };

  const result = await ammCalcWorkerPool.runTask<
    AmmCalcWorkerParamMessage,
    AmmCalcWorkerResultMessage
  >(message, timeout, prioritze);
  if (result === null) return null;
  const payload = result.payload as CalculateQuoteResultPayload;
  if (payload.error !== undefined) throw payload.error;

  const serializableQuote = payload.quote;
  const quote = toJupiterQuote(serializableQuote);
  return quote;
}

async function calculateSwapLegAndAccounts(
  poolId: string,
  params: SwapParams,
  timeout?: number,
  prioritze?: boolean,
): Promise<SwapLegAndAccounts> {
  logger.debug(
    `Calculating SwapLegAndAccounts for ${poolId} ${JSON.stringify(params)}`,
  );
  const serializableSwapParams = toSerializableSwapParams(params);
  const message: AmmCalcWorkerParamMessage = {
    type: 'getSwapLegAndAccounts',
    payload: {
      id: poolId,
      params: serializableSwapParams,
    },
  };
  const result = await ammCalcWorkerPool.runTask<
    AmmCalcWorkerParamMessage,
    AmmCalcWorkerResultMessage
  >(message, timeout, prioritze);

  const payload = result.payload as GetSwapLegAndAccountsResultPayload;
  const [leg, accounts] = payload.swapLegAndAccounts;
  return [leg, accounts.map(toAccountMeta)];
}

async function calculateRoute(
  route: SerializableRoute,
  timeout?: number,
): Promise<Quote | null> {
  const message: AmmCalcWorkerParamMessage = {
    type: 'calculateRoute',
    payload: { route },
  };
  const result = await ammCalcWorkerPool.runTask<
    AmmCalcWorkerParamMessage,
    AmmCalcWorkerResultMessage
  >(message, timeout);

  if (result === null) return null;

  const payload = result.payload as CalculateRouteResultPayload;
  const serializableQuote = payload.quote;
  return {
    in: JSBI.BigInt(Math.floor(parseFloat(serializableQuote.in))),
    out: JSBI.BigInt(Math.floor(parseFloat(serializableQuote.out))),
  };
}

export {
  calculateQuote,
  calculateRoute,
  calculateSwapLegAndAccounts,
  DEX,
  getAll2HopRoutes,
  getMarketForVault,
  getMarketsForPair,
  isTokenAccountOfInterest,
};
