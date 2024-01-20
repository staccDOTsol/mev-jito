import {
  VersionedTransaction,
} from '@solana/web3.js';
import { prioritize } from './utils.js';
import { logger } from './logger.js';
import { isTokenAccountOfInterest } from './markets/index.js';
import { MempoolUpdate } from './mempool.js';
import { Timings } from './types.js';
import { lookupTableProvider } from './lookup-table-provider.js';
import { config } from './config.js';

const SKIP_TX_IF_CONTAINS_ADDRESS = [
  '882DFRCi5akKFyYxT4PP2vZkoQEGvm2Nsind2nPDuGqu', // orca whirlpool mm whose rebalancing txns mess with the calc down the line and is no point in backrunning
];

const HIGH_WATER_MARK = 450 * config.get('num_worker_threads')

type FilteredTransaction = {
  txn: VersionedTransaction;
  accountsOfInterest: string[];
  timings: Timings;
};

async function* preSimulationFilter(
  mempoolUpdates: AsyncGenerator<MempoolUpdate>,
): AsyncGenerator<FilteredTransaction> {
  const mempoolUpdatesGreedy = prioritize(
    mempoolUpdates,
    // prioritize the newest txns
    (a, b) => b.timings.mempoolEnd - a.timings.mempoolEnd,
    HIGH_WATER_MARK,
  );

  for await (const { txns, timings } of mempoolUpdatesGreedy) {
    for (const txn of txns) {
    

      for (const lookup of txn.message.addressTableLookups) {
        await lookupTableProvider.getLookupTable(lookup.accountKey);
        
      }
      const  accountKeys = txn.message.staticAccountKeys;
    
      const accountsOfInterest = new Set<string>();

      let skipTx = false;
      if (accountKeys.flat().length > 64) {
        skipTx = true;
        console.log('skipping tx with too many accounts: ' + accountKeys.flat().length)
        break
      }
      for (const key of accountKeys.flat()) {
        const keyStr = key.toBase58();
        if (SKIP_TX_IF_CONTAINS_ADDRESS.includes(keyStr)) {
          skipTx = true;
          break;
        }
        if (isTokenAccountOfInterest(keyStr)) {
          accountsOfInterest.add(keyStr);
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
          preSimEnd: new Date().getTime(),
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
