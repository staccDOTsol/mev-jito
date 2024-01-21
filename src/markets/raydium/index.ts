import { ApiPoolInfoItem } from '@raydium-io/raydium-sdk';
import { logger } from '../../logger.js';
import fs from 'fs';
import { AccountInfo, PublicKey } from '@solana/web3.js';
import { DEX, Market, DexLabel } from '../types.js';
import { RaydiumAmm } from '@jup-ag/core';
import { connection } from '../../clients/rpc.js';
import { toPairString, toSerializableAccountInfo } from '../utils.js';
import fetch from 'node-fetch';
import jsbi from 'jsbi';
import { defaultImport } from 'default-import';

const JSBI = defaultImport(jsbi);

const POOLS_JSON = JSON.parse(
  fs.readFileSync('./src/markets/raydium/mainnet.json', 'utf-8'),
) as { official: ApiPoolInfoItem[]; unOfficial: ApiPoolInfoItem[] };

logger.debug(
  `Raydium: Found ${POOLS_JSON.official.length} official pools and ${POOLS_JSON.unOfficial.length} unofficial pools`,
);

const pools: ApiPoolInfoItem[] = [];

const mrgnMetadata: any = await fetch("https://storage.googleapis.com/mrgn-public/mrgn-token-metadata-cache.json").then((res) => res.json());

const bs58sOfInterest = mrgnMetadata.map((m) => m.address);

// make .unOfficial 1/10 the size at random
for (let i = 0; i < POOLS_JSON.unOfficial.length; i++) {
  
    if (Math.random() <= 1 && (bs58sOfInterest.includes(POOLS_JSON.unOfficial[i].quoteMint) &&
        bs58sOfInterest.includes(POOLS_JSON.unOfficial[i].baseMint))) {
      if (!pools.includes(POOLS_JSON.unOfficial[i])) {
        pools.push(POOLS_JSON.unOfficial[i]);
      }
    }
    
    if (Math.random() <= 1 && (bs58sOfInterest.includes(POOLS_JSON.unOfficial[i].quoteMint) ||
        bs58sOfInterest.includes(POOLS_JSON.unOfficial[i].baseMint))) {
      if (!pools.includes(POOLS_JSON.unOfficial[i])) {
        pools.push(POOLS_JSON.unOfficial[i]);
      }
    }
    
    if (Math.random() <= 1) {
      if (!pools.includes(POOLS_JSON.unOfficial[i])) {
        pools.push(POOLS_JSON.unOfficial[i]);
      }
    }
    

}

POOLS_JSON.official.forEach((pool) => pools.push(pool));

const initialAccountBuffers: Map<string, AccountInfo<Buffer>> = new Map();
const addressesToFetch: PublicKey[] = [];
const prices: any = {}
const vaults: any = []
for (const pool of pools) {
  vaults.push(Math.random() < 0.5 ? new PublicKey(pool.id) : new PublicKey(pool.baseVault));

}
if (fs.existsSync('./src/markets/raydium/addressesToFetch.json')) {
  addressesToFetch.push(...JSON.parse(fs.readFileSync('./src/markets/raydium/addressesToFetch.json', 'utf-8')).map((a) => new PublicKey(a)));
}
else {
for (let i = 0; i < vaults.length; i += 100) {
  const batch = vaults.slice(i, i + 100);
  const balances = (await connection.getMultipleParsedAccounts(batch)).value;
  for (let j = 0; j < balances.length; j++) {
    const balance = balances[j];
    if (balance == undefined) continue;
    // pools is half the length of vaults
    const pool = pools[i+j];
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    if (balance.data?.parsed == undefined) continue;
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const info = balance.data.parsed.info;

    const amount = JSBI.BigInt(info.tokenAmount.amount);
    const which = info.mint
    if (!fs.existsSync('./src/markets/raydium/addressesToFetch.json')) {

    if (!Object.keys(prices).includes(which)) {
    const res = await fetch("https://price.jup.ag/v4/price?ids=" + which).then((res) => res.json());
      if (Object.values(res.data).length == 0) {
        continue;
      }
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    prices[which] = JSBI.BigInt(Math.floor(Object.values(res.data)[0].price * 10 ** 6))
    }  
      
    const price = JSBI.multiply(prices[which], amount);
    if (Number(price.toString()) > (150_000_000_000)) {
      Math.random() < 0.1 ?? logger.info(`Raydium: ${pool.baseMint} ${pool.quoteMint} ${price}`);
      addressesToFetch.push(new PublicKey(pool.id));
      addressesToFetch.push(new PublicKey(pool.marketId));
    }
  console.log(`Fetched ${i + 100} accounts / total` + vaults.length);
fs.writeFileSync('./src/markets/raydium/addressesToFetch.json', JSON.stringify(addressesToFetch));
  }
}
}
}
const tpools: any = []
for (const i in POOLS_JSON.unOfficial) {
  if (Math.random() <= 0.06138) {
    if (!tpools.includes(POOLS_JSON.unOfficial[i])) {
      tpools.push(POOLS_JSON.unOfficial[i]);
    }
  }
}
tpools.push(...POOLS_JSON.official);
for (const pool of tpools){
  if (addressesToFetch.includes(new PublicKey(pool.id))) continue;
  if (addressesToFetch.includes(new PublicKey(pool.marketId))) continue;
    addressesToFetch.push(new PublicKey(pool.id));
    addressesToFetch.push(new PublicKey(pool.marketId));
}
for (let i = 0; i < addressesToFetch.length; i += 500) {
  const batchPromises = [];
  for (let j = 0; j < 5; j++) {
    const batchStart = i + (j * 100);
    if (batchStart < addressesToFetch.length) {
      const batch = addressesToFetch.slice(batchStart, batchStart + 100);
      batchPromises.push(connection.getMultipleAccountsInfo(batch));
    }
  }
  const accountsArray = await Promise.all(batchPromises);
  for (let j = 0; j < accountsArray.length; j++) {
    const accounts = accountsArray[j];
    const batchStart = i + (j * 100);
    const batch = addressesToFetch.slice(batchStart, batchStart + 100);
    for (let k = 0; k < accounts.length; k++) {
      initialAccountBuffers.set(batch[k].toBase58(), accounts[k]);
    }
  }
  console.log(`Fetched ${Math.min(i + 500, addressesToFetch.length)} accounts / total` + addressesToFetch.length);
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
        console.log(this.pools.length);
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
            feeRateBps: 25+138/2,
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
        if (this.pairToMarkets.has(pairString)) {
          this.pairToMarkets.get(pairString).push(market);
        } else {
          this.pairToMarkets.set(pairString, [market]);
      }
    }
  }
}

export { RaydiumDEX };