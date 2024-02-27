import { PublicKey } from '@solana/web3.js';

import { connection } from './clients/rpc.js';

export const BASE_MINTS_OF_INTEREST = {
  USDC: new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'),
  SOL: new PublicKey('So11111111111111111111111111111111111111112'),
};
export const BASE_ACCOUNTS = {
  'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263': '4Ucsagtk8eSpYnMfa8sKug3QzrC6g76F4roiF9i5HECq',
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v':'CyytQ6ipQMabBpCJnZjK1PasxHN5Fg7PDhMvNCHfijto',
  'WENWENvqqNya429ubCdR81ZmD69brwQaaBYY6p3LCpk': '2Ax7j1ZhsFHqf5jQttzbTR9qpnSVZTpuSnmiBjKaVLF5'
}
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
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',/*
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  '7kbnvuGBxxj8AG9qp8Scn56muWGaRaFqxg1FsRp3PaFT',
  '3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh',
  'ZScHuTtqZukUrtZS43teTKGs2VqkKL8k4QCouR2n6Uo'*/
]

export const DECIMALS: any = {}
for (const bs58 of BASE_MINTS_OF_INTEREST_B58){
  const account = await connection.getParsedAccountInfo(new PublicKey(bs58))

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
  const decimals = account.value.data.parsed.info.decimals;

DECIMALS[bs58] = decimals
}

// solend constants from here https://api.solend.fi/v1/config?deployment=production
export const SOLEND_TURBO_POOL = new PublicKey(
  '7RCz8wb6WXxUhAigok9ttgrVgDFFFbibcirECzWSBauM',
);

export const SOLEND_TURBO_SOL_RESERVE = new PublicKey(
  'UTABCRXirrbpCNDogCoqEECtM3V44jXGCsK23ZepV3Z',
);
export const SOLEND_TURBO_SOL_LIQUIDITY = new PublicKey(
  '5cSfC32xBUYqGfkURLGfANuK64naHmMp27jUT7LQSujY',
);
export const SOLEND_TURBO_SOL_FEE_RECEIVER = new PublicKey(
  '5wo1tFpi4HaVKnemqaXeQnBEpezrJXcXvuztYaPhvgC7',
);

export const SOLEND_TURBO_USDC_RESERVE = new PublicKey(
  'EjUgEaPpKMg2nqex9obb46gZQ6Ar9mWSdVKbw9A6PyXA',
);
export const SOLEND_TURBO_USDC_LIQUIDITY = new PublicKey(
  '49mYvAcRHFYnHt3guRPsxecFqBAY8frkGSFuXRL3cqfC',
);
export const SOLEND_TURBO_USDC_FEE_RECEIVER = new PublicKey(
  '5Gdxn4yquneifE6uk9tK8X4CqHfWKjW2BvYU25hAykwP',
);

export const SOLEND_FLASHLOAN_FEE_BPS = 0;
