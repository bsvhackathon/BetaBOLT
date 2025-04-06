// boltLib.ts
import { Script, Spend, Transaction, Utils } from "@bsv/sdk";
import { BoltNonFungibleToken } from "./boltToken.ts";

const getVersion = (tx: Transaction): number[] => {
  const writer = new Utils.Writer();
  writer.writeUInt32LE(tx.version);
  return writer.toArray();
};

const getVinOutpoint = (tx: Transaction, vinIndex: number): number[] => {
  const writer = new Utils.Writer();
  let input = tx.inputs[vinIndex];
  writer.write(input.sourceTransaction?.hash() as number[]);
  writer.writeUInt32LE(input.sourceOutputIndex);
  return writer.toArray();
};

const getVinScriptVi = (tx: Transaction, vinIndex: number): number[] => {
  const writer = new Utils.Writer();
  let input = tx.inputs[vinIndex];
  writer.writeVarIntNum(input?.unlockingScript?.toBinary().length || 0);
  return writer.toArray();
};

const getVinChunk = (
  tx: Transaction,
  vinIndex: number,
  chunkIdx: number
): number[] => {
  const writer = new Utils.Writer();
  let inputScript = tx.inputs[vinIndex].unlockingScript;
  const chunk = inputScript?.chunks?.[chunkIdx];
  writer.write(chunk?.data || []);
  return writer.toArray();
};

const getVinPushDatas = (
  tx: Transaction,
  vinIndex: number,
  startChunk: number,
  count: number = 1
): number[] => {
  const tmpScript = new Script();
  let inputScript = tx.inputs[vinIndex].unlockingScript;
  for (let c = startChunk; c < startChunk + count; c++) {
    const chunk = inputScript?.chunks?.[c];
    tmpScript.writeBin(chunk?.data || []);
  }
  return tmpScript.toBinary();
};

const getVinCTXPiece = (
  tx: Transaction,
  vinIndex: number,
  piece: number
): number[] => {
  const writer = new Utils.Writer();
  let inputScript = tx.inputs[vinIndex].unlockingScript;
  const ctx = inputScript?.chunks[22].data;
  const tmpScript = new Script();
  tmpScript.writeBin(ctx || []);
  const scriptBin = tmpScript.toBinary();
  const headerLen = scriptBin.length - (ctx?.length || 0);
  const scriptCodeStart = 104 + headerLen;
  const scriptCodeBuf = scriptBin?.slice(scriptCodeStart);
  const reader = new Utils.Reader(scriptCodeBuf);
  const scriptCodeLen = reader.readVarIntNum();
  switch (piece) {
    case 0:
      writer.write(scriptBin?.slice(0, scriptCodeStart) || []);
      break;
    case 1:
      const scriptCode = Script.fromBinary(
        scriptCodeBuf?.slice(reader.pos, reader.pos + scriptCodeLen || 0)
      );
      const scriptData = new Script();
      const pushDatas = 8;
      for (let i = 0; i < pushDatas; i++) {
        scriptData.chunks.push(scriptCode.chunks[i]);
      }
      writer.write(scriptData.toBinary() || []);
      break;
    case 2:
      const remainingCtx = scriptBin.slice(
        scriptCodeStart + scriptCodeLen + reader.pos
      );
      writer.write(remainingCtx || []);
      break;
  }
  return writer.toArray();
};

const getVinNSequence = (tx: Transaction, vinIndex: number): number[] => {
  const writer = new Utils.Writer();
  let input = tx.inputs[vinIndex];
  writer.writeUInt32LE(input.sequence || 0xffffffff);
  return writer.toArray();
};

const getVinScript = (tx: Transaction, vinIndex: number): number[] => {
  let input = tx.inputs[vinIndex];
  return input.unlockingScript?.toBinary() || [];
};

const getVoutData = (tx: Transaction, voutIndex: number): number[] => {
  let outputScript = tx.outputs[voutIndex].lockingScript;
  const scriptData = new Script();
  const pushDatas = 8;
  for (let i = 0; i < pushDatas; i++) {
    scriptData.chunks.push(outputScript.chunks[i]);
  }
  return scriptData.toBinary();
};

const getChangeNLockTime = (tx: Transaction, index: number): number[] => {
  const writer = new Utils.Writer();
  let output = tx.outputs[index];
  writer.writeUInt64LE(output.satoshis || 0);
  const scriptBin = output.lockingScript.toBinary();
  writer.writeVarIntNum(scriptBin.length);
  writer.write(scriptBin);
  writer.writeUInt32LE(tx.lockTime);
  return writer.toArray();
};

export const getAncestorPiece = (
  piece: string,
  ancestorTx: Transaction
): number[] => {
  let res: number[] = [];
  switch (piece) {
    case "ancestorVer":
      res = getVersion(ancestorTx);
      break;
    case "ancestorVin1Outpoint":
      res = getVinOutpoint(ancestorTx, 0);
      break;
    case "ancestorVin1ScriptVi":
      res = getVinScriptVi(ancestorTx, 0);
      break;
    case "ancestorVin1MiscData":
      res = getVinChunk(ancestorTx, 0, 0);
      break;
    case "ancestorVin1AncData":
      res = getVinPushDatas(ancestorTx, 0, 1, 16);
      break;
    case "ancestorVin1DataToCTX":
      res = getVinPushDatas(ancestorTx, 0, 17, 5);
      break;
    case "ancestorVin1CTXToScriptCode":
      res = getVinCTXPiece(ancestorTx, 0, 0);
      break;
    case "ancestorVin1CTXScriptCodeData":
      res = getVinCTXPiece(ancestorTx, 0, 1);
      break;
    case "ancestorVin1CTXEnd":
      res = getVinCTXPiece(ancestorTx, 0, 2);
      break;
    case "ancestorVin1NSequence":
      res = getVinNSequence(ancestorTx, 0);
      break;
    case "ancestorVin2Outpoint":
      res = getVinOutpoint(ancestorTx, 1);
      break;
    case "ancestorVin2ScriptVi":
      res = getVinScriptVi(ancestorTx, 1);
      break;
    case "ancestorVin2Script":
      res = getVinScript(ancestorTx, 1);
      break;
    case "ancestorVin2NSequence":
      res = getVinNSequence(ancestorTx, 1);
      break;
    case "ancestorVout1Data":
      res = getVoutData(ancestorTx, 0);
      break;
    case "ancestorChangeNLockTime":
      res = getChangeNLockTime(ancestorTx, 2); // skip the bolt output
      break;
  }
  return res;
};

export const utf8ToByteArray = (utf8Str: string) => {
  return Array.from(new Uint8Array(new TextEncoder().encode(utf8Str)));
};

export const sleep = async () => await new Promise(resolve => setTimeout(resolve, 1000))

export const verifyTx = (
  tx: Transaction
): { valid: boolean; scriptExecutions: { spend: Spend; valid: boolean }[] } => {
  // Verify each input transaction and evaluate the spend events.
  // Also, keep a total of the input amounts for later.
  let inputTotal = 0;
  const txid = tx.id("hex");
  const scriptExecutions: { spend: Spend; valid: boolean }[] = [];
  for (let i = 0; i < tx.inputs.length; i++) {
    const input = tx.inputs[i];
    if (typeof input.sourceTransaction !== "object") {
      throw new Error(
        `Verification failed because the input at index ${i} of transaction ${txid} is missing an associated source transaction. This source transaction is required for transaction verification because there is no merkle proof for the transaction spending a UTXO it contains.`
      );
    }
    if (typeof input.unlockingScript !== "object") {
      throw new Error(
        `Verification failed because the input at index ${i} of transaction ${txid} is missing an associated unlocking script. This script is required for transaction verification because there is no merkle proof for the transaction spending the UTXO.`
      );
    }
    const sourceOutput =
      input.sourceTransaction.outputs[input.sourceOutputIndex];
    inputTotal += sourceOutput.satoshis || 0;

    const sourceTxid = input.sourceTransaction.id("hex");
    const otherInputs = tx.inputs.filter((_, idx) => idx !== i);
    if (typeof input.sourceTXID === "undefined") {
      input.sourceTXID = sourceTxid;
    }

    const spend = new Spend({
      sourceTXID: input.sourceTXID,
      sourceOutputIndex: input.sourceOutputIndex,
      lockingScript: sourceOutput.lockingScript,
      sourceSatoshis: sourceOutput.satoshis || 0,
      transactionVersion: tx.version,
      otherInputs,
      unlockingScript: input.unlockingScript,
      inputSequence: input.sequence || 0xffffffff,
      inputIndex: i,
      outputs: tx.outputs,
      lockTime: tx.lockTime,
    });
    const valid = spend.validate();
    scriptExecutions.push({ spend, valid });
    if (!valid) {
      return { valid: false, scriptExecutions };
    }
  }

  // Total the outputs to ensure they don't amount to more than the inputs
  let outputTotal = 0;
  for (const out of tx.outputs) {
    if (typeof out.satoshis !== "number") {
      throw new Error(
        "Every output must have a defined amount during transaction verification."
      );
    }
    outputTotal += out.satoshis;
  }

  if (outputTotal > inputTotal) {
    throw new Error("Output total greater than input total");
  }

  return { valid: true, scriptExecutions };
};

export { BoltNonFungibleToken }