import {
  AccountMeta,
  AddressLookupTableAccount,
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
import BN from 'bn.js';
import { JUPITER_PROGRAM_ID, SwapMode } from '@jup-ag/common'; //WRAPPED_SOL_MINT
import { MarginfiAccountWrapper } from "mrgn-ts";
const IDL = {
  version: '0.1.0',
  name: 'jupiter',
  instructions: [
      {
          name: 'route',
          accounts: [
              {
                  name: 'tokenProgram',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'userTransferAuthority',
                  isMut: false,
                  isSigner: true,
              },
              {
                  name: 'destinationTokenAccount',
                  isMut: false,
                  isSigner: false,
              }
          ],
          args: [
              {
                  name: 'swapLeg',
                  type: {
                      defined: 'SwapLeg',
                  },
              },
              {
                  name: 'inAmount',
                  type: 'u64',
              },
              {
                  name: 'quotedOutAmount',
                  type: 'u64',
              },
              {
                  name: 'slippageBps',
                  type: 'u16',
              },
              {
                  name: 'platformFeeBps',
                  type: 'u8',
              }
          ],
      },
      {
          name: 'whirlpoolSwapExactOutput',
          accounts: [
              {
                  name: 'swapProgram',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'tokenProgram',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'tokenAuthority',
                  isMut: false,
                  isSigner: true,
              },
              {
                  name: 'whirlpool',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'tokenOwnerAccountA',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'tokenVaultA',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'tokenOwnerAccountB',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'tokenVaultB',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'tickArray0',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'tickArray1',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'tickArray2',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'oracle',
                  isMut: false,
                  isSigner: false,
              }
          ],
          args: [
              {
                  name: 'outAmount',
                  type: 'u64',
              },
              {
                  name: 'inAmountWithSlippage',
                  type: {
                      defined: 'AmountWithSlippage',
                  },
              },
              {
                  name: 'aToB',
                  type: 'bool',
              },
              {
                  name: 'platformFeeBps',
                  type: 'u8',
              }
          ],
      },
      {
          name: 'raydiumSwapExactOutput',
          accounts: [
              {
                  name: 'swapProgram',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'tokenProgram',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'ammId',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'ammAuthority',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'ammOpenOrders',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'poolCoinTokenAccount',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'poolPcTokenAccount',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'serumProgramId',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'serumMarket',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'serumBids',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'serumAsks',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'serumEventQueue',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'serumCoinVaultAccount',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'serumPcVaultAccount',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'serumVaultSigner',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'userSourceTokenAccount',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'userDestinationTokenAccount',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'userSourceOwner',
                  isMut: false,
                  isSigner: true,
              }
          ],
          args: [
              {
                  name: 'outAmount',
                  type: 'u64',
              },
              {
                  name: 'inAmountWithSlippage',
                  type: {
                      defined: 'AmountWithSlippage',
                  },
              },
              {
                  name: 'platformFeeBps',
                  type: 'u8',
              }
          ],
      },
      {
          name: 'raydiumClmmSwapExactOutput',
          accounts: [
              {
                  name: 'swapProgram',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'payer',
                  isMut: false,
                  isSigner: true,
              },
              {
                  name: 'ammConfig',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'poolState',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'inputTokenAccount',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'outputTokenAccount',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'inputVault',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'outputVault',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'observationState',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'tokenProgram',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'tickArray',
                  isMut: true,
                  isSigner: false,
              }
          ],
          args: [
              {
                  name: 'outAmount',
                  type: 'u64',
              },
              {
                  name: 'inAmountWithSlippage',
                  type: {
                      defined: 'AmountWithSlippage',
                  },
              },
              {
                  name: 'platformFeeBps',
                  type: 'u8',
              }
          ],
      },
      {
          name: 'createOpenOrders',
          accounts: [
              {
                  name: 'openOrders',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'payer',
                  isMut: true,
                  isSigner: true,
              },
              {
                  name: 'dexProgram',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'systemProgram',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'rent',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'market',
                  isMut: false,
                  isSigner: false,
              }
          ],
          args: [],
      },
      {
          name: 'mercurialSwap',
          accounts: [
              {
                  name: 'swapProgram',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'swapState',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'tokenProgram',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'poolAuthority',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'userTransferAuthority',
                  isMut: false,
                  isSigner: true,
              },
              {
                  name: 'sourceTokenAccount',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'destinationTokenAccount',
                  isMut: true,
                  isSigner: false,
              }
          ],
          args: [],
      },
      {
          name: 'cykuraSwap',
          accounts: [
              {
                  name: 'swapProgram',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'signer',
                  isMut: false,
                  isSigner: true,
              },
              {
                  name: 'factoryState',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'poolState',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'inputTokenAccount',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'outputTokenAccount',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'inputVault',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'outputVault',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'lastObservationState',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'coreProgram',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'tokenProgram',
                  isMut: false,
                  isSigner: false,
              }
          ],
          args: [],
      },
      {
          name: 'serumSwap',
          accounts: [
              {
                  name: 'market',
                  accounts: [
                      {
                          name: 'market',
                          isMut: true,
                          isSigner: false,
                      },
                      {
                          name: 'openOrders',
                          isMut: true,
                          isSigner: false,
                      },
                      {
                          name: 'requestQueue',
                          isMut: true,
                          isSigner: false,
                      },
                      {
                          name: 'eventQueue',
                          isMut: true,
                          isSigner: false,
                      },
                      {
                          name: 'bids',
                          isMut: true,
                          isSigner: false,
                      },
                      {
                          name: 'asks',
                          isMut: true,
                          isSigner: false,
                      },
                      {
                          name: 'coinVault',
                          isMut: true,
                          isSigner: false,
                      },
                      {
                          name: 'pcVault',
                          isMut: true,
                          isSigner: false,
                      },
                      {
                          name: 'vaultSigner',
                          isMut: false,
                          isSigner: false,
                      }
                  ],
              },
              {
                  name: 'authority',
                  isMut: false,
                  isSigner: true,
              },
              {
                  name: 'orderPayerTokenAccount',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'coinWallet',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'pcWallet',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'dexProgram',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'tokenProgram',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'rent',
                  isMut: false,
                  isSigner: false,
              }
          ],
          args: [],
      },
      {
          name: 'saberSwap',
          accounts: [
              {
                  name: 'swapProgram',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'tokenProgram',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'swap',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'swapAuthority',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'userAuthority',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'inputUserAccount',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'inputTokenAccount',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'outputUserAccount',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'outputTokenAccount',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'feesTokenAccount',
                  isMut: true,
                  isSigner: false,
              }
          ],
          args: [],
      },
      {
          name: 'saberAddDecimals',
          accounts: [
              {
                  name: 'addDecimalsProgram',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'wrapper',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'wrapperMint',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'wrapperUnderlyingTokens',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'owner',
                  isMut: false,
                  isSigner: true,
              },
              {
                  name: 'userUnderlyingTokens',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'userWrappedTokens',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'tokenProgram',
                  isMut: false,
                  isSigner: false,
              }
          ],
          args: [],
      },
      {
          name: 'tokenSwap',
          accounts: [
              {
                  name: 'tokenSwapProgram',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'tokenProgram',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'swap',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'authority',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'userTransferAuthority',
                  isMut: false,
                  isSigner: true,
              },
              {
                  name: 'source',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'swapSource',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'swapDestination',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'destination',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'poolMint',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'poolFee',
                  isMut: true,
                  isSigner: false,
              }
          ],
          args: [],
      },
      {
          name: 'senchaSwap',
          accounts: [
              {
                  name: 'swapProgram',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'tokenProgram',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'swap',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'userAuthority',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'inputUserAccount',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'inputTokenAccount',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'inputFeesAccount',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'outputUserAccount',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'outputTokenAccount',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'outputFeesAccount',
                  isMut: true,
                  isSigner: false,
              }
          ],
          args: [],
      },
      {
          name: 'stepSwap',
          accounts: [
              {
                  name: 'tokenSwapProgram',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'tokenProgram',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'swap',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'authority',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'userTransferAuthority',
                  isMut: false,
                  isSigner: true,
              },
              {
                  name: 'source',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'swapSource',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'swapDestination',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'destination',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'poolMint',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'poolFee',
                  isMut: true,
                  isSigner: false,
              }
          ],
          args: [],
      },
      {
          name: 'cropperSwap',
          accounts: [
              {
                  name: 'tokenSwapProgram',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'tokenProgram',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'swap',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'swapState',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'authority',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'userTransferAuthority',
                  isMut: false,
                  isSigner: true,
              },
              {
                  name: 'source',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'swapSource',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'swapDestination',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'destination',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'poolMint',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'poolFee',
                  isMut: true,
                  isSigner: false,
              }
          ],
          args: [],
      },
      {
          name: 'raydiumSwap',
          accounts: [
              {
                  name: 'swapProgram',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'tokenProgram',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'ammId',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'ammAuthority',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'ammOpenOrders',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'poolCoinTokenAccount',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'poolPcTokenAccount',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'serumProgramId',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'serumMarket',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'serumBids',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'serumAsks',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'serumEventQueue',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'serumCoinVaultAccount',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'serumPcVaultAccount',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'serumVaultSigner',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'userSourceTokenAccount',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'userDestinationTokenAccount',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'userSourceOwner',
                  isMut: false,
                  isSigner: true,
              }
          ],
          args: [],
      },
      {
          name: 'cremaSwap',
          accounts: [
              {
                  name: 'swapProgram',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'clmmConfig',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'clmmpool',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'tokenA',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'tokenB',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'accountA',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'accountB',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'tokenAVault',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'tokenBVault',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'tickArrayMap',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'owner',
                  isMut: false,
                  isSigner: true,
              },
              {
                  name: 'partner',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'partnerAtaA',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'partnerAtaB',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'tokenProgram',
                  isMut: false,
                  isSigner: false,
              }
          ],
          args: [],
      },
      {
          name: 'lifinitySwap',
          accounts: [
              {
                  name: 'swapProgram',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'authority',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'amm',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'userTransferAuthority',
                  isMut: false,
                  isSigner: true,
              },
              {
                  name: 'sourceInfo',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'destinationInfo',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'swapSource',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'swapDestination',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'poolMint',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'feeAccount',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'tokenProgram',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'pythAccount',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'pythPcAccount',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'configAccount',
                  isMut: true,
                  isSigner: false,
              }
          ],
          args: [],
      },
      {
          name: 'marinadeDeposit',
          accounts: [
              {
                  name: 'marinadeFinanceProgram',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'state',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'msolMint',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'liqPoolSolLegPda',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'liqPoolMsolLeg',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'liqPoolMsolLegAuthority',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'reservePda',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'transferFrom',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'mintTo',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'msolMintAuthority',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'systemProgram',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'tokenProgram',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'userWsolTokenAccount',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'tempWsolTokenAccount',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'userTransferAuthority',
                  isMut: true,
                  isSigner: true,
              },
              {
                  name: 'wsolMint',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'rent',
                  isMut: false,
                  isSigner: false,
              }
          ],
          args: [],
      },
      {
          name: 'marinadeUnstake',
          accounts: [
              {
                  name: 'marinadeFinanceProgram',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'state',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'msolMint',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'liqPoolSolLegPda',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'liqPoolMsolLeg',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'treasuryMsolAccount',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'getMsolFrom',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'getMsolFromAuthority',
                  isMut: false,
                  isSigner: true,
              },
              {
                  name: 'transferSolTo',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'systemProgram',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'tokenProgram',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'userWsolTokenAccount',
                  isMut: true,
                  isSigner: false,
              }
          ],
          args: [],
      },
      {
          name: 'aldrinSwap',
          accounts: [
              {
                  name: 'swapProgram',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'pool',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'poolSigner',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'poolMint',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'baseTokenVault',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'quoteTokenVault',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'feePoolTokenAccount',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'walletAuthority',
                  isMut: false,
                  isSigner: true,
              },
              {
                  name: 'userBaseTokenAccount',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'userQuoteTokenAccount',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'tokenProgram',
                  isMut: false,
                  isSigner: false,
              }
          ],
          args: [],
      },
      {
          name: 'aldrinV2Swap',
          accounts: [
              {
                  name: 'swapProgram',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'pool',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'poolSigner',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'poolMint',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'baseTokenVault',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'quoteTokenVault',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'feePoolTokenAccount',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'walletAuthority',
                  isMut: false,
                  isSigner: true,
              },
              {
                  name: 'userBaseTokenAccount',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'userQuoteTokenAccount',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'curve',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'tokenProgram',
                  isMut: false,
                  isSigner: false,
              }
          ],
          args: [],
      },
      {
          name: 'whirlpoolSwap',
          accounts: [
              {
                  name: 'swapProgram',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'tokenProgram',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'tokenAuthority',
                  isMut: false,
                  isSigner: true,
              },
              {
                  name: 'whirlpool',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'tokenOwnerAccountA',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'tokenVaultA',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'tokenOwnerAccountB',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'tokenVaultB',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'tickArray0',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'tickArray1',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'tickArray2',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'oracle',
                  isMut: false,
                  isSigner: false,
              }
          ],
          args: [],
      },
      {
          name: 'invariantSwap',
          accounts: [
              {
                  name: 'swapProgram',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'state',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'pool',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'tickmap',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'accountX',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'accountY',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'reserveX',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'reserveY',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'owner',
                  isMut: false,
                  isSigner: true,
              },
              {
                  name: 'programAuthority',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'tokenProgram',
                  isMut: false,
                  isSigner: false,
              }
          ],
          args: [],
      },
      {
          name: 'meteoraSwap',
          accounts: [
              {
                  name: 'swapProgram',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'pool',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'userSourceToken',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'userDestinationToken',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'aVault',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'bVault',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'aTokenVault',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'bTokenVault',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'aVaultLpMint',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'bVaultLpMint',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'aVaultLp',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'bVaultLp',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'adminTokenFee',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'user',
                  isMut: false,
                  isSigner: true,
              },
              {
                  name: 'vaultProgram',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'tokenProgram',
                  isMut: false,
                  isSigner: false,
              }
          ],
          args: [],
      },
      {
          name: 'goosefxSwap',
          accounts: [
              {
                  name: 'swapProgram',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'controller',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'pair',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'sslIn',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'sslOut',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'liabilityVaultIn',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'swappedLiabilityVaultIn',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'liabilityVaultOut',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'swappedLiabilityVaultOut',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'userInAta',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'userOutAta',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'feeCollectorAta',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'userWallet',
                  isMut: false,
                  isSigner: true,
              },
              {
                  name: 'feeCollector',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'tokenProgram',
                  isMut: false,
                  isSigner: false,
              }
          ],
          args: [],
      },
      {
          name: 'deltafiSwap',
          accounts: [
              {
                  name: 'swapProgram',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'marketConfig',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'swapInfo',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'userSourceToken',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'userDestinationToken',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'swapSourceToken',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'swapDestinationToken',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'deltafiUser',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'adminDestinationToken',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'pythPriceBase',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'pythPriceQuote',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'userAuthority',
                  isMut: false,
                  isSigner: true,
              },
              {
                  name: 'tokenProgram',
                  isMut: false,
                  isSigner: false,
              }
          ],
          args: [],
      },
      {
          name: 'balansolSwap',
          accounts: [
              {
                  name: 'swapProgram',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'authority',
                  isMut: true,
                  isSigner: true,
              },
              {
                  name: 'pool',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'taxMan',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'bidMint',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'treasurer',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'srcTreasury',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'srcAssociatedTokenAccount',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'askMint',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'dstTreasury',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'dstAssociatedTokenAccount',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'dstTokenAccountTaxman',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'systemProgram',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'tokenProgram',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'associatedTokenProgram',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'rent',
                  isMut: false,
                  isSigner: false,
              }
          ],
          args: [],
      },
      {
          name: 'marcoPoloSwap',
          accounts: [
              {
                  name: 'swapProgram',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'state',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'pool',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'tokenX',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'tokenY',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'poolXAccount',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'poolYAccount',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'swapperXAccount',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'swapperYAccount',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'swapper',
                  isMut: true,
                  isSigner: true,
              },
              {
                  name: 'referrerXAccount',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'referrerYAccount',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'referrer',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'programAuthority',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'systemProgram',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'tokenProgram',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'associatedTokenProgram',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'rent',
                  isMut: false,
                  isSigner: false,
              }
          ],
          args: [],
      },
      {
          name: 'dradexSwap',
          accounts: [
              {
                  name: 'swapProgram',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'pair',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'market',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'eventQueue',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'dexUser',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'marketUser',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'bids',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'asks',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 't0Vault',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 't1Vault',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 't0User',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 't1User',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'master',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'signer',
                  isMut: true,
                  isSigner: true,
              },
              {
                  name: 'systemProgram',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'tokenProgram',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'logger',
                  isMut: false,
                  isSigner: false,
              }
          ],
          args: [],
      },
      {
          name: 'lifinityV2Swap',
          accounts: [
              {
                  name: 'swapProgram',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'authority',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'amm',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'userTransferAuthority',
                  isMut: false,
                  isSigner: true,
              },
              {
                  name: 'sourceInfo',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'destinationInfo',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'swapSource',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'swapDestination',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'poolMint',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'feeAccount',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'tokenProgram',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'oracleMainAccount',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'oracleSubAccount',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'oraclePcAccount',
                  isMut: false,
                  isSigner: false,
              }
          ],
          args: [],
      },
      {
          name: 'raydiumClmmSwap',
          accounts: [
              {
                  name: 'swapProgram',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'payer',
                  isMut: false,
                  isSigner: true,
              },
              {
                  name: 'ammConfig',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'poolState',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'inputTokenAccount',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'outputTokenAccount',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'inputVault',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'outputVault',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'observationState',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'tokenProgram',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'tickArray',
                  isMut: true,
                  isSigner: false,
              }
          ],
          args: [],
      },
      {
          name: 'phoenixSwap',
          accounts: [
              {
                  name: 'swapProgram',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'logAuthority',
                  isMut: false,
                  isSigner: false,
              },
              {
                  name: 'market',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'trader',
                  isMut: false,
                  isSigner: true,
              },
              {
                  name: 'baseAccount',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'quoteAccount',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'baseVault',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'quoteVault',
                  isMut: true,
                  isSigner: false,
              },
              {
                  name: 'tokenProgram',
                  isMut: false,
                  isSigner: false,
              }
          ],
          args: [],
      }
  ],
  types: [
      {
          name: 'AmountWithSlippage',
          type: {
              kind: 'struct',
              fields: [
                  {
                      name: 'amount',
                      type: 'u64',
                  },
                  {
                      name: 'slippageBps',
                      type: 'u16',
                  }
              ],
          },
      },
      {
          name: 'SplitLegDeeper',
          type: {
              kind: 'struct',
              fields: [
                  {
                      name: 'percent',
                      type: 'u8',
                  },
                  {
                      name: 'swapLeg',
                      type: {
                          defined: 'SwapLegSwap',
                      },
                  }
              ],
          },
      },
      {
          name: 'SplitLeg',
          type: {
              kind: 'struct',
              fields: [
                  {
                      name: 'percent',
                      type: 'u8',
                  },
                  {
                      name: 'swapLeg',
                      type: {
                          defined: 'SwapLegDeeper',
                      },
                  }
              ],
          },
      },
      {
          name: 'SwapInstrution',
          type: {
              kind: 'enum',
              variants: [
                  {
                      name: 'Swap',
                      fields: [
                          {
                              defined: 'Swap',
                          }
                      ],
                  }
              ],
          },
      },
      {
          name: 'Side',
          type: {
              kind: 'enum',
              variants: [
                  {
                      name: 'Bid',
                  },
                  {
                      name: 'Ask',
                  }
              ],
          },
      },
      {
          name: 'SwapLegSwap',
          type: {
              kind: 'enum',
              variants: [
                  {
                      name: 'PlaceholderOne',
                  },
                  {
                      name: 'PlaceholderTwo',
                  },
                  {
                      name: 'Swap',
                      fields: [
                          {
                              name: 'swap',
                              type: {
                                  defined: 'Swap',
                              },
                          }
                      ],
                  }
              ],
          },
      },
      {
          name: 'SwapLegDeeper',
          type: {
              kind: 'enum',
              variants: [
                  {
                      name: 'Chain',
                      fields: [
                          {
                              name: 'swap_legs',
                              type: {
                                  vec: {
                                      defined: 'SwapLegSwap',
                                  },
                              },
                          }
                      ],
                  },
                  {
                      name: 'Split',
                      fields: [
                          {
                              name: 'split_legs',
                              type: {
                                  vec: {
                                      defined: 'SplitLegDeeper',
                                  },
                              },
                          }
                      ],
                  },
                  {
                      name: 'Swap',
                      fields: [
                          {
                              name: 'swap',
                              type: {
                                  defined: 'Swap',
                              },
                          }
                      ],
                  }
              ],
          },
      },
      {
          name: 'SwapLeg',
          type: {
              kind: 'enum',
              variants: [
                  {
                      name: 'Chain',
                      fields: [
                          {
                              name: 'swap_legs',
                              type: {
                                  vec: {
                                      defined: 'SwapLegDeeper',
                                  },
                              },
                          }
                      ],
                  },
                  {
                      name: 'Split',
                      fields: [
                          {
                              name: 'split_legs',
                              type: {
                                  vec: {
                                      defined: 'SplitLeg',
                                  },
                              },
                          }
                      ],
                  },
                  {
                      name: 'Swap',
                      fields: [
                          {
                              name: 'swap',
                              type: {
                                  defined: 'Swap',
                              },
                          }
                      ],
                  }
              ],
          },
      },
      {
          name: 'Swap',
          type: {
              kind: 'enum',
              variants: [
                  {
                      name: 'Saber',
                  },
                  {
                      name: 'SaberAddDecimalsDeposit',
                  },
                  {
                      name: 'SaberAddDecimalsWithdraw',
                  },
                  {
                      name: 'TokenSwap',
                  },
                  {
                      name: 'Sencha',
                  },
                  {
                      name: 'Step',
                  },
                  {
                      name: 'Cropper',
                  },
                  {
                      name: 'Raydium',
                  },
                  {
                      name: 'Crema',
                      fields: [
                          {
                              name: 'a_to_b',
                              type: 'bool',
                          }
                      ],
                  },
                  {
                      name: 'Lifinity',
                  },
                  {
                      name: 'Mercurial',
                  },
                  {
                      name: 'Cykura',
                  },
                  {
                      name: 'Serum',
                      fields: [
                          {
                              name: 'side',
                              type: {
                                  defined: 'Side',
                              },
                          }
                      ],
                  },
                  {
                      name: 'MarinadeDeposit',
                  },
                  {
                      name: 'MarinadeUnstake',
                  },
                  {
                      name: 'Aldrin',
                      fields: [
                          {
                              name: 'side',
                              type: {
                                  defined: 'Side',
                              },
                          }
                      ],
                  },
                  {
                      name: 'AldrinV2',
                      fields: [
                          {
                              name: 'side',
                              type: {
                                  defined: 'Side',
                              },
                          }
                      ],
                  },
                  {
                      name: 'Whirlpool',
                      fields: [
                          {
                              name: 'a_to_b',
                              type: 'bool',
                          }
                      ],
                  },
                  {
                      name: 'Invariant',
                      fields: [
                          {
                              name: 'x_to_y',
                              type: 'bool',
                          }
                      ],
                  },
                  {
                      name: 'Meteora',
                  },
                  {
                      name: 'GooseFX',
                  },
                  {
                      name: 'DeltaFi',
                      fields: [
                          {
                              name: 'stable',
                              type: 'bool',
                          }
                      ],
                  },
                  {
                      name: 'Balansol',
                  },
                  {
                      name: 'MarcoPolo',
                      fields: [
                          {
                              name: 'x_to_y',
                              type: 'bool',
                          }
                      ],
                  },
                  {
                      name: 'Dradex',
                      fields: [
                          {
                              name: 'side',
                              type: {
                                  defined: 'Side',
                              },
                          }
                      ],
                  },
                  {
                      name: 'LifinityV2',
                  },
                  {
                      name: 'RaydiumClmm',
                  },
                  {
                      name: 'Openbook',
                      fields: [
                          {
                              name: 'side',
                              type: {
                                  defined: 'Side',
                              },
                          }
                      ],
                  },
                  {
                      name: 'Phoenix',
                      fields: [
                          {
                              name: 'side',
                              type: {
                                  defined: 'Side',
                              },
                          }
                      ],
                  }
              ],
          },
      },
      {
          name: 'SwapAction',
          type: {
              kind: 'enum',
              variants: [
                  {
                      name: 'SetupSplit',
                      fields: [
                          {
                              name: 'percents',
                              type: 'bytes',
                          }
                      ],
                  },
                  {
                      name: 'NextSplitLeg',
                  },
                  {
                      name: 'MergeSplit',
                  },
                  {
                      name: 'Swap',
                      fields: [
                          {
                              name: 'swap',
                              type: {
                                  defined: 'Swap',
                              },
                          }
                      ],
                  }
              ],
          },
      }
  ],
  events: [
      {
          name: 'Swap',
          fields: [
              {
                  name: 'amm',
                  type: 'publicKey',
                  index: false,
              },
              {
                  name: 'inputMint',
                  type: 'publicKey',
                  index: false,
              },
              {
                  name: 'inputAmount',
                  type: 'u64',
                  index: false,
              },
              {
                  name: 'outputMint',
                  type: 'publicKey',
                  index: false,
              },
              {
                  name: 'outputAmount',
                  type: 'u64',
                  index: false,
              }
          ],
      },
      {
          name: 'Fee',
          fields: [
              {
                  name: 'account',
                  type: 'publicKey',
                  index: false,
              },
              {
                  name: 'mint',
                  type: 'publicKey',
                  index: false,
              },
              {
                  name: 'amount',
                  type: 'u64',
                  index: false,
              }
          ],
      }
  ],
  errors: [
      {
          code: 6000,
          name: 'EmptyRoute',
          msg: 'Empty route',
      },
      {
          code: 6001,
          name: 'SlippageToleranceExceeded',
          msg: 'Slippage tolerance exceeded',
      },
      {
          code: 6002,
          name: 'InvalidCalculation',
          msg: 'Invalid calculation',
      },
      {
          code: 6003,
          name: 'MissingPlatformFeeAccount',
          msg: 'Missing platform fee account',
      },
      {
          code: 6004,
          name: 'InvalidSlippage',
          msg: 'Invalid slippage',
      },
      {
          code: 6005,
          name: 'NotEnoughPercent',
          msg: 'Not enough percent to 100',
      },
      {
          code: 6006,
          name: 'InAmountsStackIsEmpty',
          msg: 'In amounts stack is empty',
      },
      {
          code: 6007,
          name: 'OutAmountsStackIsEmpty',
          msg: 'Out amounts stack is empty',
      },
      {
          code: 6008,
          name: 'NotEnoughAccountKeys',
          msg: 'Not Enough Account keys',
      }
  ],
} as anchor.Idl;

import jsbi from 'jsbi';
import { defaultImport } from 'default-import';
import * as anchor from '@coral-xyz/anchor';
import { logger } from './logger.js';
import { Timings } from './types.js';
import {
  calculateSwapLegAndAccounts,
} from './markets/index.js';
import { lookupTableProvider } from './lookup-table-provider.js';

import { SwapLegAndAccounts } from '@jup-ag/core/dist/lib/amm.js';

import { MarginfiClient, getConfig } from "mrgn-ts";
import { PublicKey } from "@solana/web3.js";
import { NATIVE_MINT } from '@mrgnlabs/mrgn-common';


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

const PROFIT_BUFFER_PERCENT = 3;

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

const TIP_PERCENT = config.get('tip_percent');

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
const jupiterProgram = new anchor.Program(IDL, JUPITER_PROGRAM_ID, provider);


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
    const expectedProfitMinusFee = expectedProfit; //JSBI.subtract(expectedProfit, flashloanFee);

    const tip = JSBI.divide(
      JSBI.multiply(expectedProfitMinusFee, JSBI.BigInt(TIP_PERCENT)),
      JSBI.BigInt(100),
    );

    const profitBuffer = JSBI.divide(
      JSBI.multiply(expectedProfitMinusFee, JSBI.BigInt(PROFIT_BUFFER_PERCENT)),
      JSBI.BigInt(100),
    );

    const tipLamports = JSBI.BigInt(1_000_000);

    // arb size + tip + flashloan fee + profit buffer
    const minOut = JSBI.add(
      JSBI.add(arbSize, tip),
      profitBuffer,
    );

    const setUpIxns: TransactionInstruction[] = [];
    const setUpSigners: Keypair[] = [payer];

    let sourceTokenAccount: PublicKey;

    let USDC_ATA 
    try {
        USDC_ATA = await Token.getOrCreateAssociatedTokenAccount(connection, payer, hop0SourceMint, payer.publicKey);
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
        programId: Token.TOKEN_PROGRAM_ID,
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
    const client = await getMarginfiClient({readonly: true, authority: new PublicKey("7ihN8QaTfNoDTRTQGULCzbUT3PHwPDTu5Brcu4iT2paP"), provider, wallet});

    console.log(`Using ${client.config.environment} environment; wallet: ${client.wallet.publicKey.toBase58()}`);
  
    const marginfiAccount = await MarginfiAccountWrapper.fetch("EW1iozTBrCgyd282g2eemSZ8v5xs7g529WFv4g69uuj2", client);
    const mint = new PublicKey(hop0SourceMint);
    const solBank = client.getBankByMint(mint);
    if (!solBank) {
         logger.info("SOL bank not found");
        continue
    }

    
    const depositIx = await marginfiAccount.makeDepositIx((1 / solBank.mintDecimals ** 10), solBank.address);
    setUpIxns.push(...depositIx.instructions);

    const legs = {
      chain: {
        swapLegs: [],
      },
    };

    const allSwapAccounts: AccountMeta[] = [];

    const legAndAccountsPromises: Promise<SwapLegAndAccounts>[] = [];

    route.forEach(async (hop, i) => {
      const sourceMint = new PublicKey(
        hop.fromA ? hop.market.tokenMintA : hop.market.tokenMintB,
      );
      const destinationMint = new PublicKey(
        hop.fromA ? hop.market.tokenMintB : hop.market.tokenMintA,
      );
      const userSourceTokenAccount =
        i === 0 ? sourceTokenAccount : getAta(sourceMint, payer.publicKey);
      const userDestinationTokenAccount =
        i === route.length - 1
          ? sourceTokenAccount
          : getAta(destinationMint, payer.publicKey);
      const legAndAccountsPromise = calculateSwapLegAndAccounts(
        hop.market.id,
        {
          sourceMint,
          destinationMint,
          userSourceTokenAccount,
          userDestinationTokenAccount,
          userTransferAuthority: payer.publicKey,
          amount: i === 0 ? arbSize : hop.tradeOutputOverride.in,
          swapMode: SwapMode.ExactIn,
        },
        undefined,
        true,
      );
      legAndAccountsPromises.push(legAndAccountsPromise);
    });

    const legAndAccounts = await Promise.all(legAndAccountsPromises);
    

    for (const [leg, accounts] of legAndAccounts) {
      legs.chain.swapLegs.push(leg);
      allSwapAccounts.push(...accounts);
    }
    if (allSwapAccounts.length > 0){
    const instructionsMain: TransactionInstruction[] = [];

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const borrowIx = await marginfiAccount.makeBorrowIx((arbSizeDecimals), solBank.address);
    instructionsMain.push(...borrowIx.instructions);
    const jupiterIxn = jupiterProgram.instruction.route(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        legs as any,
        new BN(arbSize.toString()),
        new BN(minOut.toString()),
        2380,
        0,
        {
          accounts: {
            tokenProgram: Token.TOKEN_PROGRAM_ID,
            userTransferAuthority: payer.publicKey,
            destinationTokenAccount: sourceTokenAccount,
          },
          remainingAccounts: allSwapAccounts,
          signers: [payer],
        },
      );
  

    
    instructionsMain.push(jupiterIxn);
    if (arbSizeDecimals.length > 52){
        logger.info("arbSizeDecimals too big")
        continue;
    }
    const depositIx = await marginfiAccount.makeDepositIx(JSBI.toNumber(JSBI.add(JSBI.BigInt(arbSize),JSBI.divide(expectedProfit, JSBI.BigInt(3)))) / solBank.mintDecimals ** 10, solBank.address);
    instructionsMain.push(...depositIx.instructions);

    const endIndex = instructionsMain.length + 1;

    const beginFlashLoanIx = await marginfiAccount.makeBeginFlashLoanIx(endIndex);
    const endFlashLoanIx = await marginfiAccount.makeEndFlashLoanIx();
    // eslint-disable-next-line prefer-const
    let ixs = [
      ...beginFlashLoanIx.instructions,
      ...instructionsMain,
      ...endFlashLoanIx.instructions,
    ]
    console.log(beginFlashLoanIx.instructions.length, instructionsMain.length, endFlashLoanIx.instructions.length, ixs.length)

    if (!isUSDC) {
      const closeSolTokenAcc = Token.createCloseAccountInstruction(
        sourceTokenAccount,
        payer.publicKey,
        payer.publicKey,
      );
      instructionsMain.push(closeSolTokenAcc);
    }
    const tipIxn = SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey: getRandomTipAccount(),
      lamports: 1_000_000
    });
    ixs.push(tipIxn);

    const messageSetUp = new TransactionMessage({
      payerKey: payer.publicKey,
      recentBlockhash: txn.message.recentBlockhash,
      instructions: setUpIxns,
    }).compileToV0Message();
    const txSetUp = new VersionedTransaction(messageSetUp);
    txSetUp.sign(setUpSigners);

    const addressesMain: PublicKey[] = [];
    ixs.forEach((ixn) => {
      ixn.keys.forEach((key) => {
        addressesMain.push(key.pubkey);
      });
    });
    const MIN_ADDRESSES_TO_INCLUDE_TABLE = 2;
    const MAX_TABLE_COUNT = 11;

    const startCalc = new Date().getTime();

    const addressSet = new Set<string>();
    const tableIntersections = new Map<string, number>();
    const selectedTables: AddressLookupTableAccount[] = [];
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

    for (const [lutKey, _] of sortedIntersectionArray) {
      if (selectedTables.length >= MAX_TABLE_COUNT) break;

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

     
      
    const messageMain = new TransactionMessage({
      payerKey: payer.publicKey,
      recentBlockhash: txn.message.recentBlockhash,
      instructions: ixs,
    }).compileToV0Message(selectedTables);
    const txMain = new VersionedTransaction(messageMain);
    try {
      const serializedMsg = txMain.serialize();
      if (serializedMsg.length > 1232) {
        console.log(serializedMsg.length)
        logger.error('tx too big');
        continue;
      }
    } catch (e) {
      logger.error(e, 'error signing txMain');
      continue;
   
    }
    txMain.sign([payer]);
    const bundle = [txSetUp, txMain];

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
