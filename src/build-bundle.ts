import {
  AddressLookupTableAccount,
  AddressLookupTableProgram,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import { prices } from './calculate-arb.js';
import { ArbIdea } from './calculate-arb.js';
import * as fs from 'fs';
import { config } from './config.js';
import * as Token from '@solana/spl-token-3';
import { connection } from './clients/rpc.js';
import { SwapMode } from '@jup-ag/common';

import jsbi from 'jsbi';
import { defaultImport } from 'default-import';
import * as anchor from '@coral-xyz/anchor';
import { logger } from './logger.js';
import { Timings } from './types.js';
import { lookupTableProvider } from './lookup-table-provider.js';

import { MarginfiAccountWrapper } from "mrgn-ts";

import { MarginfiClient, getConfig } from "mrgn-ts";
import axios from 'axios';
import fetch from 'node-fetch';
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

console.log(`Using ${client.config.environment} environment; wallet: ${client.wallet.publicKey.toBase58()}`);

const marginfiAccount = await MarginfiAccountWrapper.fetch("EW1iozTBrCgyd282g2eemSZ8v5xs7g529WFv4g69uuj2", client);
const JSBI = defaultImport(jsbi);


const TIP_ACCOUNTS = [
  '96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5',
  'HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe',
  'Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY',
  'ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49',
  'DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh',
  'ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt',
  'DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL',
  '3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT',
].map((pubkey) => new PublicKey(pubkey));

const getRandomTipAccount = () =>
  TIP_ACCOUNTS[Math.floor(Math.random() * TIP_ACCOUNTS.length)];



const config2 = {
  method: 'get',
  maxBodyLength: Infinity,
  url: 'http://127.0.0.1:8080/quote',
  headers: { 
    'Accept': 'application/json'
  }
};
type Arb = {
  bundle: VersionedTransaction[];
  arbSize: jsbi.default;
  expectedProfit: jsbi.default;
  hop1Dex: string;
  hop2Dex: string;
  hop3Dex: string;
  sourceMint: PublicKey;
  intermediateMint1: PublicKey;
  intermediateMint2: PublicKey | null;
  tipLamports: jsbi.default;
  timings: Timings;
};

async function* buildBundle(
  arbIdeaIterator: AsyncGenerator<ArbIdea>,
): AsyncGenerator<Arb> {
  for await (const {
    txn,
    arbSize,
    expectedProfit,
    route,
    timings,
  } of arbIdeaIterator) {
    const hop0 = route[0];
    const hop0SourceMint = new PublicKey(
      hop0.fromA ? hop0.market.tokenMintA : hop0.market.tokenMintB,
    );


    
    const solBank = client.getBankByMint(new PublicKey(hop0SourceMint));
    if (!solBank) {
         logger.info("SOL bank not found");
        continue
    }
    let profitInDollars: any
    if (hop0SourceMint.toBase58() != ("So11111111111111111111111111111111111111112")){
const params ={
  sourceMint: hop0SourceMint,
  destinationMint: new PublicKey("So11111111111111111111111111111111111111112"),
  amount: arbSize,
  swapMode: SwapMode.ExactIn}
    // Assuming params and config are already defined and valid
    const queryParams = {
      amount: JSBI.toNumber(params.amount).toString(),
      sourceMint: params.sourceMint.toBase58(),
      destinationMint: params.destinationMint.toBase58(),
      swapMode: params.swapMode == SwapMode.ExactIn ? 'ExactIn' : 'ExactOut',
      slippageBps: "100",
      maxAccounts: "24",
                asLegacyTransaction: "true"
    };

    // Check if the base URL in config is valid and ends with a slash or not
    const baseUrl = config2.url;
    const fullUrl = baseUrl + '?' + new URLSearchParams(queryParams).toString();

    const ourConfig = {
      ...config2,
      url: fullUrl.replace('sourceMint', 'inputMint').replace('destinationMint', 'outputMint')
    };
     profitInDollars = await(await axios.request(ourConfig)).data;

      console.log(profitInDollars)
  }
  else {
    profitInDollars = {outAmount: (expectedProfit.toString())}
  }
      if (Number(profitInDollars.outAmount) / LAMPORTS_PER_SOL < (0.01)/*0.01*/){ 



        // in magickland prod we never ever trade for a fraction of a penny.



      logger.error("not enuff monies avoiding rl")
      logger.error(profitInDollars)
      logger.error(expectedProfit)
      logger.error(prices[hop0SourceMint.toBase58()])
      continue;
      }
      const profitInLamports = Math.ceil(((Number(profitInDollars.outAmount) * (Math.random() * 0.666 + 0.32))))

try {
  (await
        Token.getOrCreateAssociatedTokenAccount(connection, payer, hop0SourceMint, payer.publicKey)).address
} catch (err){

  console.log(err)
  continue
}
    const intermediateMints: PublicKey[] = [];
    intermediateMints.push(
      new PublicKey(
        hop0.fromA ? hop0.market.tokenMintB : hop0.market.tokenMintA,
      ),
    );
    if (route.length > 2) {
      intermediateMints.push(
        new PublicKey(
          route[1].fromA
            ? route[1].market.tokenMintB
            : route[1].market.tokenMintA,
        ),
      );
    }

    intermediateMints.forEach(async (mint) => {
      try {
        await
          Token.getOrCreateAssociatedTokenAccount(connection, payer, mint, payer.publicKey)
  } catch (err){
    console.log(err)
  }
    });

const jupiterIxns: any[] = []
let quote: any | undefined = undefined
const selectedTables: AddressLookupTableAccount[]=[]
for (const hop of route){
const sourceMint = new PublicKey(
        hop.fromA ? hop.market.tokenMintA : hop.market.tokenMintB,
      );
      const destinationMint = new PublicKey(
        hop.fromA ? hop.market.tokenMintB : hop.market.tokenMintA,  
      );

    // Assuming params and config are already defined and valid
    const queryParams = {
      amount: quote == undefined ? JSBI.toNumber(arbSize).toString() : quote.outAmount.toString(),
      sourceMint: sourceMint.toBase58(),
      destinationMint: destinationMint.toBase58(),
      swapMode: 'ExactIn' ,
      slippageBps: "238",
      maxAccounts: "42",
                asLegacyTransaction: "false"
    };

    // Check if the base URL in config is valid and ends with a slash or not
    const baseUrl = config2.url;
    const fullUrl = baseUrl + '?' + new URLSearchParams(queryParams).toString();

    const ourConfig = {
      ...config2,
      url: fullUrl.replace('sourceMint', 'inputMint').replace('destinationMint', 'outputMint')
    };
     const quote1 = await(await axios.request(ourConfig)).data;
      quote = quote1 
        const instructions: any = await (
            await fetch('http://127.0.0.1:8080/swap-instructions', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                // quoteResponse from /quote api
                quoteResponse: quote1,
                userPublicKey: payer.publicKey.toBase58(),
                skipUserAccountsRpcCalls: false,
                restrictIntermediateTokens: true,
                asLegacyTransaction: false,
                useSharedAccounts: true
              })
            })
          ).json();
          
          const {
            //tokenLedgerInstruction, // If you are using `useTokenLedger = true`.
            //computeBudgetInstructions, // The necessary instructions to setup the compute budget.
            //setupInstructions, // Setup missing ATA for the users.
            swapInstruction, // The actual swap instruction.
            //cleanupInstruction, // Unwrap the SOL if `wrapAndUnwrapSol = true`.
            addressLookupTableAddresses, // The lookup table addresses that you can use if you are using versioned transaction.
          } = instructions;
         
          jupiterIxns.push(new TransactionInstruction({
            programId: new PublicKey(swapInstruction.programId),
            keys: swapInstruction.accounts.map((key) => ({
              pubkey: new PublicKey(key.pubkey),
              isSigner: key.isSigner,
              isWritable: key.isWritable,
            })),
            data: Buffer.from(swapInstruction.data, "base64"),
          }));
          for (const lut of addressLookupTableAddresses){
            selectedTables.push( await lookupTableProvider.getLookupTable(new PublicKey(lut)) );
          }
        }

        if (jupiterIxns.length < 2){
          continue
        }

    const instructionsMain: TransactionInstruction[] = [];

      const override_banks:     Map<string, any> = new Map();

      override_banks.set(solBank.address.toBase58(), solBank);
      const [repayIx, endFlashLoanIx, borrowIx] = await Promise.all([
        marginfiAccount.makeRepayIx(JSBI.toNumber(arbSize)  / ( 10 ** solBank.mintDecimals ),
  
      solBank.address, true
      ),
        marginfiAccount.makeEndFlashLoanIx(override_banks),
        marginfiAccount.makeBorrowIx(JSBI.toNumber(arbSize)  / ( 10 ** solBank.mintDecimals ), solBank.address)
      ]);
      instructionsMain.push(...borrowIx.instructions);
        

    instructionsMain.push(...jupiterIxns);

  instructionsMain.push(...repayIx.instructions);

  const endIndex = instructionsMain.length + 1;

  const beginFlashLoanIx = await marginfiAccount.makeBeginFlashLoanIx(endIndex);
  // eslint-disable-next-line prefer-const
  



    const addressesMain: PublicKey[] = [];
    const ixs = [
      //...(await marginfiAccount.makeDepositIx((1 / solBank.mintDecimals ** 10), solBank.address)).instructions,
      ...beginFlashLoanIx.instructions,
      ...instructionsMain,
      ...endFlashLoanIx.instructions,
    ]
    const tipIxn = SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey: getRandomTipAccount(),
      lamports: profitInLamports
    });
    ixs.push(tipIxn);

    ixs.forEach((ixn) => {
      ixn.keys.forEach((key) => {
        addressesMain.push(key.pubkey);
      });
    });
    
    const MIN_ADDRESSES_TO_INCLUDE_TABLE = 2;
    const MAX_TABLE_COUNT = 25 + selectedTables.length;

    const startCalc = Date.now();

    const addressSet = new Set<string>();
    const tableIntersections = new Map<string, number>();
    const remainingAddresses = new Set<string>();
    let numAddressesTakenCareOf = 0;

    for (const address of addressesMain) {
      const addressStr = address.toBase58();

      if (addressSet.has(addressStr)) continue;
      addressSet.add(addressStr);

      const tablesForAddress =
      lookupTableProvider.lookupTablesForAddress.get(addressStr) || new Set();

      if (tablesForAddress.size === 0) continue;

      remainingAddresses.add(addressStr);

      for (const table of tablesForAddress) {
        const intersectionCount = tableIntersections.get(table) || 0;
        tableIntersections.set(table, intersectionCount + 1);
      }
    }

    const sortedIntersectionArray = Array.from(
      tableIntersections.entries(),
    ).sort((a, b) => b[1] - a[1]);
      let serializedMsg;
    for (const [lutKey, intersectionSize] of sortedIntersectionArray) {
      if (intersectionSize < MIN_ADDRESSES_TO_INCLUDE_TABLE) break;
      if (selectedTables.length >= MAX_TABLE_COUNT) break;
      if (remainingAddresses.size <= 1) break;

      const lutAddresses = lookupTableProvider.addressesForLookupTable.get(lutKey);

      const addressMatches = new Set(
        [...remainingAddresses].filter((x) => lutAddresses.has(x)),
      );

      if (addressMatches.size >= MIN_ADDRESSES_TO_INCLUDE_TABLE) {
        selectedTables.push(lookupTableProvider.lookupTables.get(lutKey));
        for (const address of addressMatches) {
          remainingAddresses.delete(address);
          numAddressesTakenCareOf++;
        }
        logger.info(selectedTables.length);
        const setSelectedTables = new Set(selectedTables);
        const arraySetSelectedTables = Array.from(setSelectedTables);
        const messageMain = new TransactionMessage({
          payerKey: payer.publicKey,
          recentBlockhash: txn.message.recentBlockhash,
          instructions: ixs,
        }).compileToV0Message(arraySetSelectedTables as AddressLookupTableAccount[])
        const txMain = new VersionedTransaction(messageMain);
        txMain.sign([payer]);
        try {
          serializedMsg = txMain.serialize();
          logger.info(serializedMsg.length)
          if (serializedMsg.length < 1232) {
            logger.info('tx is small enough; sending');
            break;
          }
        }
        catch (e) {
          logger.error(e, 'error signing txMain');
        }
      }
    }

    logger.info(
      `Reduced ${addressSet.size} different addresses to ${
        selectedTables.length
      } lookup tables from ${sortedIntersectionArray.length} (${
        lookupTableProvider.lookupTables.size
      }) candidates, with ${
        addressSet.size - numAddressesTakenCareOf
      } missing addresses in ${new Date().getTime() - startCalc}ms.`,
    );

    if (addressSet.size - numAddressesTakenCareOf > 2 && serializedMsg.length > 1232){
      let noneed = false;
      for (const lutMap of lookupTableProvider.lookupTables) {
        const lut = lutMap[1];
        if (lut.state.authority?.equals(payer.publicKey) && lut.isActive()) {
          if (lut.state.addresses.length < 255 - remainingAddresses.size) {
            for (let i = 0; i < remainingAddresses.size; i+=25){
              const slice = new Array(remainingAddresses.size).slice(i, Math.min(new Array(remainingAddresses.size).length,  i + 25)).map((address) => new PublicKey(address));
            const extendInstruction = AddressLookupTableProgram.extendLookupTable({
              payer: payer.publicKey,
              authority: payer.publicKey,
              lookupTable: new PublicKey(lutMap[0]),
              addresses: slice
            });
            selectedTables.push( await lookupTableProvider.getLookupTable(new PublicKey(lutMap[0] )));
      
            const extendTx = new Transaction().add(extendInstruction);
            extendTx.feePayer = payer.publicKey;
            extendTx.recentBlockhash = txn.message.recentBlockhash;
            connection.sendTransaction(extendTx, [payer]);
          }
            // await sleep 5s
            noneed = true;
            break;
          }
        }
      }
      if (!noneed){

      const [lookupTableInst, lookupTableAddress] =
      AddressLookupTableProgram.createLookupTable({
        authority: payer.publicKey,
        payer: payer.publicKey,
        recentSlot: await provider.connection.getSlot() - 50
      });
      const lookupTableTx = new Transaction().add(lookupTableInst);
      lookupTableTx.feePayer = payer.publicKey;
      lookupTableTx.recentBlockhash = txn.message.recentBlockhash;
      const sig = await connection.sendTransaction(lookupTableTx, [payer]);
      await connection.confirmTransaction(sig, "confirmed")
      selectedTables.push( await lookupTableProvider.getLookupTable(new PublicKey(lookupTableAddress)));
      const addresses = new Array(remainingAddresses).slice(0, Math.min(new Array(remainingAddresses).length,  25)).map((address) => 
        
      {try {
          
          return new PublicKey(address) } catch (err){
            return PublicKey.default
          }})
      // add addresses to the `lookupTableAddress` table via an `extend` instruction
      const extendInstruction = AddressLookupTableProgram.extendLookupTable({
        payer: payer.publicKey,
        authority: payer.publicKey,
        lookupTable: lookupTableAddress,
        addresses: addresses.filter((addy: PublicKey) => !addy.equals(PublicKey.default))})

      const extendTx = new Transaction().add(extendInstruction);
      extendTx.feePayer = payer.publicKey;
      extendTx.recentBlockhash = txn.message.recentBlockhash;
      await connection.sendTransaction(extendTx, [payer]);

      // await sleep 5s
    }
    
    }

    logger.info(selectedTables.length);
      
    const messageMain = new TransactionMessage({
      payerKey: payer.publicKey,
      recentBlockhash: txn.message.recentBlockhash,
      instructions: ixs,
    }).compileToV0Message(selectedTables);
    const txMain = new VersionedTransaction(messageMain);
    try {
      const serializedMsg = txMain.serialize();
      if (serializedMsg != undefined){
      if (serializedMsg.length > 1232) {
        logger.error('tx too big');
        continue;
      }
    }
    } catch (e) {
      logger.error(e, 'error signing txMain');
      continue;
    }

    txMain.sign([payer]);
    const bundle = [txn, txMain];

    yield {
      bundle,
      arbSize,
      expectedProfit,
      hop1Dex: route[0].market.dexLabel,
      hop2Dex: route[1].market.dexLabel,
      hop3Dex: route[2] ? route[2].market.dexLabel : '',
      sourceMint: hop0SourceMint,
      intermediateMint1: intermediateMints[0],
      intermediateMint2: intermediateMints[1] ? intermediateMints[1] : null,
      tipLamports: JSBI.BigInt(1_138_000),
      timings: {
        mempoolEnd: timings.mempoolEnd,
        preSimEnd: timings.preSimEnd,
        simEnd: timings.simEnd,
        postSimEnd: timings.postSimEnd,
        calcArbEnd: timings.calcArbEnd,
        buildBundleEnd: Date.now(),
        bundleSent: 0,
      },
    };
  }
}

export { buildBundle, Arb };
