import { ApiPoolInfoItem } from '@raydium-io/raydium-sdk';
import { logger } from '../../logger.js';
import fs from 'fs';
import { AccountInfo, PublicKey } from '@solana/web3.js';
import { DEX, Market, DexLabel } from '../types.js';
import { RaydiumAmm } from '@jup-ag/core';
import { connection } from '../../clients/rpc.js';
import { toPairString, toSerializableAccountInfo } from '../utils.js';
import fetch from 'node-fetch';


const POOLS_JSON = JSON.parse(
  fs.readFileSync('./src/markets/raydium/mainnet.json', 'utf-8'),
) as { official: ApiPoolInfoItem[]; unOfficial: ApiPoolInfoItem[] };

logger.debug(
  `Raydium: Found ${POOLS_JSON.official.length} official pools and ${POOLS_JSON.unOfficial.length} unofficial pools`,
);

const pools: ApiPoolInfoItem[] = [];


// make .unOfficial 1/10 the size at random
POOLS_JSON.unOfficial.forEach((pool) => pools.push(pool));
POOLS_JSON.official.forEach((pool) => pools.push(pool));

const initialAccountBuffers: Map<string, AccountInfo<Buffer>> = new Map();
let addressesToFetch: PublicKey[] = [];
const prices: any = {}
const vaults: any = []
let amounts: any = []

for (const pool of pools) {
  vaults.push(...[new PublicKey(pool.quoteVault),new PublicKey(pool.baseVault)]);
}
if (fs.existsSync('./src/markets/raydium/addressesToFetch.json')) {
  addressesToFetch = JSON.parse(fs.readFileSync('./src/markets/raydium/addressesToFetch.json', 'utf-8')).map((a) => new PublicKey(a))
}
else {
let whiches = ""
for (let i = 0; i < vaults.length; i += 10000) {
  const batch = vaults.slice(i, i + 10000);
  const balances = (await connection.getMultipleParsedAccounts(batch)).value;
  for (let j = 0; j < balances.length; j++) {
    const balance = balances[j];
    if (balance == undefined) continue;
    // pools is half the length of vaults
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    if (balance.data?.parsed == undefined) continue;
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const info = balance.data.parsed.info;
    if (info.tokenAmount.uiAmount > 1){
    amounts.push((info.tokenAmount.uiAmount));
    const which = info.mint

      whiches+=which +","
      if (whiches.split(',').length >= 90){

    const res = await fetch("https://price.jup.ag/v4/price?ids=" + whiches).then((res) => res.json()) as any;
console.log(res)
      if (Object.values(res.data).length == 0) {
        await new Promise(resolve => setTimeout(resolve, 1166));
        continue;
      }
      for (const w in whiches.split(',')){
      try {
const which = whiches.split(',')[w]
const pool = pools[Math.floor(((i + j)-(100-parseInt(w)))/2)]
console.log((i + j)-(100-parseInt(w)))
console.log(which)
if (Object.keys(res.data).includes(which)){
  console.log(which)
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    prices[which] = (Math.floor(res.data[which].price * 10 ** 6))
   
      
const amount = amounts[w]
    const price = (prices[which] * amount);
    if ((price) > (206_661_382)) {
      addressesToFetch.push(new PublicKey(pool.id));
      addressesToFetch.push(new PublicKey(pool.marketId));
    } }
  }
    catch (err){
      console.log(err)
    }  
}
whiches = ""
amounts = []
    }
  
  console.log(`Fetched ${i + j} accounts / total` + vaults.length);
  }
}
}
fs.writeFileSync('./src/markets/raydium/addressesToFetch.json', JSON.stringify(addressesToFetch));
}
for (let i = 0; i < addressesToFetch.length; i += 50000) {
  const batchPromises = [];
  for (let j = 0; j < 5; j++) {
    const batchStart = i + (j * 10000);
    if (batchStart < addressesToFetch.length) {
      const batch = addressesToFetch.slice(batchStart, batchStart + 10000);
      batchPromises.push(connection.getMultipleAccountsInfo(batch));
    }
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
  console.log(`Fetched ${Math.min(i + 50000, addressesToFetch.length)} accounts / total` + addressesToFetch.length);
}
class RaydiumDEX extends DEX {
  public pools: ApiPoolInfoItem[];

  constructor() {
    super(DexLabel.RAYDIUM);
    this.pools = []
    const poolMap = new Map(pools.map(pool => [pool.id, pool]));

    for (let i = 0; i < addressesToFetch.length; i++) {
      const poolId = addressesToFetch[i].toBase58();
      if (poolMap.has(poolId)) {
        this.pools.push(poolMap.get(poolId));
      }
    }
    for (const pool of this.pools) {
     
            
        const serumProgramId = new PublicKey(pool.marketProgramId);
        const serumMarket = new PublicKey(pool.marketId);
        const serumParams = RaydiumAmm.decodeSerumMarketKeysString(
          new PublicKey(pool.id),
          serumProgramId,
          serumMarket,
          initialAccountBuffers.get(serumMarket.toBase58()),
        );

        this.ammCalcAddPoolMessages.push({
          type: 'addPool',
          payload: {
            poolLabel: this.label,
            id: pool.id,
            feeRateBps: 238,
            serializableAccountInfo: toSerializableAccountInfo(
              initialAccountBuffers.get(pool.id),
            ),
            serumParams: serumParams,
          },
        });
        const market: Market = {
          tokenMintA: pool.baseMint,
          tokenVaultA: pool.baseVault,
          tokenMintB: pool.quoteMint,
          tokenVaultB: pool.quoteVault,
          dexLabel: this.label,
          id: pool.id,
        };
      
        const pairString = toPairString(pool.baseMint, pool.quoteMint);
          this.pairToMarkets.set(pairString, [market]);
    }
  }
}

export { RaydiumDEX };