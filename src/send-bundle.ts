import { Arb, getMarginfiClient } from './build-bundle.js';
import { searcherClient } from './clients/jito.js';
import { logger } from './logger.js';
import { Bundle as JitoBundle } from 'jito-ts/dist/sdk/block-engine/types.js';
import bs58 from 'bs58';
import { connection } from './clients/rpc.js';
import * as fs from 'fs';
import { stringify } from 'csv-stringify';
import { PublicKey } from '@solana/web3.js';
import { MarginfiAccountWrapper } from "mrgn-ts";
import * as anchor from "@coral-xyz/anchor";
import { config } from './config.js';
import { Keypair } from '@solana/web3.js';
import { Token } from '@solana/spl-token';
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID } from '@solana/spl-token-3';
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

const payer = Keypair.fromSecretKey(
  Uint8Array.from(
    JSON.parse(fs.readFileSync(config.get('payer_keypair_path'), 'utf-8')),
  )
);
const wallet = new anchor.Wallet(payer);
const provider = new anchor.AnchorProvider(connection, wallet, {});

const client = await getMarginfiClient({readonly: true, authority: new PublicKey("7ihN8QaTfNoDTRTQGULCzbUT3PHwPDTu5Brcu4iT2paP"), provider, wallet});

console.log(`Using ${client.config.environment} environment; wallet: ${client.wallet.publicKey.toBase58()}`);
async function processCompletedTrade(uuid: string) {
  const trade = bundlesInTransit.get(uuid);

  const txn0Signature = bs58.encode(trade.bundle[0].signatures[0]);

  const txn1 = await connection
    .getTransaction(txn0Signature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 10,
    })
    .then(async (_txn) => {
        try {

          const hop0SourceMint = trade.sourceMint.toString();
          const marginfiAccount = await MarginfiAccountWrapper.fetch("EW1iozTBrCgyd282g2eemSZ8v5xs7g529WFv4g69uuj2", client);
          const mint = new PublicKey(hop0SourceMint);
          const ata = await Token.getAssociatedTokenAddress(
            ASSOCIATED_TOKEN_PROGRAM_ID,
            TOKEN_PROGRAM_ID,
            mint,
            payer.publicKey,
          );
          const ataBalance = await connection.getTokenAccountBalance(ata);
          const solBank = client.getBankByMint(mint);
          if (solBank) {
           await marginfiAccount.withdraw(Number(ataBalance.value.uiAmount), solBank.address);
           // await sleep 15s 
            await new Promise(r => setTimeout(r, 15000));
            
            const destinationAta = await Token.getAssociatedTokenAddress(
              ASSOCIATED_TOKEN_PROGRAM_ID,
              TOKEN_PROGRAM_ID,
              mint,
              new PublicKey("CaXvt6DsYGZevj7AmVd5FFYboyd8vLAEioPaQ7qbydMb")
            );

            const tokenBalanceAfter = await connection.getTokenAccountBalance(ata);
            // transfer to CaXvt6DsYGZevj7AmVd5FFYboyd8vLAEioPaQ7qbydMb
            const transferIx = Token.createTransferInstruction(
              TOKEN_PROGRAM_ID,
              ata,
              destinationAta,
              payer.publicKey,
              [],
             parseInt(tokenBalanceAfter.value.amount))
             const tx = new anchor.web3.Transaction().add(transferIx);
             tx.feePayer = payer.publicKey;
             tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
            await provider.sendAndConfirm(tx);
          }
        }
        catch (e){
            console.log(e);
        }
    })
    .catch(() => {
      logger.info(
        `getTransaction failed. Assuming txn2 ${txn0Signature} did not land`,
      );
      return null;
    });

  if (txn1 !== null) {
    trade.landed = true;
  }

  const tradeCsv: TradeCSV = {
    timestamp: new Date().getTime(),
    uuid,
    landed: trade.landed,
    accepted: trade.accepted,
    rejected: trade.rejected,
    errorType: trade.errorType,
    errorContent: trade.errorContent,
    txn0Signature,
    txn1Signature: txn0Signature,
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
      console.log(bundleResult)
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
    const now = new Date().getTime();
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
        const tradeCsv: TradeCSV = {
          timestamp: new Date().getTime(),
          uuid: '',
          landed: false,
          accepted: 0,
          rejected: true,
          errorType: 'sendingError',
          errorContent: JSON.stringify(error),
          txn0Signature,
          txn1Signature,
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
