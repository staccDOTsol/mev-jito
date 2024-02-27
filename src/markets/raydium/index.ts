import fs from 'fs';

import { RaydiumAmm } from '@jup-ag/core';
import { ApiPoolInfoItem } from '@raydium-io/raydium-sdk';
import {
  AccountInfo,
  PublicKey,
} from '@solana/web3.js';

import { connection } from '../../clients/rpc.js';
import { logger } from '../../logger.js';
import {
  DEX,
  DexLabel,
  Market,
} from '../types.js';
import {
  toPairString,
  toSerializableAccountInfo,
} from '../utils.js';

export const BASE_MINTS_OF_INTEREST_B58 = 
[  //'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
  //'BLZEEuZUBVqFhj8adcCFPJvPVCiCyVmh3hkJMrU8KuJA',
  'WENWENvqqNya429ubCdR81ZmD69brwQaaBYY6p3LCpk',
  'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
 /* 'bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1',
  'DUSTawucrTsGU8hcqRdHDCbuYhCPADMLM2VcCb8VnFnQ',
  '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs',
  'AZsHEMXd36Bj1EMNXhowJajpUXzrKcK57wW4ZGXVa7yR',
  'hntyVP6YFm1Hg25TN9WGLqM12b8TQmcknKrdu1oxWux',
  'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn',
  '27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4',
  'jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL',
  'kinXdEcpDQeHPEuQnqmUgtYykqKGVFq6CeVX5iAHJq6',
  'LFG1ezantSY2LPX8jRz2qa31pPEhpwN9msFDzZw4T9Q',
  'LSTxxxnJzKDFSLr4dUkPcmCf5VyryEqzPLz5j4bpxFp',
  'MNDEFzGvMt87ueuHvVU9VcTqsAP5b3fTGPsHuuPA5ey',
  'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So',
  'BqVHWpwUDgMik5gbTciFfozadpE2oZth5bxCDrgbDt52',
  'orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE',
  'HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3',
  'rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof',
  'RLBxxFkseAZ4RgJH3Sqn8jXxhmGoz9jWxDNJMh8pL7a',
  '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
  'SHDWyBxihqiCj6YekG2GUr7wqKLeLAMK1gHZck9pL6y',
  'So11111111111111111111111111111111111111112',
  'StepAscQoEioFxxWGnh2sLBDFp9d8rvKz2Yp39iDpyT',
  '7dHbWXmci3dT8UFYWYZweBLXgycu7Y3iL6trKn1Y7ARj',
  '6DNSN2BJsaPFdFFc1zP37kkeNe4Usc1Sqkzr9C9vPWcU',*/
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'/*
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  '7kbnvuGBxxj8AG9qp8Scn56muWGaRaFqxg1FsRp3PaFT',
  '3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh',
  'ZScHuTtqZukUrtZS43teTKGs2VqkKL8k4QCouR2n6Uo'*/
]
const POOLS_JSON = JSON.parse(
  fs.readFileSync('./src/markets/raydium/mainnet.json', 'utf-8'),
) as { official: ApiPoolInfoItem[]; unOfficial: ApiPoolInfoItem[] };

logger.debug(
  `Raydium: Found ${POOLS_JSON.official.length} official pools and ${POOLS_JSON.unOfficial.length} unofficial pools`,
);

let pools: ApiPoolInfoItem[] = [];


// make .unOfficial 1/10 the size at random
POOLS_JSON.unOfficial.forEach((pool) => pools.push(pool));
POOLS_JSON.official.forEach((pool) => pools.push(pool));
const tokensOfInterst = BASE_MINTS_OF_INTEREST_B58;
pools = pools.filter((pool) => {
  return (
    tokensOfInterst.includes(pool.baseMint) ||
    tokensOfInterst.includes(pool.quoteMint)
  );
})
logger.debug(
  `Raydium: Found ${pools.length} pools`,
);

const initialAccountBuffers: Map<string, AccountInfo<Buffer>> = new Map();
const addressesToFetch: PublicKey[] = [];
for (const pool of pools){

      addressesToFetch.push(new PublicKey(pool.id));
      addressesToFetch.push(new PublicKey(pool.marketId));
    } 
for (let i = 0; i < addressesToFetch.length; i += 100) {
  const batchPromises = [];
  for (let j = 0; j < 1; j++) {
    const batchStart = i + (j * 100);
    if (batchStart < addressesToFetch.length) {
      const batch = addressesToFetch.slice(batchStart, batchStart + 100);
      batchPromises.push(connection.getMultipleAccountsInfo(batch));
      await new Promise((resolve) => setTimeout(resolve, 10));
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
