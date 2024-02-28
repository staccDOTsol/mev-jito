import {
  AddressLookupTableAccount,
  MessageAccountKeys,
  VersionedTransaction,
} from '@solana/web3.js';

import { logger } from './logger.js';
import { lookupTableProvider } from './lookup-table-provider.js';
import { isTokenAccountOfInterest } from './markets/index.js';
import { MempoolUpdate } from './mempool.js';
import { Timings } from './types.js';
import { dropBeyondHighWaterMark } from './utils.js';

const SKIP_TX_IF_CONTAINS_ADDRESS = [
  '882DFRCi5akKFyYxT4PP2vZkoQEGvm2Nsind2nPDuGqu', // orca whirlpool mm whose rebalancing txns mess with the calc down the line and is no point in backrunning
];

const HIGH_WATER_MARK = 2500;

type FilteredTransaction = {
  txn: VersionedTransaction;
  accountsOfInterest: string[];
  timings: Timings;
};

async function* preSimulationFilter(
  mempoolUpdates: AsyncGenerator<MempoolUpdate>,
): AsyncGenerator<FilteredTransaction> {
  const mempoolUpdatesGreedy = dropBeyondHighWaterMark(
    mempoolUpdates,
    HIGH_WATER_MARK,
    'mempoolUpdates',
  );

  for await (const { txns, timings } of mempoolUpdatesGreedy) {
    for (const txn of txns) {
      const addressLookupTableAccounts: AddressLookupTableAccount[] = [];

      for (const lookup of txn.message.addressTableLookups) {
        const lut = await lookupTableProvider.getLookupTable(lookup.accountKey);
        if (lut === null) {
          break;
        }
        addressLookupTableAccounts.push(lut);
      }

      let accountKeys: MessageAccountKeys | null = null;
      try {
        accountKeys = txn.message.getAccountKeys({
          addressLookupTableAccounts,
        });
        if (new Set(accountKeys.keySegments().flat()).size > 64) {
        //logger.debug('skipping tx with too many accounts: ' + accountKeys.length)
       // break
      }
      } catch (e) {
        logger.warn(e, 'address not in lookup table');
      }
      const accountsOfInterest = new Set<string>();

      let skipTx = false;
      if (accountKeys != null){
      for (const key of accountKeys.keySegments().flat()) {
        const keyStr = key.toBase58();
        if (SKIP_TX_IF_CONTAINS_ADDRESS.includes(keyStr)) {
          skipTx = true;
          break;
        }
        if (isTokenAccountOfInterest(keyStr)) {
          accountsOfInterest.add(keyStr);
        }
      }
    }
      if (skipTx) continue;
      if (accountsOfInterest.size === 0) continue;

      logger.debug(
        `Found txn with ${accountsOfInterest.size} accounts of interest`,
      );
      yield {
        txn,
        accountsOfInterest: [...accountsOfInterest],
        timings: {
          mempoolEnd: timings.mempoolEnd,
          preSimEnd: Date.now(),
          simEnd: 0,
          postSimEnd: 0,
          calcArbEnd: 0,
          buildBundleEnd: 0,
          bundleSent: 0,
        },
      };
    }
  }
}

export { FilteredTransaction, preSimulationFilter };
