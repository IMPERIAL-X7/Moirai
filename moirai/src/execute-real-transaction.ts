/**
 * Execute Real Transaction - Full API Workflow
 * 
 * This script executes a real cross-chain transaction on mainnet using the LI.FI API.
 * It demonstrates the complete workflow from routes to execution, matching the documented pattern.
 * 
 * It uses /advanced/routes for multiple route options, then executes a transaction.
 * 
 * Run with: npm run execute-real-transaction
 * 
 * ⚠️  WARNING: This will execute a REAL transaction on mainnet!
 * Make sure you have sufficient balance and understand the risks.
 */

import { apiClient } from './api-config.js';
import { createWalletClient, createPublicClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { mainnet } from 'viem/chains';
import { config } from 'dotenv';
import { formatError, sleep } from './utils.js';

// Load environment variables
config();

// ERC20 ABI for balance checking
const erc20Abi = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  LI.FI API - Execute Real Transaction                      ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('⚠️  WARNING: This will execute a REAL transaction on mainnet!');
  console.log('   Make sure you have sufficient balance and understand the risks.\n');

  const fromChainId = 1;
  const toChainId = 42161;
  const fromTokenAddress = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'; // USDC on Ethereum
  const toTokenAddress = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';    // USDC on Arbitrum
  const fromAmount = '10000000'; // 10 USDC (6 decimals)

  const walletAddress = process.env.WALLET_ADDRESS || process.env.FROM_ADDRESS;
  if (!walletAddress) {
    throw new Error('WALLET_ADDRESS or FROM_ADDRESS environment variable is required');
  }

  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('PRIVATE_KEY environment variable is required');
  }

  try {
    // Step 1: Get routes
    console.log('📋 Step 1: Requesting routes...');
    const routesResponse = await apiClient.post('/advanced/routes', {
      fromChainId,
      toChainId,
      fromTokenAddress,
      toTokenAddress,
      fromAmount,
      fromAddress: walletAddress,
      toAddress: walletAddress,
      options: {
        slippage: 0.005,
        order: 'CHEAPEST',
      }
    });

    const responseData = routesResponse.data;
    // Response is an object with a 'routes' array
    const routes = Array.isArray(responseData) ? responseData : responseData.routes || [];
    
    if (routes.length === 0) {
      throw new Error('No routes found for this transfer');
    }
    
    const selectedRoute = routes[0];
    console.log(`✅ Found ${routes.length} routes, selected first route`);
    console.log(`   Route has ${selectedRoute.steps.length} step(s)\n`);

    // Step 2: Get transaction data for the first step
    console.log('📦 Step 2: Getting transaction data...');
    const stepTxResponse = await apiClient.post('/advanced/stepTransaction', selectedRoute.steps[0]);
    const stepWithTx = stepTxResponse.data;
    console.log('✅ Transaction data received\n');

    // Step 3: Set up wallet clients
    console.log('🔐 Step 3: Setting up wallet...');
    const account = privateKeyToAccount(privateKey as `0x${string}`);
    const address = await account.address;
    
    if (address.toLowerCase() !== walletAddress.toLowerCase()) {
      console.warn('⚠️  Warning: WALLET_ADDRESS does not match the address derived from PRIVATE_KEY');
      console.warn(`   PRIVATE_KEY address: ${address}`);
      console.warn(`   WALLET_ADDRESS: ${walletAddress}`);
      console.warn('   Using address from PRIVATE_KEY...\n');
    }

    const publicClient = createPublicClient({
      chain: mainnet,
      transport: http('https://eth.llamarpc.com'),
    });

    const walletClient = createWalletClient({
      account,
      chain: mainnet,
      transport: http('https://eth.llamarpc.com'),
    });

    console.log(`✅ Wallet address: ${address}\n`);

    // Step 3.5: Check balances
    console.log('💰 Step 3.5: Checking balances...');
    const balance = await publicClient.readContract({
      address: fromTokenAddress,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [address],
    });
    
    const balanceFormatted = Number(balance) / 1e6; // USDC has 6 decimals
    console.log(`   Current USDC balance: ${balanceFormatted} USDC`);
    
    if (BigInt(fromAmount) > balance) {
      console.error(`\n❌ Error: Insufficient balance!`);
      console.error(`   Required: 10 USDC`);
      console.error(`   Available: ${balanceFormatted} USDC`);
      console.error('   Please add more USDC to your wallet and try again.');
      process.exit(1);
    }
    
    // Check ETH balance for gas
    const ethBalance = await publicClient.getBalance({ address });
    const ethBalanceFormatted = Number(ethBalance) / 1e18;
    console.log(`   Current ETH balance: ${ethBalanceFormatted} ETH`);
    
    if (ethBalance < BigInt('1000000000000000')) { // 0.001 ETH
      console.warn('   ⚠️  Warning: Low ETH balance for gas fees');
      console.warn('   Recommended: At least 0.001 ETH for gas\n');
    } else {
      console.log('   ✅ Sufficient balance for gas fees\n');
    }

    // Step 4: Handle token approval if needed
    const txRequest = stepWithTx.transactionRequest;

    if (txRequest.to !== stepWithTx.action.fromToken.address) {
      console.log('🔓 Step 4: Checking token approval...');
      const erc20Abi = [
        {
          name: 'approve',
          type: 'function',
          stateMutability: 'nonpayable',
          inputs: [
            { name: 'spender', type: 'address' },
            { name: 'amount', type: 'uint256' },
          ],
          outputs: [{ name: '', type: 'bool' }],
        },
        {
          name: 'allowance',
          type: 'function',
          stateMutability: 'view',
          inputs: [
            { name: 'owner', type: 'address' },
            { name: 'spender', type: 'address' },
          ],
          outputs: [{ name: '', type: 'uint256' }],
        },
      ] as const;

      const approvalAddress = stepWithTx.estimate.approvalAddress as `0x${string}`;
      const tokenAddress = stepWithTx.action.fromToken.address as `0x${string}`;

      const currentAllowance = await publicClient.readContract({
        address: tokenAddress,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [account.address, approvalAddress],
      });

      if (currentAllowance < BigInt(stepWithTx.action.fromAmount)) {
        console.log('   Approval needed. Approving token...');
        const approveHash = await walletClient.writeContract({
          address: tokenAddress,
          abi: erc20Abi,
          functionName: 'approve',
          args: [approvalAddress, BigInt(stepWithTx.action.fromAmount)],
        });
        await publicClient.waitForTransactionReceipt({ hash: approveHash });
        console.log('✅ Token approved\n');
      } else {
        console.log('✅ Token already approved\n');
      }
    } else {
      console.log('ℹ️  Step 4: No token approval needed\n');
    }

    // Step 5: Send transaction
    console.log('📤 Step 5: Sending transaction...');
    console.log('   ⚠️  FINAL WARNING: This will execute a REAL transaction on mainnet!');
    console.log('   Press Ctrl+C within 5 seconds to cancel...\n');
    
    await sleep(5000);
    
    console.log('   📤 Sending transaction...');
    const txHash = await walletClient.sendTransaction({
      to: txRequest.to as `0x${string}`,
      value: txRequest.value ? BigInt(txRequest.value) : 0n,
      data: txRequest.data as `0x${string}`,
      gas: txRequest.gas ? BigInt(txRequest.gas) : undefined,
      gasPrice: txRequest.gasPrice ? BigInt(txRequest.gasPrice) : undefined,
    });
    
    console.log(`   ✅ Transaction sent!`);
    console.log(`   📝 Transaction hash: ${txHash}`);
    console.log(`   🔗 Explorer: https://etherscan.io/tx/${txHash}\n`);
    
    console.log('⏳ Waiting for transaction confirmation...');
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    console.log(`   ✅ Transaction confirmed in block: ${receipt.blockNumber}`);
    console.log(`   🔗 Block explorer: https://etherscan.io/block/${receipt.blockNumber}\n`);

    // Step 6: Check transaction status
    console.log('🔍 Step 6: Checking cross-chain transaction status...');
    let status;
    let attempts = 0;
    const maxAttempts = 30; // 30 attempts = ~150 seconds
    
    do {
      const statusResponse = await apiClient.get('/status', {
        params: { 
          txHash,
          fromChain: fromChainId,
          toChain: toChainId
        }
      });
      
      status = statusResponse.data;
      attempts++;
      
      console.log(`   Attempt ${attempts}/${maxAttempts}: Status = ${status.status}`);
      
      if (status.status === 'PENDING') {
        if (status.sending) {
          console.log(`     Sending: ${status.sending.amount} ${status.sending.token.symbol} on chain ${status.sending.chainId}`);
        }
        if (status.receiving) {
          console.log(`     Receiving: ${status.receiving.amount} ${status.receiving.token.symbol} on chain ${status.receiving.chainId}`);
        }
        await sleep(5000);
      }
    } while (status.status === 'PENDING' && attempts < maxAttempts);
    
    console.log('');
    if (status.status === 'DONE') {
      console.log('╔══════════════════════════════════════════════════════════════╗');
      console.log('║  ✅ Transaction completed successfully!                         ║');
      console.log('╚══════════════════════════════════════════════════════════════╝');
      if (status.receiving) {
        console.log(`   Received: ${status.receiving.amount} ${status.receiving.token.symbol} on Arbitrum`);
      }
      if (status.lifiExplorerLink) {
        console.log(`   🔗 LI.FI Explorer: ${status.lifiExplorerLink}`);
      }
    } else if (status.status === 'FAILED') {
      console.log('╔══════════════════════════════════════════════════════════════╗');
      console.log('║  ❌ Transaction failed                                       ║');
      console.log('╚══════════════════════════════════════════════════════════════╝');
      if (status.substatus) {
        console.log(`   Substatus: ${status.substatus}`);
      }
    } else {
      console.log('╔══════════════════════════════════════════════════════════════╗');
      console.log('║  ⏳ Transaction still pending                                ║');
      console.log('╚══════════════════════════════════════════════════════════════╝');
      console.log('   Check status later using:');
      console.log(`   npm run check-status ${txHash}`);
    }
  } catch (error) {
    console.error('\n╔══════════════════════════════════════════════════════════════╗');
    console.error('║  ❌ Error executing transaction                              ║');
    console.error('╚══════════════════════════════════════════════════════════════╝');
    console.error('');
    console.error(formatError(error));
    
    if (error instanceof Error && error.message.includes('insufficient funds')) {
      console.error('');
      console.error('💡 Tip: Make sure you have:');
      console.error('   - Sufficient USDC balance for the transfer');
      console.error('   - Sufficient ETH balance for gas fees');
    }
    
    process.exit(1);
  }
}

main().catch(console.error);

