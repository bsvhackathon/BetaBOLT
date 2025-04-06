"use client"
// To run: node --loader ts-node/esm createRawMint.ts
import React, { useState, useEffect } from "react";
import { Hash, PrivateKey, PublicKey, Transaction, Utils, WalletClient, WalletOutput } from '@bsv/sdk'
import Image from "next/image";
import localDb from "./lib/db.js";
// MUI imports
import {
  Box,
  Typography,
  Button,
  Paper,
  Switch,
  FormControlLabel,
  Chip,
  Container,
  Grid,
  CircularProgress,
  AppBar,
  Toolbar,
  Stack
} from "@mui/material";
import { styled } from "@mui/material/styles";
import { green, red } from "@mui/material/colors";
import { BoltNonFungibleToken } from "lib/bolt/boltLib.ts";
import { WocClient } from "lib/wocClient.js";
const privKey = PrivateKey.fromWif('L2znqSqyqBzwvM9dcKAEa5QQcg9HsgZPdYa7JonDNf41zoKgGGcN');//L5EY1SbTvvPNSdCYQe1EJHfXCBBT4PmnF6CDbzCm9iifZptUvDGB');
const publicKey = privKey.toPublicKey().encode(true, 'hex')
const pubKeyHash = Hash.ripemd160(privKey.toPublicKey().encode(true))//Hash.hash160(privKey.topublicKey)

console.log({publicKey, pubKeyHash: Utils.toHex(pubKeyHash)})
// Custom styled components
const ConnectSwitch = styled(Switch)(({ theme }) => ({
  '& .MuiSwitch-switchBase.Mui-checked': {
    color: green[500],
    '&:hover': {
      backgroundColor: green[100],
    },
  },
  '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
    backgroundColor: green[500],
  },
  '& .MuiSwitch-switchBase': {
    color: red[500],
    '&:hover': {
      backgroundColor: red[100],
    },
  },
  '& .MuiSwitch-switchBase + .MuiSwitch-track': {
    backgroundColor: red[500],
  },
}));

export default function Home() {
  const [walletClient, setWalletClient] = useState(undefined || new WalletClient());// new WalletClient());
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [utxos, setUtxos] = useState([]);
  const [bolts, setBolts] = useState<WalletOutput[]>([]);

  const [defaultPubKey, setDefaultPubKey] = useState(publicKey);
  const [pKH, setPKH] = useState<number[] | undefined>(pubKeyHash);
  const [defaultPKH, setDefaultPKH] = useState(Utils.toHex(pubKeyHash));
  const [defaultAddress, setDefaultAddress] = useState(undefined || String);

  const getUtxos = async () => {
    console.log('getUtxos', walletClient)
    if (!walletClient) {
      console.log('no walletClient')
      return
    }
    const bolts = await walletClient.listOutputs({
      basket: 'bolts'
    })
    console.log({ bolts })
    setBolts(bolts.outputs.reverse())
  }

  const createWalletConnection = async () => {
    const w = new WalletClient(undefined, 'boltdemo.com')
    const connRes = await w.isAuthenticated()
    if (!!connRes.authenticated) {
      setIsConnected(true);
      setWalletClient(w)
      
      // const { publicKey } = await w.getPublicKey({ identityKey: true })

      const pKH = Hash.ripemd160(publicKey, 'hex')
      setPKH(pKH)
      const addr = privKey.toPublicKey().toAddress()
      setDefaultAddress(addr)
      await getUtxos()
      console.log("Wallet connected");
    } else console.error('Could not connect wallet')
  }

  useEffect(() => {
    const connectWalletOnPageLoad = async () => {
      setIsLoading(true);
      try {
        await createWalletConnection();
        const allTxs = await localDb.getAllTransactions();
        console.log({ allTxs })
        
      } catch (error) {
        console.error("Auto wallet connection failed:", error);
      } finally {
        setIsLoading(false);
      }
    };

    connectWalletOnPageLoad();
  }, []);

  const toggleConnection = async () => {
    setIsLoading(true);
    try {
      if (isConnected) {
        console.warn("Wallet already connected")
      } else {
        await createWalletConnection();
      }
    } catch (error) {
      console.error("Wallet connection error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Updated importTransaction function
  const importTransaction = async (atomicBeefTxStr: String) => {
    if (!atomicBeefTxStr) {
      console.error('Raw transaction input element not found');
      return;
    }

    const tmpTx = Transaction.fromAtomicBEEF(Utils.toArray(atomicBeefTxStr, 'hex'));
    const dbTx = {
      txid: tmpTx.id('hex'),
      txhash: tmpTx.hash('hex'),
      rawTx: tmpTx.toHex()
    }
    const wocClient = new WocClient()
    const broadcastRes = await wocClient.post('/tx/raw', {
      txhex: tmpTx.toHex()})
      console.log({ broadcastRes})
    const dbRes = await localDb.addTransaction(dbTx);
    console.log({ dbRes })

    const actionRes = await walletClient.internalizeAction({
      tx: Utils.toArray(atomicBeefTxStr, 'hex'),
      outputs: [{
        outputIndex: 0,
        protocol: 'basket insertion',
        insertionRemittance: {
          basket: 'bolts'
        }
      }, {
        outputIndex: 1,
        protocol: 'basket insertion',
        insertionRemittance: {
          basket: 'p2pkhs'
        }
      },
      ],
      description: 'boltMint'
    })
    await getUtxos()
    return actionRes
  }
  async function handleTransferToken(bolt: WalletOutput): Promise<BoltNonFungibleToken> {
    console.log('handleTransferToken', bolt)
    const [txhash,outputIdx] = bolt.outpoint.split('.')
    const rawTokenTx = await localDb.getTransactionByTxid(txhash)
    console.log({rawTokenTx})
    let boltToken = new BoltNonFungibleToken()
    boltToken.pubKeyHash = pubKeyHash
    boltToken.tx = Transaction.fromHex(rawTokenTx.rawTx)
    boltToken.prevTxs.push(boltToken.tx)
    boltToken.voutIdx = Number.parseInt(outputIdx)
    boltToken.pubKey = privKey.toPublicKey().encode(true) as number []
    boltToken.privKey = privKey
    console.log({boltToken})
    const updatedToken = await boltToken.transfer(privKey, 'commitTx', 'settleTx')
    console.log({ updatedToken })
    return updatedToken || 'Error: Token transfer failed'
  }

  return (
    <Container maxWidth="lg">
      <Box sx={{ flexGrow: 1, my: 4 }}>
        {/* Header */}
        <Box sx={{ textAlign: 'center', mb: 4 }}>
          <Typography
            variant="h2"
            component="h1"
            sx={{
              fontWeight: 'bold',
              color: '#f7931a',  // Bitcoin orange
              mb: 1
            }}
          >
            Bitcoin Original Layer-1 Token Protocol
          </Typography>
          <Typography
            variant="h4"
            component="h2"
            sx={{
              color: 'text.secondary',
              fontWeight: 'medium'
            }}
          >
            The BOLT beta demo
          </Typography>
        </Box>

      </Box>
      {/* Main Content */}
      <Paper elevation={2} sx={{ p: 4 }}>
        {isConnected ? (
          <Box sx={{ textAlign: 'center' }}>
            <Typography variant="h5" sx={{ color: '#f7931a', mb: 2 }}>
              Welcome to the BOLT Protocol demonstration
            </Typography>
            <Typography variant="body1">
              The BOLT Protocol brings native token validation using the blockchain's base Layer-1 records only to Bitcoin!
            </Typography>
            {/* Add more dashboard components here */}
          </Box>
        ) : (
          <Box sx={{ textAlign: 'center' }}>
            <Typography variant="h5" sx={{ color: '#f7931a', mb: 2 }}>
              A connection to the Metanet Desktop wallet is required, please run it!
            </Typography>
          </Box>
        )}
      </Paper>
      <hr />
      {/* Wallet Connection */}
      <Paper
        elevation={3}
        sx={{
          p: 3,
          mb: 4,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center'
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6" sx={{ mr: 2 }}>
            Wallet Connection:
          </Typography>

          {isLoading ? (
            <CircularProgress size={24} />
          ) : (
            <FormControlLabel
              control={
                <ConnectSwitch
                  checked={isConnected}
                  onChange={toggleConnection}
                  name="connectionSwitch"
                />
              }
              label=""
            />
          )}

          <Chip
            label={isConnected ? "Connected" : "Disconnected"}
            color={isConnected ? "success" : "error"}
            sx={{ ml: 2 }}
          />
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6" sx={{ mr: 2 }}>
            PubKey: {defaultPubKey}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6" sx={{ mr: 2 }}>
            PubKeyHash: {defaultPKH}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6" sx={{ mr: 2 }}>
            Address: {defaultAddress}
          </Typography>
        </Box>
      </Paper>

      {bolts.length > 0 && (
        <Paper
          elevation={3}
          sx={{
            p: 3,
            mb: 4,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center'
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
            <Stack direction="column" spacing={2}>
              <Typography variant="h6" sx={{ mr: 2 }}>
                $1 BUSD Tokens:
              </Typography>
              <Box>
                {bolts.map((bolt, index) => (
                  <Paper key={index} elevation={3} sx={{ p: 3, mb: 2, display: 'flex', alignItems: 'center' }}>
                    <Box key={index} sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                      <Typography variant="body1" sx={{ mr: 2 }}>
                        {index + 1}. $1 BUSD: {bolt.outpoint.split('.')[0]}
                      </Typography>
                    </Box>
                    <Button
                      variant="contained"
                      size="small"
                      onClick={async () => {
                        const transferRes = await handleTransferToken(bolt)
                        console.log({ transferRes })
                      }
                      }
                      sx={{ ml: 1 }}
                    >
                      Transfer
                    </Button>
                  </Paper>
                ))}</Box>
            </Stack>
          </Box>
        </Paper>
      )}

      {/* Import rawTx Section */}
      <Paper
        elevation={3}
        sx={{
          p: 3,
          mb: 4
        }}
      >
        <Typography
          variant="h6"
          sx={{
            color: '#f7931a',
            mb: 2,
            fontWeight: 'medium'
          }}
        >
          Import rawTx
        </Typography>
        <Box
          component="textarea"
          placeholder="Paste your raw transaction data here..."
          id="rawTxInput"
          sx={{
            width: '100%',
            minHeight: '120px',
            p: 2,
            fontFamily: 'monospace',
            fontSize: '0.9rem',
            border: '1px solid #ddd',
            borderRadius: '4px',
            resize: 'vertical',
            '&:focus': {
              outline: '2px solid #f7931a',
              border: '1px solid transparent'
            }
          }}
        />
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
          <Button
            variant="contained"
            onClick={async (e) => {
              try {
                setIsLoading(true);
                e.preventDefault();
                // Get the textarea element and correctly cast it
                const atomicBeefTxElement = document.getElementById('rawTxInput') as HTMLTextAreaElement;
                // console.log(atomicBeefTxElement.value)
                // Call importTransaction with the element
                const importRes = await importTransaction(atomicBeefTxElement.value);
                console.log({ importRes })
              } catch (err: Error | any) {
                console.error("Error importing transaction: " + (err.message || err));
              } finally {
                setIsLoading(false);
              }
            }}
            sx={{
              bgcolor: '#f7931a',
              '&:hover': {
                bgcolor: '#e68a00'
              }
            }}
          >
            Process Transaction
          </Button>
        </Box>
      </Paper>
      {/* Footer */}
      <Paper
        component="footer"
        sx={{
          p: 3,
          mt: 4,
          display: 'flex',
          justifyContent: 'center',
          gap: 4
        }}
      >
        <Button
          startIcon={
            <Image
              src="/globe.svg"
              alt="Globe icon"
              width={16}
              height={16}
            />
          }
          href="https://bitcoinsx.io"
          target="_blank"
          rel="noopener noreferrer"
        >
          bitcoinsx.io
        </Button>
      </Paper>
    </Container>
  );
}