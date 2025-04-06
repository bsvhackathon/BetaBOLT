import {
  ScriptTemplate,
  LockingScript,
  Script,
  PrivateKey,
  UnlockingScript,
  Transaction,
  TransactionSignature,
  Hash,
  Utils,
} from "@bsv/sdk";
import { getAncestorPiece } from "../boltLib.ts";

export default class BoltNonFungibleTemplate implements ScriptTemplate {
  lock(
    toPubKey: number[],
    prevTxs: Transaction[],
    mintData: number[] = [0xb0, 0x17],
    pubKeyHashCommitment: number[] = new Array(20).fill(0x00),
    prevVoutIdx: number = 0
  ): LockingScript {
    const isGenesis = prevTxs.length === 0;
    const prevTx = prevTxs.slice(-1)[0];
    const prevTokenOutputChunks =
      prevTx?.outputs[prevVoutIdx].lockingScript.chunks;
    const pubKeyHash = Hash.hash160(toPubKey);
    const writer = new Utils.Writer();
    writer.write(
      Utils.toArray(prevTx?.hash() || new Array(32).fill(0x00), "hex")
    );
    writer.writeUInt32LE(prevVoutIdx);
    const parentOutpoint: number[] = writer.toArray();
    const grandparentOutpoint: number[] =
      prevTokenOutputChunks?.[4].data || new Array(36).fill(0x00);
    const issuerPubKey: number[] = isGenesis
      ? toPubKey
      : (prevTokenOutputChunks?.[6].data as number[]);
    let genesis =
      prevTxs.length === 1
        ? (prevTx.hash() as number[]).concat(new Array(4).fill(0x00))
        : (prevTokenOutputChunks?.[7].data as number[]);
    const genesisOutpoint: number[] = isGenesis
      ? new Array(36).fill(0x00)
      : genesis;
    const prevTxoType = prevTokenOutputChunks?.[3].data?.[0];
    const txoType = isGenesis ? [0x00] : prevTxoType === 0x00 ? [0x21] : [0x00];
    const lockingScript = new LockingScript([
      ...new Script().writeBin(mintData).chunks,
      ...new Script().writeBin(pubKeyHash).chunks,
      ...new Script().writeBin(pubKeyHashCommitment).chunks,
      ...new Script().writeBin(txoType).chunks,
      ...new Script().writeBin(parentOutpoint).chunks,
      ...new Script().writeBin(grandparentOutpoint).chunks,
      ...new Script().writeBin(issuerPubKey).chunks,
      ...new Script().writeBin(genesisOutpoint).chunks,
      ...Script.fromHex(
        "81917276819276915679819a54799b6354795b798868597973637601416d547f01207f01207f01247f517f7c7601fd876375527f7c6701007e68817f587f547f01207f547f557a011279827776014ba163516776014ca163526776014da163536776014e87635568686868937f01157f01157f527f01257f01257f01227f01257f5d797681518801187964081d02b0178876a9147e011f797e0288ac7e680402b0171401197964011b67011a68797e0114011a796401217967140000000000000000000000000000000000000000687e7e0119796302010067020121687e01240111797e7e56797e54797e0117796301240111797e675379687e52797e8201fd7c7e766b60797c7e7c7e011979647c7e6777680120797eaa5c79885e79011879810114799a63013179527e0131797e0130797e012f798276014ba1636776014ca163014c7c516776014da163014d7c526776014e7c546868807e687c7e7e012e797e012d797e012c797e012b7953797e768201fd7c7e7c7e777e012a797e0129797e0128797e0127797e0126797e0125797e537e5f797e6c7e0124797e52797e5f797e081d02b0178876a9147e011b797e0288ac7e0123797eaa7601167901207f758804010000007e7e67012f79012f79012f79012f79012f79012f79012f79012f79012f79012f79012f79012f79012f79012f797e7e7e7e7e7e7e7e7e7e7e7e7e82770088680121797eaa0111798868011d79011d7976a9011c7988ac6b6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d746375686c"
      ).chunks,
    ]);
    return lockingScript;
  }
  unlock(
    privateKey: PrivateKey,
    toPubKey: number[],
    miscData: number[] = [],
    prevTxs: Transaction[],
    sourceSatoshis?: number,
    lockingScript?: Script
  ): {
    sign: (tx: Transaction, inputIndex: number) => Promise<UnlockingScript>;
    estimateLength: () => Promise<111>;
  } {
    return {
      sign: async (tx: Transaction, inputIndex: number) => {
        let signatureScope =
          TransactionSignature.SIGHASH_FORKID |
          TransactionSignature.SIGHASH_ALL;
        const input = tx.inputs[inputIndex];
        const otherInputs = tx.inputs.filter(
          (_, index) => index !== inputIndex
        );
        const sourceTXID = input.sourceTXID
          ? input.sourceTXID
          : input.sourceTransaction?.id("hex");
        if (!sourceTXID) {
          throw new Error(
            "The input sourceTXID or sourceTransaction is required for transaction signing."
          );
        }
        sourceSatoshis ||=
          input.sourceTransaction?.outputs[input.sourceOutputIndex].satoshis;
        if (!sourceSatoshis) {
          throw new Error(
            "The sourceSatoshis or input sourceTransaction is required for transaction signing."
          );
        }
        lockingScript ||=
          input.sourceTransaction?.outputs[input.sourceOutputIndex]
            .lockingScript;
        if (!lockingScript) {
          throw new Error(
            "The lockingScript or input sourceTransaction is required for transaction signing."
          );
        }

        const preimage = TransactionSignature.format({
          sourceTXID,
          sourceOutputIndex: input.sourceOutputIndex,
          sourceSatoshis,
          transactionVersion: tx.version,
          otherInputs,
          inputIndex,
          outputs: tx.outputs,
          inputSequence: input.sequence as number,
          subscript: lockingScript,
          lockTime: tx.lockTime,
          scope: signatureScope,
        });
        const rawSignature = privateKey.sign(Hash.sha256(preimage));
        const sig = new TransactionSignature(
          rawSignature.r,
          rawSignature.s,
          signatureScope
        );
        const sigForScript = sig.toChecksigFormat();
        const pubkeyForScript = privateKey
          .toPublicKey()
          .encode(true) as number[];
        const toPubKeyHash = Hash.hash160(toPubKey as number[]);

        const prevTx = prevTxs.slice(-1)[0];
        const prevTokenOutputChunks = prevTx?.outputs[0].lockingScript.chunks;
        const lastTxoType = Utils.toHex(
          prevTokenOutputChunks?.[3].data || [0xff]
        );
        const rebuildingAncestor = prevTxs.length >= 3 && lastTxoType === "21";;
        const ancestorTx = prevTxs[prevTxs.length - 3];
        let ancestorVer: number[] = rebuildingAncestor
          ? getAncestorPiece("ancestorVer", ancestorTx)
          : [];
        let ancestorVin1Outpoint: number[] = rebuildingAncestor
          ? getAncestorPiece("ancestorVin1Outpoint", ancestorTx)
          : [];
        let ancestorVin1ScriptVi: number[] = rebuildingAncestor
          ? getAncestorPiece("ancestorVin1ScriptVi", ancestorTx)
          : [];
        let ancestorVin1MiscData: number[] = rebuildingAncestor
          ? getAncestorPiece("ancestorVin1MiscData", ancestorTx)
          : [];
        let ancestorVin1AncData: number[] = rebuildingAncestor
          ? getAncestorPiece("ancestorVin1AncData", ancestorTx)
          : [];
        let ancestorVin1DataToCTX: number[] = rebuildingAncestor
          ? getAncestorPiece("ancestorVin1DataToCTX", ancestorTx)
          : [];
        let ancestorVin1CTXToScriptCode: number[] = rebuildingAncestor
          ? getAncestorPiece("ancestorVin1CTXToScriptCode", ancestorTx)
          : [];
        let ancestorVin1CTXScriptCodeData: number[] = rebuildingAncestor
          ? getAncestorPiece("ancestorVin1CTXScriptCodeData", ancestorTx)
          : [];
        let ancestorVin1CTXEnd: number[] = rebuildingAncestor
          ? getAncestorPiece("ancestorVin1CTXEnd", ancestorTx)
          : [];
        let ancestorVin1NSequence: number[] = rebuildingAncestor
          ? getAncestorPiece("ancestorVin1NSequence", ancestorTx)
          : [];
        let ancestorVin2Outpoint: number[] = rebuildingAncestor
          ? getAncestorPiece("ancestorVin2Outpoint", ancestorTx)
          : [];
        let ancestorVin2ScriptVi: number[] = rebuildingAncestor
          ? getAncestorPiece("ancestorVin2ScriptVi", ancestorTx)
          : [];
        let ancestorVin2Script: number[] = rebuildingAncestor
          ? getAncestorPiece("ancestorVin2Script", ancestorTx)
          : [];
        let ancestorVin2NSequence: number[] = rebuildingAncestor
          ? getAncestorPiece("ancestorVin2NSequence", ancestorTx)
          : [];
        let ancestorVout1Data: number[] = rebuildingAncestor
          ? getAncestorPiece("ancestorVout1Data", ancestorTx)
          : [];
        let ancestorChangeNLockTime: number[] = rebuildingAncestor
          ? getAncestorPiece("ancestorChangeNLockTime", ancestorTx)
          : [];

        let fundOutpoint: number[] = []; // Always the last input
        const fundInput = tx.inputs[tx.inputs.length - 1];
        const writer = new Utils.Writer();
        if (fundInput.sourceTransaction !== undefined) {
          const hashResult = fundInput.sourceTransaction.hash();
          writer.write(hashResult as number[]);
        } else {
          console.error("sourceTransaction is undefined");
        }
        writer.writeUInt32LE(fundInput.sourceOutputIndex);
        fundOutpoint = writer.toArray();
        let changeOutput: number[] = []; // Always the last output
        const lastOut = tx.outputs[tx.outputs.length - 1];
        const changeWriter = new Utils.Writer();
        changeWriter.writeUInt64LE(lastOut.satoshis as number);
        const scriptBin = lastOut.lockingScript.toBinary();
        changeWriter.writeVarIntNum(scriptBin.length);
        changeWriter.write(scriptBin);
        changeOutput = changeWriter.toArray();
        let beneficiaryPubKeyHash: number[] = toPubKeyHash;
        let pubKey: number[] = pubkeyForScript;
        let ctx: number[] = preimage;
        const unlockingScript = new UnlockingScript([
          ...new Script().writeBin(miscData).chunks,
          ...new Script().writeBin(ancestorVer).chunks,
          ...new Script().writeBin(ancestorVin1Outpoint).chunks,
          ...new Script().writeBin(ancestorVin1ScriptVi).chunks,
          ...new Script().writeBin(ancestorVin1MiscData).chunks,
          ...new Script().writeBin(ancestorVin1AncData).chunks,
          ...new Script().writeBin(ancestorVin1DataToCTX).chunks,
          ...new Script().writeBin(ancestorVin1CTXToScriptCode).chunks,
          ...new Script().writeBin(ancestorVin1CTXScriptCodeData).chunks,
          ...new Script().writeBin(ancestorVin1CTXEnd).chunks,
          ...new Script().writeBin(ancestorVin1NSequence).chunks,
          ...new Script().writeBin(ancestorVin2Outpoint).chunks,
          ...new Script().writeBin(ancestorVin2ScriptVi).chunks,
          ...new Script().writeBin(ancestorVin2Script).chunks,
          ...new Script().writeBin(ancestorVin2NSequence).chunks,
          ...new Script().writeBin(ancestorVout1Data).chunks,
          ...new Script().writeBin(ancestorChangeNLockTime).chunks,
          ...new Script().writeBin(fundOutpoint).chunks,
          ...new Script().writeBin(changeOutput).chunks,
          ...new Script().writeBin(beneficiaryPubKeyHash).chunks,
          ...new Script().writeBin(sigForScript).chunks,
          ...new Script().writeBin(pubKey).chunks,
          ...new Script().writeBin(ctx).chunks,
        ]);
        return unlockingScript;
      },
      estimateLength: async () => {
        // public key (1+33) + signature (1+73)
        return 111;
      },
    };
  }
}
