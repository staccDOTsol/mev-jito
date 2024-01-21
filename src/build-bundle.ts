import {
  AddressLookupTableAccount,
  AddressLookupTableProgram,
  Keypair,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import { ArbIdea } from './calculate-arb.js';
import * as fs from 'fs';
import { config } from './config.js';
import * as Token from '@solana/spl-token-3';
import { tritonConnection as connection } from './clients/rpc.js';
import { MarginfiAccountWrapper } from "mrgn-ts";
import fetch from 'node-fetch';
import jsbi from 'jsbi';
import { defaultImport } from 'default-import';
import * as anchor from '@coral-xyz/anchor';
import { logger } from './logger.js';
import { Timings } from './types.js';
import { lookupTableProvider } from './lookup-table-provider.js';

import { MarginfiClient, getConfig } from "mrgn-ts";
import { PublicKey } from "@solana/web3.js";
import { NATIVE_MINT } from '@mrgnlabs/mrgn-common';
import { Transaction } from '@solana/web3.js';

const JSBI = defaultImport(jsbi);

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

// three signatrues (up to two for set up txn, one for main tx)

const MIN_BALANCE_RENT_EXEMPT_TOKEN_ACC =
  await Token.getMinimumBalanceForRentExemptAccount(connection);

const payer = Keypair.fromSecretKey(
  Uint8Array.from(
    JSON.parse(fs.readFileSync(config.get('payer_keypair_path'), 'utf-8')),
  ),
);

const wallet = new anchor.Wallet(payer);
const provider = new anchor.AnchorProvider(connection, wallet, {});


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

const ataCache = new Map<string, PublicKey>();
const getAta = (mint: PublicKey, owner: PublicKey) => {
  const key = `${mint.toBase58()}-${owner.toBase58()}`;
  if (ataCache.has(key)) {
    return ataCache.get(key);
  }
  const ata = Token.getAssociatedTokenAddressSync(mint, owner);
  ataCache.set(key, ata);
  return ata;
};

const client = await getMarginfiClient({readonly: true, authority: new PublicKey("7ihN8QaTfNoDTRTQGULCzbUT3PHwPDTu5Brcu4iT2paP"), provider, wallet});

console.log(`Using ${client.config.environment} environment; wallet: ${client.wallet.publicKey.toBase58()}`);

const marginfiAccount = await MarginfiAccountWrapper.fetch("EW1iozTBrCgyd282g2eemSZ8v5xs7g529WFv4g69uuj2", client);
async function* buildBundle(
  arbIdeaIterator: AsyncGenerator<ArbIdea>,
): AsyncGenerator<Arb> {
  for await (const {
    txn,
    arbSize,
    arbSizeDecimals,
    expectedProfit,
    route,
    timings,
  } of arbIdeaIterator) {
    const hop0 = route[0];
    const hop0SourceMint = new PublicKey(
      hop0.fromA ? hop0.market.tokenMintA : hop0.market.tokenMintB,
    );

    const isUSDC = !hop0SourceMint.equals(NATIVE_MINT);

    const tipLamports = JSBI.BigInt(1_000_000);


    const setUpIxns: TransactionInstruction[] = [];
    const setUpSigners: Keypair[] = [payer];
    let sourceTokenAccount;
    let USDC_ATA;
    let tokenProgram = Token.TOKEN_PROGRAM_ID
    try {
        try {
        USDC_ATA = await Token.getOrCreateAssociatedTokenAccount(connection, payer, hop0SourceMint, payer.publicKey);
        } catch (err){
            tokenProgram = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb")
            USDC_ATA = await Token.getOrCreateAssociatedTokenAccount(connection, payer, hop0SourceMint, payer.publicKey, undefined, undefined, undefined, tokenProgram)
        }
    }
    catch (e) {
        console.log(e);
        continue;
    }
    if (!isUSDC) {
      const sourceTokenAccountKeypair = Keypair.generate();
      setUpSigners.push(sourceTokenAccountKeypair);

      sourceTokenAccount = sourceTokenAccountKeypair.publicKey;

      const createSourceTokenAccountIxn = SystemProgram.createAccount({
        fromPubkey: payer.publicKey,
        newAccountPubkey: sourceTokenAccount,
        space: Token.ACCOUNT_SIZE,
        lamports: MIN_BALANCE_RENT_EXEMPT_TOKEN_ACC,
        programId: tokenProgram,
      });
      setUpIxns.push(createSourceTokenAccountIxn);

      const initSourceTokenAccountIxn =
        Token.createInitializeAccountInstruction(
          sourceTokenAccount,
          hop0SourceMint,
          payer.publicKey,
        );
      setUpIxns.push(initSourceTokenAccountIxn);
    } else {
      sourceTokenAccount = USDC_ATA.address;
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
      const intermediateTokenAccount = getAta(mint, payer.publicKey);
      const accountMaybe = await connection.getAccountInfo(
        intermediateTokenAccount,
      );
      if (accountMaybe != undefined) {
        return;
      }
      const createIntermediateTokenAccountIxn =
        Token.createAssociatedTokenAccountIdempotentInstruction(
          payer.publicKey,
          intermediateTokenAccount,
          payer.publicKey,
          mint,
        );
      setUpIxns.push(createIntermediateTokenAccountIxn);
    });
    const mint = new PublicKey(hop0SourceMint);
    const solBank = client.getBankByMint(mint);
    if (!solBank) {
         logger.info("SOL bank not found");
        continue
    }

    

    const selectedTables: AddressLookupTableAccount[] = [];
    const jupiterIxns: TransactionInstruction[] = [];
    for (let i = 0; i < route[0].quote.length; i++){
        const hop = route[0].quote[i];
        const instructions = await (
            await fetch('http://127.0.0.1:8080/swap-instructions', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                // quoteResponse from /quote api
                quoteResponse: hop,
                userPublicKey: payer.publicKey.toBase58(),
                skipUserAccountsRpcCalls: true,
                restrictIntermediateTokens: true,
                asLegacyTransaction: true
              })
            })
          ).json();
          
          if (instructions.error) {
            logger.error("Failed to get swap instructions: " + instructions.error);
            return;
          }
          
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

    if (jupiterIxns.length > 0){
    const instructionsMain: TransactionInstruction[] = [];

    if (arbSizeDecimals.length > 52){
        logger.info("arbSizeDecimals too big")
        continue;
    }
    const override_banks:     Map<string, any> = new Map();
    override_banks.set(solBank.address.toBase58(), solBank);
    const [depositIx, endFlashLoanIx, borrowIx] = await Promise.all([
      marginfiAccount.makeDepositIx(JSBI.toNumber(JSBI.add(JSBI.BigInt(arbSize),JSBI.divide(expectedProfit, JSBI.BigInt(3)))) / solBank.mintDecimals ** 10, 

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    solBank.address,    
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
     override_banks),
     // eslint-disable-next-line @typescript-eslint/ban-ts-comment
     // @ts-ignore
      marginfiAccount.makeEndFlashLoanIx(override_banks),
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      marginfiAccount.makeBorrowIx((arbSizeDecimals), solBank.address)
    ]);

    instructionsMain.push(...borrowIx.instructions);
    

    
    instructionsMain.push(...jupiterIxns);
    instructionsMain.push(...depositIx.instructions);

    const endIndex = instructionsMain.length + 1;
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const beginFlashLoanIx = await marginfiAccount.makeBeginFlashLoanIx(endIndex);
    // eslint-disable-next-line prefer-const
    let ixs = [
      //...(await marginfiAccount.makeDepositIx((1 / solBank.mintDecimals ** 10), solBank.address)).instructions,
      ...beginFlashLoanIx.instructions,
      ...instructionsMain,
      ...endFlashLoanIx.instructions,
    ]
ixs.push(SystemProgram.transfer({
  fromPubkey: payer.publicKey,
  toPubkey: getRandomTipAccount(),
  lamports: 1_386_660
}))
    console.log(beginFlashLoanIx.instructions.length, jupiterIxns.length, instructionsMain.length, endFlashLoanIx.instructions.length, ixs.length)


    const addressesMain: PublicKey[] = [];
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
        if (lut.state.authority.equals(payer.publicKey)) {
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
      connection.sendTransaction(lookupTableTx, [payer]);
      selectedTables.push( await lookupTableProvider.getLookupTable(new PublicKey(lookupTableAddress)));

      // add addresses to the `lookupTableAddress` table via an `extend` instruction
      const extendInstruction = AddressLookupTableProgram.extendLookupTable({
        payer: payer.publicKey,
        authority: payer.publicKey,
        lookupTable: lookupTableAddress,
        addresses: new Array(remainingAddresses).slice(0, Math.min(new Array(remainingAddresses).length,  25)).map((address) => new PublicKey(address)),
      });

      const extendTx = new Transaction().add(extendInstruction);
      extendTx.feePayer = payer.publicKey;
      extendTx.recentBlockhash = txn.message.recentBlockhash;
      await connection.sendTransaction(extendTx, [payer]);

      // await sleep 5s
    }
    
    }

    logger.info(selectedTables.length);
        const messageSetup = new TransactionMessage({
      payerKey: payer.publicKey,
      recentBlockhash: txn.message.recentBlockhash,
      instructions: setUpIxns,
    }).compileToV0Message();
    const txSetup = new VersionedTransaction(messageSetup);
    txSetup.sign(setUpSigners);
    const messageMain = new TransactionMessage({
      payerKey: payer.publicKey,
      recentBlockhash: txn.message.recentBlockhash,
      instructions: ixs,
    }).compileToV0Message((selectedTables))
    const txMain = new VersionedTransaction(messageMain);
    try {
      const serializedMsg = txMain.serialize();
      if (serializedMsg.length > 1232) {
        console.log(serializedMsg.length)
        logger.error('tx too big? we think?');
        continue;
      }
    } catch (e) {
      logger.error(e, 'error signing txMain');
      continue;
   
    }
    txMain.sign([payer]);
    const bundle = [txn, txSetup, txMain];
   
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
      tipLamports,
      timings: {
        mempoolEnd: timings.mempoolEnd,
        preSimEnd: timings.preSimEnd,
        simEnd: timings.simEnd,
        postSimEnd: timings.postSimEnd,
        calcArbEnd: timings.calcArbEnd,
        buildBundleEnd: new Date().getTime(),
        bundleSent: 0,
      },
    };
  }
  }
}

export { buildBundle, Arb };
