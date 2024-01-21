import { RpcResponseAndContext, VersionedTransaction } from '@solana/web3.js';
import EventEmitter from 'events';
import { logger } from './logger.js';
import { connection } from './clients/rpc.js';
import { SimulatedBundleResponse } from 'jito-ts';
import { FilteredTransaction } from './pre-simulation-filter.js';
import { Timings } from './types.js';
import { Queue } from '@datastructures-js/queue';

const MAX_SIMULATION_AGE_MS = 333;
const MAX_PENDING_SIMULATIONS = 666;
const RECEIVED_SIMULATION_RESULT_EVENT = 'receivedSimulationResult';

type SimulationResult = {
  txn: VersionedTransaction;
  response: RpcResponseAndContext<SimulatedBundleResponse>;
  accountsOfInterest: string[];
  timings: Timings;
};

let pendingSimulations = 0;

const simulationResults: Queue<{
  txn: VersionedTransaction;
  response: RpcResponseAndContext<SimulatedBundleResponse> | null;
  accountsOfInterest: string[];
  timings: Timings;
}> = new Queue();

async function sendSimulations(
  txnIterator: AsyncGenerator<FilteredTransaction>,
  eventEmitter: EventEmitter,
) {
  for await (const { txn, accountsOfInterest, timings } of txnIterator) {
    if (pendingSimulations > MAX_PENDING_SIMULATIONS) {
      logger.warn(
        'dropping txn due to high pending simulation count: ' +
          pendingSimulations,
      );
      continue;
    }
    // using jito-solana simulateBundle because unlike simulateTransaction
    // it returns the before AND after account states
    // we need both to find out the trade size and direction
    const sim = connection.simulateBundle([txn], {
      preExecutionAccountsConfigs: [
        { addresses: accountsOfInterest, encoding: 'base64' },
      ],
      postExecutionAccountsConfigs: [
        { addresses: accountsOfInterest, encoding: 'base64' },
      ],
      simulationBank: 'tip',
    });
    pendingSimulations += 1;

    sim
      .then((res) => {
        simulationResults.push({
          txn,
          response: res,
          accountsOfInterest,
          timings,
        });
        pendingSimulations -= 1;
        eventEmitter.emit(RECEIVED_SIMULATION_RESULT_EVENT);
      })
      .catch((e) => {
        logger.error(e);
        simulationResults.push({
          txn,
          response: null,
          accountsOfInterest,
          timings,
        });
        pendingSimulations -= 1;
        eventEmitter.emit(RECEIVED_SIMULATION_RESULT_EVENT);
      });
    }
}

async function* simulate(
  txnIterator: AsyncGenerator<FilteredTransaction>,
): AsyncGenerator<SimulationResult> {
  const eventEmitter = new EventEmitter();
  sendSimulations(txnIterator, eventEmitter);

  while (true) {
    if (simulationResults.size() === 0) {
      await new Promise((resolve) =>
        eventEmitter.once(RECEIVED_SIMULATION_RESULT_EVENT, resolve),
      );
    }

    const { txn, response, accountsOfInterest, timings } =
      simulationResults.dequeue();
    logger.debug(`Simulation took ${new Date().getTime() - timings.preSimEnd}ms`);
    const txnAge = new Date().getTime() - timings.mempoolEnd;

    if (txnAge > MAX_SIMULATION_AGE_MS) {
      logger.debug(`hehe not dropping slow simulation - age: ${txnAge}ms`);
      continue
    }
    if (response === null) {
      continue;
    }
    if (response.value.transactionResults.length > 0) {
      yield {
        txn,
        response,
        accountsOfInterest,
        timings: {
          mempoolEnd: timings.mempoolEnd,
          preSimEnd: timings.preSimEnd,
          simEnd: new Date().getTime(),
          postSimEnd: 0,
          calcArbEnd: 0,
          buildBundleEnd: 0,
          bundleSent: 0,
        },
      };
    }
    else {
      /*

  const addressTableLookupsAccountKeys = txn.message.addressTableLookups.map((lookup) => lookup.accountKey);

  const lookupTableAccounts = await Promise.all(
    addressTableLookupsAccountKeys.map(
      async (key) => await connection.getAddressLookupTable(key).then((res) => res.value)
    )
  );
  if (!(lookupTableAccounts.length > 0)) {
    console.log("No lookup table accounts found.");
  }

      const txMessageDecompiled = TransactionMessage.decompile(txn.message, {
      addressLookupTableAccounts: lookupTableAccounts,
    });
      const ixs = txMessageDecompiled.instructions;
      console.log(...ixs)
      */
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
    //  console.log(response.value.summary.failed.error.TransactionFailure);
    
    }
  }
}

export { simulate, SimulationResult };
