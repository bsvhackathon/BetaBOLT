import { OP, ScriptTemplate, LockingScript, Script, PrivateKey, UnlockingScript, Transaction, TransactionSignature, Hash } from '@bsv/sdk'

export default class Pay2BoltTemplate implements ScriptTemplate {
    lock(pubKeyHash: number[]): LockingScript {
        return new LockingScript([
            ...Script.fromASM('b017').chunks,
            { op: OP.OP_EQUALVERIFY },
            { op: OP.OP_DUP },
            { op: OP.OP_HASH160 },
            { op: pubKeyHash.length, data: pubKeyHash },
            { op: OP.OP_EQUALVERIFY },
            { op: OP.OP_CHECKSIG },
        ])
    }
    unlock(
        privKey: PrivateKey,
        sourceSatoshis?: number,
        lockingScript?: Script
    ): {
        sign: (tx: Transaction, inputIndex: number) => Promise<UnlockingScript>
        estimateLength: () => Promise<111>
    } {
        return {
            sign: async (tx: Transaction, inputIndex: number) => {
                let signatureScope = TransactionSignature.SIGHASH_FORKID | TransactionSignature.SIGHASH_ALL
                const input = tx.inputs[inputIndex]
                const otherInputs = tx.inputs.filter((_, index) => index !== inputIndex)
                const sourceTXID = input.sourceTXID ? input.sourceTXID : input.sourceTransaction?.id('hex')
                if (!sourceTXID) {
                    throw new Error(
                        'The input sourceTXID or sourceTransaction is required for transaction signing.'
                    )
                }
                sourceSatoshis ||= input.sourceTransaction?.outputs[input.sourceOutputIndex].satoshis
                if (!sourceSatoshis) {
                    throw new Error(
                        'The sourceSatoshis or input sourceTransaction is required for transaction signing.'
                    )
                }
                lockingScript ||= input.sourceTransaction?.outputs[input.sourceOutputIndex].lockingScript
                if (!lockingScript) {
                    throw new Error(
                        'The lockingScript or input sourceTransaction is required for transaction signing.'
                    )
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
                    scope: signatureScope
                })
                const rawSignature = privKey.sign(Hash.sha256(preimage))
                const sig = new TransactionSignature(
                    rawSignature.r,
                    rawSignature.s,
                    signatureScope
                )
                const sigForScript = sig.toChecksigFormat()
                const pubkeyForScript = privKey.toPublicKey().encode(true) as number[]
                return new UnlockingScript([
                    { op: sigForScript.length, data: sigForScript },
                    { op: pubkeyForScript.length, data: pubkeyForScript },
                    ...Script.fromASM('b017').chunks,
                ])
            },
            estimateLength: async () => {
                // public key (1+33) + signature (1+73) + 02b017 (108 + 3)
                return 111
            }
        }
    }
}