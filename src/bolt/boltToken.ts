import {
  Transaction,
  PrivateKey,
  P2PKH,
  Hash
} from "@bsv/sdk";
import BoltNonFungibleTemplate from "./templates/boltNonFungible.ts";
import Pay2BoltTemplate from "./templates/pay2Bolt.ts";
import { utf8ToByteArray, verifyTx } from "./boltLib.ts";

// Base Bolt Protocol Token class
export abstract class BoltToken {
  tx?: Transaction;
  voutIdx?: number;
  prevTxs: Transaction[] = []; // We only need to store a maximum of two previous txs (e.g. B2G solved)
  pubKey: number[] = [];
  privKey!: PrivateKey; // FOR TESTING ONLY NOT PRODUCTION !!!
  // Helpful test duplicates (stored on-chain otherwise)
  mintData?: number[];
  pubKeyHash?: number[];

  constructor() {}
  abstract mint(
    privKey: PrivateKey,
    sourceTransaction: Transaction,
    mintData?: string
  ): any;
  abstract transfer(toPrivKey: PrivateKey): any;
}

// Non-fungible token subclass, where each token is unique
export class BoltNonFungibleToken extends BoltToken {
  async mint(
    privKey: PrivateKey,
    sourceTransaction: Transaction,
    mintData: string = "Bitcoin Original Layer-1 Token Protocol; BOLT: Non-Fungible v0.1"
  ) {
    console.log(`Minting token`);
    // Code for minting token goes here
    return this;
  }

  createTransferInputs = (
    toPrivKey: PrivateKey,
    miscData: string,
    isCommitTx = true
  ) => {
    const input = {
      sourceTransaction: this.tx,
      sourceOutputIndex: this.voutIdx as number,
      unlockingScriptTemplate: new BoltNonFungibleTemplate().unlock(
        this.privKey,
        toPrivKey.toPublicKey().encode(true) as number[],
        utf8ToByteArray(miscData),
        this.prevTxs as Transaction[]
      ),
      sequence: 0xffffffff,
    };
    const funding = {
      sourceTransaction: this.tx,
      sourceOutputIndex: this.tx?.outputs ? this.tx?.outputs.length - 1 : 0,
      unlockingScriptTemplate: new P2PKH().unlock(this.privKey),
      sequence: 0xffffffff,
    };
    if (!isCommitTx && this.prevTxs.length >= 3) {
      const ancestorTx = this.prevTxs[this.prevTxs.length - 3];
      const bolt = {
        sourceTransaction: ancestorTx,
        sourceOutputIndex: ancestorTx?.outputs
          ? ancestorTx?.outputs.length - 2
          : 0,
        unlockingScriptTemplate: new Pay2BoltTemplate().unlock(this.privKey),
        sequence: 0xffffffff,
      };
      return [input, bolt, funding];
    }
    return [input, funding];
  };

  createTransferOutputs = (toPrivKey: PrivateKey, isCommitTx = true) => {
    const toPubKeyHash = Hash.hash160(toPrivKey.toPublicKey().encode(true));
    const pubKeyHashCommit = isCommitTx
      ? toPubKeyHash
      : new Array(20).fill(0x00);
    const tokenLocking = new BoltNonFungibleTemplate().lock(
      isCommitTx
        ? this.pubKey
        : (toPrivKey.toPublicKey().encode(true) as number[]),
      this.prevTxs,
      [0xb0, 0x17], // `bolt` Enforced throughout lifecycle
      pubKeyHashCommit
    );
    const tokenOut = { lockingScript: tokenLocking, satoshis: 1 };
    const boltOut = {
      lockingScript: new Pay2BoltTemplate().lock(pubKeyHashCommit),
      satoshis: 1,
    };
    const changeOut = {
      change: true,
      lockingScript: new P2PKH().lock(
        isCommitTx ? (this.pubKeyHash as number[]) : toPubKeyHash
      ),
    };
    if (!isCommitTx) return [tokenOut, changeOut];
    return [tokenOut, boltOut, changeOut];
  };

  async transfer(
    toPrivKey: PrivateKey,
    commitTxMiscData: string = "Bolt Protocol Transfer Commit Transaction Miscellaneous Data",
    settleTxMiscData: string = "Bolt Protocol Transfer Settle Transaction Miscellaneous Data"
  ) {
    // console.log(
    //   `Token transfer #${
    //     (this.prevTxs.length - 1) / 2 + 1
    //   } to: ${toPrivKey.toAddress("test")}`
    // );

    // Create and finalize the commit transaction
    const version = 1;
    const inputs = this.createTransferInputs(toPrivKey, commitTxMiscData);
    const outputs = this.createTransferOutputs(toPrivKey);
    const commitTx = new Transaction(version, inputs, outputs);
    console.log({commitTx})

    // TODO: Calculate fee before signing
    await commitTx.fee(3);
    await commitTx.sign();
    this.tx = commitTx;

    console.log(commitTx.toHex())
    // Validate tx before continuing
    let { valid } = verifyTx(commitTx);
    if (!valid) throw new Error("Commit tx not valid");
    // console.log({ commitTx: commitTx.id('hex'), valid });
    this.prevTxs?.push(this.tx);

    // Now we make the settle tx
    const settleInputs = this.createTransferInputs(
      toPrivKey,
      settleTxMiscData,
      false
    );
    const settleOutputs = this.createTransferOutputs(toPrivKey, false);
    const settleTx = new Transaction(version, settleInputs, settleOutputs);

    // TODO: Calculate fee before signing
    await settleTx.fee(3);
    await settleTx.sign();
    this.tx = settleTx;

      // Validate tx before continuing
    ({ valid } = verifyTx(settleTx))
    if (!valid) throw new Error("Settle tx not valid");
    // console.log({ settleTxid: settleTx.id('hex'), valid });
    this.prevTxs?.push(this.tx);

    // Store the identifying data
    this.privKey = toPrivKey;
    this.pubKey = toPrivKey.toPublicKey().encode(true) as number[];
    this.pubKeyHash = Hash.hash160(this.pubKey);
    return this;
  }
}
