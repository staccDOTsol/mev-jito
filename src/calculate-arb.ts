import { LAMPORTS_PER_SOL, PublicKey, VersionedTransaction } from '@solana/web3.js';
import { defaultImport } from 'default-import';
import jsbi from 'jsbi';
import { prioritize, shuffle, toDecimalString } from './utils.js';
import { config } from './config.js';
import { logger } from './logger.js';
import {
  calculateRoute as workerCalculateRoute,
  getAll2HopRoutes,
  getMarketsForPair,
  calculateQuote,
} from './markets/index.js';
import { Market, SerializableRoute } from './markets/types.js';
import { BackrunnableTrade } from './post-simulation-filter.js';
import { Timings } from './types.js';

import bs58 from 'bs58';
import fetch from 'node-fetch';
import { NATIVE_MINT } from '@solana/spl-token-3';
import { SwapMode } from '@jup-ag/core';
import { connection } from './clients/rpc.js';
const mrgnMetadata: any = await fetch("https://storage.googleapis.com/mrgn-public/mrgn-token-metadata-cache.json").then((res) => res.json());  

const JSBI = defaultImport(jsbi);

const ARB_CALCULATION_NUM_STEPS = config.get('arb_calculation_num_steps');
const MAX_ARB_CALCULATION_TIME_MS = config.get('max_arb_calculation_time_ms');
const HIGH_WATER_MARK = 14200;

// rough ratio usdc (in decimals) to sol (in lamports) used in priority queue
// assuming 1 sol = 20 usdc and 1 sol has 3 more decimals than usdc
// this means one unit of usdc equals x units of sol
export const USDC_SOL_RATOs = {NATIVE_MINT: 1};
const MAX_TRADE_AGE_MS = 600;

type Route = {
  market: Market;
  fromA: boolean;
  out: jsbi.default;
  tradeOutputOverride: null | {
    in: jsbi.default;
    estimatedOut: jsbi.default;
  };
  quote: any | null;
}[];

type Quote = { in: jsbi.default; out: jsbi.default, quotes: any | null };

type ArbIdea = {
  txn: VersionedTransaction;
  arbSize: jsbi.default;
  arbSizeDecimals: string;
  expectedProfit: jsbi.default;
  route: Route;
  timings: Timings;
};
const mintDecimals: any = {};
async function calculateRoute(
  route: Route,
  arbSize: jsbi.default,
  timeout: number,
): Promise<Quote> {
  const arbSizeString = arbSize.toString();
  const serializableRoute: SerializableRoute = [];
  for (const hop of route) {
    const sourceMint = hop.fromA
      ? hop.market.tokenMintA
      : hop.market.tokenMintB;
    const destinationMint = hop.fromA
      ? hop.market.tokenMintB
      : hop.market.tokenMintA;

    const tradeOutputOverride = hop.tradeOutputOverride
      ? {
          in: hop.tradeOutputOverride.in.toString(),
          estimatedOut: hop.tradeOutputOverride.estimatedOut.toString(),
        }
      : null;
    serializableRoute.push({
      sourceMint,
      destinationMint,
      amount: arbSizeString, // only matters for the first hop
      marketId: hop.market.id,
      tradeOutputOverride,
    });
  }
  const quote = await workerCalculateRoute(serializableRoute, timeout);
  if (quote === null) {
    return { in: arbSize, out: JSBI.BigInt(0), quotes: null };
  }
  return quote;
}

function getProfitForQuote(quote: Quote) {
  return JSBI.subtract(quote.out, quote.in);
}

async function* calculateArb(
  backrunnableTradesIterator: AsyncGenerator<BackrunnableTrade>,
): AsyncGenerator<ArbIdea> {
const acceptable = [
  "So11111111111111111111111111111111111111112",
  "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
]
for (const item of mrgnMetadata){
  if (!acceptable.includes(item.address)){
  // market to calculate usdc profit in sol
  if (!Object.keys(USDC_SOL_RATOs).includes(item.address)){
    const usdcToSolMkt = getMarketsForPair(
        NATIVE_MINT.toBase58(),
        item.address
    )[0];
    if (!usdcToSolMkt) {
      logger.debug(`Could not find market for ${NATIVE_MINT.toBase58()} and ${item.address}`);
      continue;
    }
    const big = JSBI.BigInt(1_000_000_000);
    const one = JSBI.BigInt(1);
    const divided = JSBI.multiply(big, JSBI.divide(one, JSBI.multiply(one, (((await calculateQuote(usdcToSolMkt.id, {

      sourceMint: NATIVE_MINT,
      destinationMint: new PublicKey(item.address),
      amount: JSBI.BigInt(LAMPORTS_PER_SOL),
      swapMode: SwapMode.ExactIn,
    },
    undefined,
    true,
  )
).outAmount)))));

    USDC_SOL_RATOs[item.address] = JSBI.toNumber(divided);
    }
  }
}
  // prioritize trades that are bigger as profit is esssentially bottlenecked by the trade size
  // for this compare the size of base token (sol or usdc). bcs they have diff amounts of decimals and value
  // normalize usdc by a factor
  const backrunnableTradesIteratorGreedyPrioritized = prioritize(
    backrunnableTradesIterator,
    (tradeA, tradeB) => {
      const tradeABaseMint = tradeA.baseIsTokenA
        ? tradeA.market.tokenMintA
        : tradeA.market.tokenMintB;
      const tradeBBaseMint = tradeB.baseIsTokenA
        ? tradeB.market.tokenMintA
        : tradeB.market.tokenMintB;
      const tradeAIsUsdc = !(tradeABaseMint === NATIVE_MINT.toBase58());
      const tradeBisUsdc = !(tradeBBaseMint === NATIVE_MINT.toBase58());
      const tradeASize = tradeA.baseIsTokenA
        ? tradeA.tradeSizeA
        : tradeA.tradeSizeB;
        let tradeASizeNormalized = tradeAIsUsdc
        ? tradeASize
        : tradeASize;
      if (Object.keys(USDC_SOL_RATOs).includes(tradeABaseMint)){
       tradeASizeNormalized = tradeAIsUsdc
        ? tradeASize * BigInt(USDC_SOL_RATOs[tradeABaseMint])
        : tradeASize;
      }
      const tradeBSize = tradeB.baseIsTokenA
        ? tradeB.tradeSizeA
        : tradeB.tradeSizeB;
      let tradeBSizeNormalized = tradeBisUsdc
        ? tradeBSize
        : tradeBSize;
        if (Object.keys(USDC_SOL_RATOs).includes(tradeBBaseMint)){
        tradeBSizeNormalized = tradeBisUsdc
        ? tradeBSize * BigInt(USDC_SOL_RATOs[tradeBBaseMint])
        : tradeBSize;
      }

      if (tradeASizeNormalized < tradeBSizeNormalized) {
        return 1;
      }
      if (tradeASizeNormalized > tradeBSizeNormalized) {
        return -1;
      }
      // a must be equal to b
      return 0;
    },
    HIGH_WATER_MARK,
  );
  for await (const {
    txn,
    market: originalMarket,
    baseIsTokenA,
    tradeDirection: originalTradeDirection,
    tradeSizeA,
    tradeSizeB,
    timings,
  } of backrunnableTradesIteratorGreedyPrioritized) {
    if (new Date().getTime() - timings.mempoolEnd > MAX_TRADE_AGE_MS) {
      logger.info(`Trade is too old, skipping`);
      continue;
    }

    const tradeSizeBase = JSBI.BigInt(
      (baseIsTokenA ? tradeSizeA : tradeSizeB).toString(),
    );
    const tradeSizeQuote = JSBI.BigInt(
      (baseIsTokenA ? tradeSizeB : tradeSizeA).toString(),
    );

    // calculate the arb calc step size and init initial arb size to it
    const stepSize = JSBI.divide(
      tradeSizeBase,
      JSBI.BigInt(ARB_CALCULATION_NUM_STEPS),
    );

    // ignore trade if minimum arb size is too small
    if (JSBI.equal(stepSize, JSBI.BigInt(0))) continue;

    // source mint is always usdc or sol
    const backrunSourceMint = baseIsTokenA
      ? originalMarket.tokenMintA
      : originalMarket.tokenMintB;

      
      
     
    const backrunIntermediateMint = baseIsTokenA
      ? originalMarket.tokenMintB
      : originalMarket.tokenMintA;

    // if they bought base (so usdc or sol) on the original market, it means there is less base now and more of the other token
    // which means the other token is now cheaper so we buy it first
    const buyOnOriginalMarketFirst = originalTradeDirection === 'BOUGHT_BASE';

    const marketsFor2HopBackrun = getMarketsForPair(
      backrunSourceMint,
      backrunIntermediateMint,
    );

    const marketsFor3HopBackrun = getAll2HopRoutes(
      buyOnOriginalMarketFirst ? backrunIntermediateMint : backrunSourceMint,
      buyOnOriginalMarketFirst ? backrunSourceMint : backrunIntermediateMint,
    );

    const arbRoutes: Route[] = [];

    // add 2 hop routes
    marketsFor2HopBackrun.forEach((m) => {
      const route: Route = [];
      if (buyOnOriginalMarketFirst) {
        route.push({
          market: originalMarket,
          fromA: baseIsTokenA,
          out: tradeSizeQuote,
          tradeOutputOverride: {
            in: tradeSizeBase,
            estimatedOut: tradeSizeQuote,
          },
          quote: null,
        });
        route.push({
          market: m,
          fromA: m.tokenMintA === backrunIntermediateMint,
          tradeOutputOverride: null,
          out: tradeSizeBase,
          quote: null,
        });
      } else {
        route.push({
          market: m,
          fromA: m.tokenMintA === backrunSourceMint,
          tradeOutputOverride: null,
          out: tradeSizeBase,
          quote: null,
        });
        route.push({
          market: originalMarket,
          fromA: !baseIsTokenA,
          out: tradeSizeQuote,
          tradeOutputOverride: {
            in: tradeSizeQuote,
            estimatedOut: tradeSizeBase,
          },
          quote: null,
        });
      }
      arbRoutes.push(route);
    });
    if (ARB_CALCULATION_NUM_STEPS > 2){
    // add 3 hop routes
    // shuffle bcs not all routes may go thru (calc takes too long)
    shuffle(marketsFor3HopBackrun);
    marketsFor3HopBackrun.forEach((m) => {
      const market1 = m.hop1;
      const market2 = m.hop2;
      const route: Route = [];

      if (buyOnOriginalMarketFirst) {
        const intermediateMint1 = backrunIntermediateMint;
        const intermediateMint2 =
          market1.tokenMintA === intermediateMint1
            ? market1.tokenMintB
            : market1.tokenMintA;
        route.push({
          market: originalMarket,
          fromA: baseIsTokenA,
          out: tradeSizeQuote,
          tradeOutputOverride: {
            in: tradeSizeBase,
            estimatedOut: tradeSizeQuote,
          },
          quote: null,
        });
        route.push({
          market: market1,
          out: tradeSizeBase,
          fromA: market1.tokenMintA === intermediateMint1,
          tradeOutputOverride: null,
          quote: null,
        });
        route.push({
          market: market2,
          out: tradeSizeQuote,
          fromA: market2.tokenMintA === intermediateMint2,
          tradeOutputOverride: null,
          quote: null,
        });
      } else {
        route.push({
          market: market1,
          out: tradeSizeBase,
          fromA: market1.tokenMintA === backrunSourceMint,
          tradeOutputOverride: null,
          quote: null,
        });
        const intermediateMint1 =
          market1.tokenMintA === backrunSourceMint
            ? market1.tokenMintB
            : market1.tokenMintA;
        route.push({
          market: market2,
          out: tradeSizeQuote,
          fromA: market2.tokenMintA === intermediateMint1,
          tradeOutputOverride: null,
          quote: null,
        });
        route.push({
          market: originalMarket,
          fromA: !baseIsTokenA,
          out: tradeSizeBase,
          tradeOutputOverride: {
            in: tradeSizeQuote,
            estimatedOut: tradeSizeBase,
          },
          quote: null,
        });
      }
      arbRoutes.push(route);
    });

    // remove all routes where a market appears twice bcs that makes no sense
    for (let i = arbRoutes.length - 1; i >= 0; i--) {
      const route = arbRoutes[i];
      const marketsInRoute = route.map((r) => r.market);
      const uniqueMarketsInRoute = new Set(marketsInRoute);
      if (uniqueMarketsInRoute.size !== marketsInRoute.length) {
        arbRoutes.splice(i, 1);
      }
    }

    logger.info(
      `Found ${arbRoutes.length} arb routes from ${marketsFor2HopBackrun.length} 2hop and ${marketsFor3HopBackrun.length} 3hop routes`,
    );
    }
    else {

    logger.info(
      `Found ${arbRoutes.length} arb routes from ${marketsFor2HopBackrun.length} 2hop routes`,
    );
    }
    
    const startCalculation = Date.now();

    // map of best quotes for each route
    const bestQuotes: Map<Route, Quote> = new Map();

    for (let i = 1; i <= ARB_CALCULATION_NUM_STEPS; i++) {
      let foundBetterQuote = false;
      if (Date.now() - startCalculation > MAX_ARB_CALCULATION_TIME_MS) {
        logger.info(
          `Arb calculation took too long, not stopping at iteration ${i}`,
        );
       break;
      }
      const arbSize = JSBI.multiply(stepSize, JSBI.BigInt(i));

      const quotePromises: Promise<Quote>[] = [];

      for (const route of arbRoutes) {
        const remainingCalculationTime =
          MAX_ARB_CALCULATION_TIME_MS - (Date.now() - startCalculation);
        const quotePromise = calculateRoute(
          route,
          arbSize,
          remainingCalculationTime,
        );
        quotePromises.push(quotePromise);
      }

      const quotes = await Promise.all(quotePromises);

      // backwards iteration so we can remove routes that fail or are worse than previous best
      for (let i = arbRoutes.length - 1; i >= 0; i--) {
        const quote = quotes[i];

        // some markets fail when arb size is too big
        if (JSBI.equal(quote.out, JSBI.BigInt(0))) {
          arbRoutes.splice(i, 1);
          continue;
        }

        const profit = getProfitForQuote(quote);
        const prevBestQuote = bestQuotes.get(arbRoutes[i]);
        const prevBestProfit = prevBestQuote
          ? getProfitForQuote(prevBestQuote)
          : JSBI.BigInt(0);

        if (JSBI.greaterThan(profit, prevBestProfit)) {
          arbRoutes[i].forEach((r) => {
            r.quote = quote.quotes
          })
          bestQuotes.set(arbRoutes[i], quote);
          foundBetterQuote = true;
        } else {
          arbRoutes.splice(i, 1);
        }
      }
      if (!foundBetterQuote) {
        break;
      }
    }

    // no quotes with positive profit found
    if (bestQuotes.size === 0) continue;

    logger.info(`Found ${bestQuotes.size} arb opportunities`);
   
    // find the best quote
    const [route, quote] = [...bestQuotes.entries()].reduce((best, current) => {
      const currentQuote = current[1];
     
      const currentProfit = getProfitForQuote(currentQuote);
      const bestQuote = best[1];
      const bestProfit = getProfitForQuote(bestQuote);
      if (JSBI.greaterThan(currentProfit, bestProfit)) {
        return current;
      } else {
        return best;
      }
    });
    const profit = getProfitForQuote(quote);
    const arbSize = quote.in;
    if (!Object.keys(mintDecimals).includes(backrunSourceMint)){
      const backrunSourceMintMint = await connection.getParsedAccountInfo(new PublicKey(backrunSourceMint));
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      const decimals = backrunSourceMintMint.value.data.parsed.info.decimals;
      mintDecimals[backrunSourceMint] = decimals;
    }
    const backrunSourceMintName = backrunSourceMint

    const profitDecimals = toDecimalString(profit.toString(), mintDecimals[backrunSourceMint]);
    const arbSizeDecimals = toDecimalString(arbSize.toString(), mintDecimals[backrunSourceMint]);


    const marketsString = route.reduce((acc, r) => {
      return `${acc} -> ${r.market.dexLabel}`;
    }, '');

    logger.info(
      `Potential arb: profit ${profitDecimals} ${backrunSourceMintName} on ${originalMarket.dexLabel} ::: BUY ${arbSizeDecimals} on ${marketsString} backrunning ${bs58.encode(txn.signatures[0])}`,
    );
    yield {
      txn,
      arbSize,
      arbSizeDecimals,
      expectedProfit: profit,
      route,
      timings: {
        mempoolEnd: timings.mempoolEnd,
        preSimEnd: timings.preSimEnd,
        simEnd: timings.simEnd,
        postSimEnd: timings.postSimEnd,
        calcArbEnd: new Date().getTime(),
        buildBundleEnd: 0,
        bundleSent: 0,
      },
    };
  }
}

export { calculateArb, ArbIdea };
