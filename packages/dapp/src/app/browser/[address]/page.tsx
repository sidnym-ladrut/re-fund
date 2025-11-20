'use client'
import { use, useState, useEffect, useMemo, useCallback, ChangeEvent } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { readContract } from '@wagmi/core'
import { useSignTypedData } from 'wagmi'
import { parseUnits, formatUnits, keccak256 } from 'viem'

import type { Provider } from "@reown/appkit/react";
import { useAppKitAccount } from "@reown/appkit/react";
import { Address } from "@/comp/Address";
import { formatNumber, nextPermitTime } from "@/lib/util";
import { useChainContracts } from "@/hook/wallet";
import { simulateContract, writeContract } from '@wagmi/core'
import { APPKIT_WAGMI, PINATA } from "@/cfg";

interface FundData {
  worker: `0x${string}`;
  oracle: `0x${string}`;
  token: `0x${string}`;
  terms: string;
  locked: boolean;
}

interface TermsData {
  title?: string;
  text?: string;
  url?: string;
}

interface TokenData {
  name: string;
  symbol: string;
  supply: bigint;
  decimals: bigint;
}

function assertValidAddress(value: string): asserts value is `0x${string}` {
  if (!/^0x[a-fA-F0-9]{40}$/.test(value)) {
    notFound();
  }
}

export default function FundPage({
  params,
}: {
  params: Promise<{ address: string }>
}) {
  const { address: fundAddress } = use(params);
  assertValidAddress(fundAddress);

  const { address: walletAddress, isConnected, caipAddress } = useAppKitAccount();
  const { signTypedDataAsync: signData } = useSignTypedData();
  const chainContracts = useChainContracts();
  const [fundData, setFundData] = useState<FundData | undefined>(undefined);
  const [termsData, setTermsData] = useState<TermsData | undefined>(undefined);
  const [tokenData, setTokenData] = useState<TokenData | undefined>(undefined);
  const [oracleSign, setOracleSign] = useState<string>("");
  const [funderDepo, setFunderDepo] = useState<string>("");
  const [workerWith, setWorkerWith] = useState<string>("");

  const chainId: number = useMemo(() => (
    Number(caipAddress?.split(':')?.[1] ?? 0)
  ), [caipAddress]);

  const signOff = useCallback(() => {
    const signOffFun = async () => {
      const signature = await signData({
        account: walletAddress,
        domain: {
          name: 'Fund',
          version: '1',
          chainId: chainId,
          verifyingContract: fundAddress,
        },
        types: {
          SignTerms: [
            { name: 'terms', type: 'bytes32' },
          ],
        },
        primaryType: 'SignTerms',
        message: {
          terms: keccak256(fundData?.terms),
        },
      });
      if (walletAddress.toLowerCase() === fundData?.worker?.toLowerCase()) {
        // Auto-fill the signature input field
        setOracleSign(signature);
        alert("Signature generated and filled! You can now click 'Lock In' to activate the fund.");
      } else {
        prompt("Signature generated! Send this to the project worker.", signature);
      }
    };
    signOffFun();
  }, [walletAddress, chainId, fundData, chainContracts, signData]);
  const lockIn = useCallback(() => {
    const lockInFun = async () => {
      const { request } = await simulateContract(APPKIT_WAGMI.wagmiConfig, {
        address: fundAddress,
        abi: chainContracts.Fund.abi,
        functionName: 'lockTerms',
        args: [oracleSign],
      });
      const hash = await writeContract(APPKIT_WAGMI.wagmiConfig, request);
      window.location.reload(); // FIXME: Super clumsy cache invalidation
    };
    lockInFun();
  }, [oracleSign, chainContracts]);
  const deposit = useCallback(() => {
    const depositFun = async () => {
      if (!chainContracts || !fundData || !tokenData || !walletAddress) {
        alert('Please ensure wallet is connected and data is loaded');
        return;
      }

      try {
        const depoTime: bigint = nextPermitTime();
        const depoAmount: bigint = parseUnits(funderDepo, Number(tokenData.decimals));
        const depoNonce: bigint = (await readContract(APPKIT_WAGMI.wagmiConfig, {
          address: fundData.token,
          abi: chainContracts.FundToken.abi,
          functionName: 'nonces',
          args: [walletAddress],
        })) as bigint;

        const signature = await signData({
          account: walletAddress as `0x${string}`,
          domain: {
            name: tokenData.name,
            version: '1',
            chainId: chainId,
            verifyingContract: fundData.token,
          },
          types: {
            Permit: [
              { name: 'owner', type: 'address' },
              { name: 'spender', type: 'address' },
              { name: 'value', type: 'uint256' },
              { name: 'nonce', type: 'uint256' },
              { name: 'deadline', type: 'uint256' },
            ],
          },
          primaryType: 'Permit',
          message: {
            owner: walletAddress as `0x${string}`,
            spender: fundAddress,
            value: depoAmount,
            nonce: depoNonce,
            deadline: depoTime,
          },
        });

        const { request } = await simulateContract(APPKIT_WAGMI.wagmiConfig, {
          address: fundAddress,
          abi: chainContracts.Fund.abi,
          functionName: 'deposit',
          args: [fundData.token, walletAddress as `0x${string}`, depoAmount, depoTime, signature],
        });

        const hash = await writeContract(APPKIT_WAGMI.wagmiConfig, request);
        alert(`Deposit successful! Transaction: ${hash}`);
        setFunderDepo(''); // Clear input
        window.location.reload(); // FIXME: Super clumsy cache invalidation
      } catch (error: any) {
        console.error('Deposit error:', error);
        alert(`Deposit failed: ${error.message || 'Unknown error'}`);
      }
    };
    depositFun();
  }, [walletAddress, chainId, funderDepo, fundData, tokenData, chainContracts, signData, fundAddress]);
  const signWithdrawal = useCallback(() => {
    const signWithdrawalFun = async () => {
      if (!chainContracts || !tokenData || !walletAddress) {
        alert('Please ensure wallet is connected and data is loaded');
        return;
      }

      try {
        const withAmount: bigint = parseUnits(workerWith, Number(tokenData.decimals));
        const nonce = await readContract(APPKIT_WAGMI.wagmiConfig, {
          address: fundAddress,
          abi: chainContracts.Fund.abi,
          functionName: 'nonce',
          args: [],
        }) as bigint;

        const signature = await signData({
          account: walletAddress as `0x${string}`,
          domain: {
            name: 'Fund',
            version: '1',
            chainId: chainId,
            verifyingContract: fundAddress,
          },
          types: {
            Withdraw: [
              { name: 'fund', type: 'address' },
              { name: 'amount', type: 'uint256' },
              { name: 'nonce', type: 'uint256' },
            ],
          },
          primaryType: 'Withdraw',
          message: {
            fund: fundAddress,
            amount: withAmount,
            nonce: nonce,
          },
        });

        // Auto-fill the withdrawal signature field
        if (walletAddress.toLowerCase() === fundData?.worker?.toLowerCase()) {
          // Auto-fill the signature input field
          setOracleSign(signature);
          alert("Withdrawal signature generated and filled! You can now execute withdrawal.");
        } else {
          prompt("Signature generated! Send this to the project worker.", signature);
        }
      } catch (error: any) {
        console.error('Sign withdrawal error:', error);
        alert(`Failed to sign withdrawal: ${error.message || 'Unknown error'}`);
      }
    };
    signWithdrawalFun();
  }, [walletAddress, chainId, workerWith, fundData, tokenData, chainContracts, fundAddress, signData]);
  const execWithdrawal = useCallback(() => {
    const execWithdrawalFun = async () => {
      if (!chainContracts || !tokenData || !oracleSign) {
        alert('Please ensure oracle has signed the withdrawal');
        return;
      }
      try {
        const withAmount: bigint = parseUnits(workerWith, Number(tokenData.decimals));

        const { request } = await simulateContract(APPKIT_WAGMI.wagmiConfig, {
          address: fundAddress,
          abi: chainContracts.Fund.abi,
          functionName: 'withdraw',
          args: [withAmount, oracleSign as `0x${string}`],
        });

        const hash = await writeContract(APPKIT_WAGMI.wagmiConfig, request);
        alert(`Withdrawal successful! Transaction: ${hash}`);
        setWorkerWith(''); // Clear input
        setOracleSign(''); // Clear signature
        window.location.reload(); // FIXME: Super clumsy cache invalidation
      } catch (error: any) {
        console.error('Withdrawal error:', error);
        alert(`Withdrawal failed: ${error.message || 'Unknown error'}`);
      }
    };
    execWithdrawalFun();
  }, [chainContracts, chainId, tokenData, workerWith, oracleSign, fundAddress]);
  const refund = useCallback(() => {
    const refundFun = async () => {
      if (!chainContracts) {
        alert('Please ensure wallet is connected');
        return;
      }

      if (!confirm('Are you sure you want to refund all funders? This will return their proportional deposits and cannot be undone.')) {
        return;
      }

      try {
        const { request } = await simulateContract(APPKIT_WAGMI.wagmiConfig, {
          address: fundAddress,
          abi: chainContracts.Fund.abi,
          functionName: 'refund',
          args: [],
        });

        const hash = await writeContract(APPKIT_WAGMI.wagmiConfig, request);
        alert(`Refund successful! All funders will receive their proportional deposits back. Transaction: ${hash}`);
        window.location.reload(); // FIXME: Super clumsy cache invalidation
      } catch (error: any) {
        console.error('Refund error:', error);
        alert(`Refund failed: ${error.message || 'Unknown error'}`);
      }
    };
    refundFun();
  }, [chainContracts, fundAddress]);

  const onSignChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const {value}: {value: string;} = event.target;
    setOracleSign(value);
  }, [setOracleSign]);
  const onDepoChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const {value}: {value: string;} = event.target;
    setFunderDepo(value);
  }, [setFunderDepo]);
  const onWithChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const {value}: {value: string;} = event.target;
    setWorkerWith(value);
  }, [setWorkerWith]);

  useEffect(() => {
    if (!!chainContracts) {
      Promise.all([
        readContract(APPKIT_WAGMI.wagmiConfig, {
          address: fundAddress,
          abi: chainContracts.Fund.abi,
          functionName: 'worker',
          args: [],
        }),
        readContract(APPKIT_WAGMI.wagmiConfig, {
          address: fundAddress,
          abi: chainContracts.Fund.abi,
          functionName: 'oracle',
          args: [],
        }),
        readContract(APPKIT_WAGMI.wagmiConfig, {
          address: fundAddress,
          abi: chainContracts.Fund.abi,
          functionName: 'payoutToken',
          args: [],
        }),
        readContract(APPKIT_WAGMI.wagmiConfig, {
          address: fundAddress,
          abi: chainContracts.Fund.abi,
          functionName: 'terms',
          args: [],
        }),
        readContract(APPKIT_WAGMI.wagmiConfig, {
          address: fundAddress,
          abi: chainContracts.Fund.abi,
          functionName: 'termsSignature',
          args: [],
        }),
      ]).then(([worker, oracle, token, terms, termsSignature]) => {
        setFundData({worker, oracle, token, terms, locked: (termsSignature !== "0x")});
      }).catch((error) => {
        console.log(error);
      });
    }
  }, [fundAddress, chainContracts]);

  useEffect(() => {
    if (!!chainContracts && !!fundData) {
      Promise.all([
        readContract(APPKIT_WAGMI.wagmiConfig, {
          address: fundData.token,
          abi: chainContracts.FundToken.abi,
          functionName: 'name',
          args: [],
        }),
        readContract(APPKIT_WAGMI.wagmiConfig, {
          address: fundData.token,
          abi: chainContracts.FundToken.abi,
          functionName: 'symbol',
          args: [],
        }),
        readContract(APPKIT_WAGMI.wagmiConfig, {
          address: fundData.token,
          abi: chainContracts.FundToken.abi,
          functionName: 'balanceOf',
          args: [fundAddress],
        }),
        readContract(APPKIT_WAGMI.wagmiConfig, {
          address: fundData.token,
          abi: chainContracts.FundToken.abi,
          functionName: 'decimals',
          args: [],
        }),
      ]).then(([name, symbol, supply, decimals]) => {
        setTokenData({name, symbol, supply, decimals});
      }).catch((error) => {
        console.log(error);
      });
    }
  }, [chainContracts, fundAddress, fundData]);

  useEffect(() => {
    const queryIPFS = async () => {
      if (!!fundData) {
        // Check if terms is a valid IPFS CID (starts with 'Qm' or 'baf')
        const isValidCID = fundData.terms && (fundData.terms.startsWith('Qm') || fundData.terms.startsWith('baf'));
        
        console.log('IPFS Query:', { 
          terms: fundData.terms, 
          isValidCID, 
          hasPinata: !!PINATA 
        });
        
        if (!isValidCID || !PINATA) {
          // If not a valid CID or Pinata not configured, just show the terms string
          console.log('Skipping IPFS fetch - invalid CID or no Pinata');
          setTermsData({ text: fundData.terms });
          return;
        }

        try {
          console.log('Fetching from IPFS:', fundData.terms);
          const { data, contentType } = await PINATA.gateways.public.get(fundData.terms);
          console.log('IPFS Response:', { contentType, data });
          console.log('Data type:', typeof data, 'Is array:', Array.isArray(data));
          console.log('Full data:', JSON.stringify(data, null, 2));
          
          if (contentType === "application/json" && typeof data === 'object' && data !== null && !Array.isArray(data)) {
            const jsonData = data as any;
            console.log('JSON Data schema:', jsonData.schema, 'version:', jsonData.version);
            console.log('JSON Data terms:', jsonData.terms);
            
            if (jsonData.schema === "fund-plaintext" && jsonData.version === 0) {
              const dataUrl = await PINATA.gateways.public.convert(fundData.terms);
              setTermsData({
                text: jsonData?.terms?.text ?? "",
                url: dataUrl,
              });
            } else if (jsonData.schema === "fund-milestones" && jsonData.version === 0) {
              // Handle fund-milestones schema
              const dataUrl = await PINATA.gateways.public.convert(fundData.terms);
              const title = jsonData.meta?.title || "Untitled";
              const summary = jsonData.meta?.summary || "";
              const milestones = jsonData.meta?.milestones || [];
              
              // Format the milestones text
              const milestonesList = milestones.map((m: any, idx: number) => {
                return `${idx + 1}. ${m.terms} (Target: ${m.target})`;
              }).join('\n');
              
              const termsText = `Title: ${title}\n\nSummary: ${summary}\n\nMilestones:\n${milestonesList}`;
              
              setTermsData({
                text: termsText,
                url: dataUrl,
              });
            } else {
              setTermsData({ text: fundData.terms });
            }
          } else {
            // Not JSON or wrong format, just show the CID
            setTermsData({ text: fundData.terms });
          }
        } catch (err: any) {
          console.error('Unable to fetch terms:', err);
          setTermsData({ text: fundData.terms });
        }
      }
    };
    queryIPFS();
  }, [fundData, setTermsData]);

  return (
    <div className="flex flex-col gap-y-4">
      <h2>Fund @ <Address address={fundAddress} /></h2>
      <div className="flex flex-col gap-y-2">
        {!fundData ? (
          <span>Loading...</span>
        ) : (
          <>
            <>
              <h3>Meta</h3>
              <ul>
                <li>
                  <strong>Worker: </strong>
                  <Address address={fundData.worker} />
                </li>
                <li>
                  <strong>Oracle: </strong>
                  <Address address={fundData.oracle} />
                </li>
                <li>
                  <strong>Status: </strong>
                  {fundData.locked ? "Locked" : "Pending"}
                </li>
                <li>
                  <strong>Token: </strong>
                  <Address address={fundData.token} />
                  {(tokenData === undefined) ? (
                    <span>Loading...</span>
                  ) : (
                    <ul>
                      <li>
                        <strong>Name: </strong>
                        {tokenData.name}
                      </li>
                      <li>
                        <strong>Supply: </strong>
                        {formatNumber(formatUnits(tokenData.supply, Number(tokenData.decimals)))} {tokenData.symbol}
                      </li>
                    </ul>
                  )}
                </li>
              </ul>
            </>
            <>
              <h3>Terms</h3>
              {!termsData ? (
                <span>Loading...</span>
              ) : (
                <>
                  <p>
                    <strong>Reference: </strong>
                    <Link
                      className="transition-colors duration-200 hover:bg-gray-100 underline"
                      href={termsData.url || `https://gateway.pinata.cloud/ipfs/${fundData.terms}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {fundData.terms}
                    </Link>
                  </p>
                  {!termsData?.text ? (
                    <p className="italic">Extended IPFS Data Unavailable</p>
                  ) : (
                    <p className="whitespace-pre-line">{termsData.text}</p>
                  )}
                </>
              )}
            </>
            <>
              <h3>Actions</h3>
              {(walletAddress?.toLowerCase() === fundData.oracle.toLowerCase() && !fundData.locked) && (
                <button onClick={signOff}>
                  Sign Off
                </button>
              )}
              {(walletAddress?.toLowerCase() === fundData.worker.toLowerCase() && !fundData.locked) && (
                <div className="border-black border-2 p-2 flex flex-col gap-y-2">
                  <h3>Oracle Signature</h3>
                  <p className="text-sm text-gray-600">
                    Cryptographic signature from oracle approving the fund terms (132 chars)
                  </p>
                  <input
                    className="border-black border-1 px-2 py-1"
                    pattern="^0x[a-fA-F0-9]{130}$"
                    value={oracleSign}
                    onChange={onSignChange}
                    placeholder={`0x${'0'.repeat(130)}`}
                  />
                  <button onClick={lockIn} disabled={!oracleSign}>
                    Lock In
                  </button>
                </div>
              )}
              {(isConnected && !!fundData?.locked) && (
                <div className="border-black border-2 p-2 flex flex-col gap-y-2">
                  <h3>Deposit Amount</h3>
                  <input
                    className="border-black border-1 px-2 py-1"
                    type="number"
                    step="0.0001"
                    value={funderDepo}
                    onChange={onDepoChange}
                    placeholder="10"
                  />
                  <button onClick={deposit}>
                    Deposit
                  </button>
                </div>
              )}
              {(
                  (walletAddress?.toLowerCase() === fundData.worker.toLowerCase() ||
                  walletAddress?.toLowerCase() === fundData.oracle.toLowerCase()) &&
                  fundData.locked
              ) && (
                <div className="border-black border-2 p-2 flex flex-col gap-y-2">
                  <h3>Withdrawal Amount</h3>
                  <input
                    className="border-black border-1 px-2 py-1"
                    type="number"
                    step="0.0001"
                    value={workerWith}
                    onChange={onWithChange}
                    placeholder="10"
                  />
                  {(walletAddress?.toLowerCase() === fundData.oracle.toLowerCase()) && (
                    <button onClick={signWithdrawal}>
                      Sign Off
                    </button>
                  )}
                  {(walletAddress?.toLowerCase() === fundData.worker.toLowerCase()) && (
                    <>
                      <h3>Withdrawal Signature</h3>
                      <input
                        className="border-black border-1 px-2 py-1"
                        pattern="^0x[a-fA-F0-9]{130}$"
                        value={oracleSign}
                        onChange={onSignChange}
                        placeholder={`0x${'0'.repeat(130)}`}
                      />
                      <button onClick={execWithdrawal}>
                        Withdraw
                      </button>
                    </>
                  )}
                </div>
              )}
              {(
                  (walletAddress?.toLowerCase() === fundData.worker.toLowerCase() ||
                  walletAddress?.toLowerCase() === fundData.oracle.toLowerCase()) &&
                  fundData.locked) && (
                <button onClick={refund}>
                  Refund
                </button>
              )}
            </>
          </>
        )}
      </div>
    </div>
  )
}
