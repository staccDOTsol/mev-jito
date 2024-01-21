import { parentPort, workerData } from 'worker_threads';
import {
  Amm,
  RaydiumAmm,
  RaydiumClmm,
  SplTokenSwapAmm,
  WhirlpoolAmm,
} from '@jup-ag/core';
import { tritonConnection as connection } from '../clients/rpc.js';
import {
  AccountInfoMap,
  AccountUpdateParamPayload,
  AddPoolParamPayload,
  AmmCalcWorkerParamMessage,
  AmmCalcWorkerResultMessage,
  CalculateQuoteParamPayload,
  CalculateRouteParamPayload,
  DexLabel,
  GetSwapLegAndAccountsParamPayload,
  Quote,
  SerializableRoute,
  SerializableSwapLegAndAccounts,
  SerumMarketKeysString,
} from './types.js';
import { AccountInfo, PublicKey } from '@solana/web3.js';
import { logger as loggerOrig } from '../logger.js';
import { defaultImport } from 'default-import';
import jsbi from 'jsbi';
import {
  toAccountInfo,
  toQuoteParams,
  toSerializableAccountMeta,
  toSerializableJupiterQuote,
  toSwapParams,
} from './utils.js';
import { QuoteParams, SwapParams } from '@jup-ag/core/dist/lib/amm.js';
import { SwapMode } from '@jup-ag/common';
import axios  from 'axios'


const config = {
  method: 'get',
  maxBodyLength: Infinity,
  url: 'http://127.0.0.1:8080/quote',
  headers: { 
    'Accept': 'application/json'
  }
};

const JSBI = defaultImport(jsbi);

const workerId = workerData.workerId;

const logger = loggerOrig.child({ name: 'calc-worker' + workerId });

logger.debug('AmmCalcWorker started');

const pools: Map<string, Amm> = new Map();
const accountsForUpdateForPool: Map<string, string[]> = new Map();
const accountInfos: Map<string, AccountInfo<Buffer> | null> = new Map();
const ammsForAccount: Map<string, string[]> = new Map();
const ammIsInitialized: Map<string, boolean> = new Map();
const feeForAmm: Map<string, number> = new Map();

function addPool(
  poolLabel: DexLabel,
  id: string,
  accountInfo: AccountInfo<Buffer>,
  feeRateBps: number,
  serumParams?: SerumMarketKeysString,
) {
  try {
  let amm: Amm;
  logger.trace(`Adding pool ${id} with label ${poolLabel}`);
  switch (poolLabel) {
    case DexLabel.ORCA:
      amm = new SplTokenSwapAmm(new PublicKey(id), accountInfo, 'Orca');
      break;
    case DexLabel.ORCA_WHIRLPOOLS:
      amm = new WhirlpoolAmm(new PublicKey(id), accountInfo);
      break;
    case DexLabel.RAYDIUM:
      if (!serumParams)
        throw new Error('Serum params not provided for raydium pool');
      amm = new RaydiumAmm(new PublicKey(id), accountInfo, serumParams);
      break;
    case DexLabel.RAYDIUM_CLMM:
      amm = new RaydiumClmm(new PublicKey(id), accountInfo);
      break;
    default:
      throw new Error(`Unknown pool label: ${poolLabel}`);

  }
 
  pools.set(id, amm);
  const accountsForUpdateWithDuplicates = amm
    .getAccountsForUpdate()
    .map((a) => a.toBase58());
  const accountsForUpdate = Array.from(
    new Set(accountsForUpdateWithDuplicates),
  );
  const needsAccounts = accountsForUpdate.length > 0;
  ammIsInitialized.set(id, !needsAccounts);
  accountsForUpdateForPool.set(id, accountsForUpdate);
  accountsForUpdate.forEach((a) => {
    const amms = ammsForAccount.get(a) || [];
    amms.push(id);
    ammsForAccount.set(a, amms);
  });

  feeForAmm.set(id, feeRateBps);

  const message: AmmCalcWorkerResultMessage = {
    type: 'addPool',
    payload: {
      id,
      accountsForUpdate,
    },
  };

  parentPort.postMessage(message);
}
catch (err){

  const message: AmmCalcWorkerResultMessage = {
    type: 'addPool',
    payload: {
      id,
      accountsForUpdate: [],
    },
  };

  parentPort.postMessage(message);
}
}

function accountUpdate(
  address: string,
  accountInfo: AccountInfo<Buffer> | null,
) {
  logger.trace(`Updating account ${address}`);
  const previousAccountInfo = accountInfos.get(address);
  if (previousAccountInfo === undefined || accountInfo !== null) {
    accountInfos.set(address, accountInfo);
  } else {
    logger.trace(`Account ${address} not updated`);
  }

  const amms = ammsForAccount.get(address) || [];
  let error = false;
  for (const ammId of amms) {
    const amm = pools.get(ammId);
    const accountsForUpdate = accountsForUpdateForPool.get(ammId) || [];
    const accountInfoMap: AccountInfoMap = new Map();
    let hasNullAccountInfo = false;
    for (const accountForUpdate of accountsForUpdate) {
      const info = accountInfos.get(accountForUpdate);
      if (info !== undefined) accountInfoMap.set(accountForUpdate, info);
      if (info === null) hasNullAccountInfo = true;
    }
    if (accountInfoMap.size === accountsForUpdate.length) {
      try {
        amm.update(accountInfoMap);
        if (!hasNullAccountInfo) ammIsInitialized.set(ammId, true);
      } catch (e) {
        error = true;
        logger.info(`Error updating pool ${ammId}: ${e}`);
      }
    } else {
      logger.trace(
        `Not all accounts for update are available for pool ${ammId}`,
      );
    }
  }

  const message: AmmCalcWorkerResultMessage = {
    type: 'accountUpdate',
    payload: {
      id: address,
      error,
    },
  };

  parentPort.postMessage(message);
}

async function calulateQuote(id: string, params: QuoteParams) {
  logger.debug(`Calculating quote for pool ${id}`);
  const amm = pools.get(id);
  if (!amm) throw new Error(`Pool ${id} not found`);
  let message: AmmCalcWorkerResultMessage;

  try {
    // Assuming params and config are already defined and valid
    const queryParams = {
      amount: JSBI.toNumber(params.amount).toString(),
      sourceMint: params.sourceMint.toBase58(),
      destinationMint: params.destinationMint.toBase58(),
      swapMode: params.swapMode == SwapMode.ExactIn ? 'ExactIn' : 'ExactOut',
      slippageBps: "138",
      maxAccounts: "25",
                asLegacyTransaction: "true"
    };

    // Check if the base URL in config is valid and ends with a slash or not
    const baseUrl = config.url;

    // Construct the full URL with encoded query parameters
    const fullUrl = baseUrl + '?' + new URLSearchParams(queryParams).toString();
    const ourConfig = {
      ...config,
      url: fullUrl.replace('sourceMint', 'inputMint').replace('destinationMint', 'outputMint')
    };
    const quote = await(await axios.request(ourConfig)).data;
    if (quote === null || Object.keys(quote).length < 2) {
      console.log('no quote found')
      message = {
        type: 'calculateQuote',
        payload: {
          quote: null,
          error: 'No quote found'
        },
      };
    }
    else {
      logger.debug(`Quote for pool ${id}: ${JSON.stringify(quote)}`);
      const serializableQuote = toSerializableJupiterQuote(quote);

      message = {
        type: 'calculateQuote',
        payload: {
          quote: serializableQuote,
        },
      };
    }
  } catch (e) {
    logger.info(`Error calculating quote for pool ${id}: ${e}`);
    message = {
      type: 'calculateQuote',
      payload: {
        quote: null,
        error: e,
      },
    };
  }

  parentPort.postMessage(message);
}

async function calculateHop(amm: Amm, quoteParams: QuoteParams): Promise<Quote> {
  try {
    if (!ammIsInitialized.get(amm.id)) {
      const ammId = amm.id;
    const accountsForUpdate = accountsForUpdateForPool.get(ammId) || [];
    const accountInfoMap: AccountInfoMap = new Map();
    let hasNullAccountInfo = false;
    const infos = await connection.getMultipleAccountsInfo(accountsForUpdate.map((a) => new PublicKey(a)))
    for (const accountForUpdate of accountsForUpdate) {
      const info = infos[accountsForUpdate.indexOf(accountForUpdate)]
      if (info !== undefined) accountInfoMap.set(accountForUpdate, info);
      if (info === null) hasNullAccountInfo = true;
    }
    for (const accountForUpdate of accountsForUpdate) {
      accountInfos.set(accountForUpdate, infos[accountsForUpdate.indexOf(accountForUpdate)]);

      const info = accountInfos.get(accountForUpdate);
      
      if (info !== undefined) accountInfoMap.set(accountForUpdate, info);
      if (info === null) hasNullAccountInfo = true;
    }

    logger.debug(`Updating pool ${ammId}`);
    if (accountInfoMap.size === accountsForUpdate.length) {
      try {
        amm.update(accountInfoMap);
        if (!hasNullAccountInfo) ammIsInitialized.set(ammId, true);
      } catch (e) {
        logger.warn(`Error updating pool ${ammId}: ${e}`);
      }
    } else {
      logger.trace(
        `Not all accounts for update are available for pool ${ammId}`,
      );
      return { in: quoteParams.amount, out: JSBI.BigInt(0), quotes: null };

    }
  

    }
    const queryParams = {
      amount: quoteParams.amount.toString(),
      sourceMint: quoteParams.sourceMint.toBase58(),
      destinationMint: quoteParams.destinationMint.toBase58(),
      swapMode: quoteParams.swapMode == SwapMode.ExactIn ? 'ExactIn' : 'ExactOut',
      slippageBps: "138",
      maxAccounts: "25",
                asLegacyTransaction: "true"
    };
    logger.debug(`Calculating quote for pool ${amm.id}`);
    logger.debug(queryParams)

    // Check if the base URL in config is valid and ends with a slash or not
    const baseUrl = config.url;

    // Construct the full URL with encoded query parameters
    const fullUrl = baseUrl + '?' + new URLSearchParams(queryParams).toString();
    const ourConfig = {
      ...config,
      url: fullUrl.replace('sourceMint', 'inputMint').replace('destinationMint', 'outputMint')
    };
    logger.debug(`Calculating quote for pool ${amm.id}`);
    const jupQuote = await(await axios.request(ourConfig)).data;
    if (jupQuote === null) {
      return { in: quoteParams.amount, out: JSBI.BigInt(0), quotes: null };
    }
    logger.debug(`Quote for pool ${amm.id}: ${JSON.stringify(jupQuote)}`);
    const quote = { in: jupQuote.inAmount, out: jupQuote.outAmount, quotes: jupQuote };

    return quote;
  } catch (e) {
    logger.debug(`Error calculating quote for pool ${amm.id}: ${e}`);
    for (const address of [quoteParams.destinationMint, quoteParams.sourceMint]) {
      const amms = ammsForAccount.get(address.toBase58()) || [];
      for (const ammId of amms) {
        const amm = pools.get(ammId);
        const accountsForUpdate = accountsForUpdateForPool.get(ammId) || [];
        const accountInfoMap: AccountInfoMap = new Map();
        let hasNullAccountInfo = false;
        for (const accountForUpdate of accountsForUpdate) {
          const info = accountInfos.get(accountForUpdate);
          if (info !== undefined) accountInfoMap.set(accountForUpdate, info);
          if (info === null) hasNullAccountInfo = true;
        }
        if (accountInfoMap.size === accountsForUpdate.length) {
          try {
            amm.update(accountInfoMap);
            if (!hasNullAccountInfo) ammIsInitialized.set(ammId, true);
          } catch (e) {
            logger.warn(`Error updating pool ${ammId}: ${e}`);
          }
        } else {
          logger.trace(
            `Not all accounts for update are available for pool ${ammId}`,
          );
        }

      }
    }
    return { in: quoteParams.amount, out: JSBI.BigInt(0), quotes: null };
  }
}

async function calculateRoute(route: SerializableRoute) {
  logger.debug(route, `Calculating route`);
  let amount = Number(route[0].amount);
  let amount2 = JSBI.BigInt(route[0].amount);
  let firstIn = null;
  const quotes: any = [];
  for (const hop of route) {
    logger.debug(hop)
    if (hop.tradeOutputOverride !== null) {
      const tradeOutputOverride = hop.tradeOutputOverride;
      const overrideInputAmount = Number(tradeOutputOverride.in);
      const overrideOutputAmountWithoutFees = Number(
        tradeOutputOverride.estimatedOut,
      );

      // subtract fees in both directions (the original trade & the backrun trade)
      const fee = feeForAmm.get(hop.marketId) * 2;
      const overrideOutputAmount = (
        overrideOutputAmountWithoutFees - 
        (
          (overrideOutputAmountWithoutFees * (fee)) / 
          (10000)
        )
      );

      if (!firstIn) firstIn = amount2;

      const scalingFactor = (10000);

      // Scale the amounts before the calculation
      // If overrideOutputAmount is significantly larger than overrideInputAmount and amount is small,
      // the result of JSBI.multiply(amount, overrideOutputAmount) can be significantly smaller than overrideInputAmount.
      const scaledAmount = amount * scalingFactor;
      const scaledOverrideOutputAmount = (
        overrideOutputAmount * 
        scalingFactor
      );

      // Calculate the output for the current input amount based on the same ratio as the override
      amount =
        (scaledAmount * scaledOverrideOutputAmount) /
        (overrideInputAmount * scalingFactor),
      

      // Scale the result back down after the calculation
      amount = (amount / scalingFactor);
      amount2 = JSBI.BigInt(Math.floor(amount));
    }
    const quoteParams: QuoteParams = {
      amount: amount2,
      swapMode: SwapMode.ExactIn,                                                                         
      sourceMint: new PublicKey(hop.sourceMint),
      destinationMint: new PublicKey(hop.destinationMint),
    };
    const amm = pools.get(hop.marketId);
    const quote = await calculateHop(amm, quoteParams);
    quotes.push(quote.quotes)
    amount2 = typeof quote.out === 'number' ? JSBI.BigInt(quote.out) : quote.out;
    amount = typeof quote.out !== 'number' ? Number(quote.out.toString()) : quote.out;
    if (!firstIn)
    if (!firstIn) firstIn = quote.in;
    if (JSBI.equal(amount2, JSBI.BigInt(0))) break;
  }

  const message: AmmCalcWorkerResultMessage = {
    type: 'calculateRoute',
    payload: {
      quote: { in: firstIn.toString(), out: amount2.toString(), quotes: quotes }
    },
  };

  parentPort.postMessage(message);
}

function getSwapLegAndAccounts(id: string, params: SwapParams) {
  const amm = pools.get(id);
  if (!amm) throw new Error(`Pool ${id} not found`);
  const [legs, accounts] = amm.getSwapLegAndAccounts(params);

  const serializableSwapLegAndAccounts: SerializableSwapLegAndAccounts = [
    legs,
    accounts.map(toSerializableAccountMeta),
  ];

  const message: AmmCalcWorkerResultMessage = {
    type: 'getSwapLegAndAccounts',
    payload: {
      swapLegAndAccounts: serializableSwapLegAndAccounts,
    },
  };

  parentPort.postMessage(message);

}

parentPort.on('message', (message: AmmCalcWorkerParamMessage) => {
  switch (message.type) {
    case 'addPool': {
      const {
        poolLabel,
        id,
        serializableAccountInfo,
        feeRateBps,
        serumParams,
      } = message.payload as AddPoolParamPayload;
      const accountInfo = toAccountInfo(serializableAccountInfo);
      addPool(poolLabel, id, accountInfo, feeRateBps, serumParams);
      break;
    }
    case 'accountUpdate': {
      const { id, accountInfo } = message.payload as AccountUpdateParamPayload;
      const accountInfoParsed = accountInfo ? toAccountInfo(accountInfo) : null;
      accountUpdate(id, accountInfoParsed);
      break;
    }
    case 'calculateQuote': {
      const { id, params } = message.payload as CalculateQuoteParamPayload;
      const quoteParams = toQuoteParams(params);
      calulateQuote(id, quoteParams);
      break;
    }
    case 'getSwapLegAndAccounts': {
      const { id, params } =
        message.payload as GetSwapLegAndAccountsParamPayload;
      const swapParams = toSwapParams(params);
      getSwapLegAndAccounts(id, swapParams);
      break;
    }
    case 'calculateRoute': {
      const { route } = message.payload as CalculateRouteParamPayload;
      calculateRoute(route);
      break;
    }
  }
});
