/**
 * LI.FI API Quickstart Example
 * 
 * This example demonstrates the complete flow of using the LI.FI REST API:
 * 1. Get supported chains
 * 2. Get available tokens
 * 3. Request a quote for a cross-chain transfer
 * 4. Check transaction status
 */

import { apiClient } from './api-config.js';
import { formatError, formatTokenAmount, retryWithBackoff } from './utils.js';
import { getChains } from './get-chains.js';

// Example transfer parameters
const USDC_ETH = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const USDC_ARB = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
const AMOUNT = '10000000'; // 10 USDC (6 decimals)

async function main() {
  console.log('🚀 LI.FI API Quickstart Example\n');
  console.log('This example demonstrates the LI.FI REST API workflow\n');
  
  try {
    // Step 1: Get supported chains
    console.log('📦 Step 1: Fetching supported chains...');
    const chains = await getChains();
    console.log('');
    
    // Step 2: Get tokens for specific chains
    console.log('🪙 Step 2: Fetching tokens for Ethereum and Arbitrum...');
    const tokenResponse = await apiClient.get('/tokens', {
      params: { chains: '1,42161' } // Ethereum and Arbitrum
    });
    
    const tokensData = tokenResponse.data.tokens || tokenResponse.data;
    
    // If tokens is an object with chain IDs as keys, flatten it
    let tokens: any[] = [];
    if (typeof tokensData === 'object' && !Array.isArray(tokensData)) {
      Object.values(tokensData).forEach((chainTokens: any) => {
        if (Array.isArray(chainTokens)) {
          tokens.push(...chainTokens);
        }
      });
    } else if (Array.isArray(tokensData)) {
      tokens = tokensData;
    }
    
    console.log(`✅ Found ${tokens.length} tokens on Ethereum and Arbitrum`);
    
    // Find USDC tokens
    const usdcEth = tokens.find((t: any) => 
      t.address?.toLowerCase() === USDC_ETH.toLowerCase() && t.chainId === 1
    );
    const usdcArb = tokens.find((t: any) => 
      t.address?.toLowerCase() === USDC_ARB.toLowerCase() && t.chainId === 42161
    );
    
    if (usdcEth) {
      console.log(`✅ Found USDC on Ethereum: ${usdcEth.symbol} (${formatTokenAmount(usdcEth.balanceOf || '0', usdcEth.decimals)})\n`);
    }
    if (usdcArb) {
      console.log(`✅ Found USDC on Arbitrum: ${usdcArb.symbol} (${formatTokenAmount(usdcArb.balanceOf || '0', usdcArb.decimals)})\n`);
    }
    
    // Step 3: Request a quote
    console.log('💱 Step 3: Requesting quote for cross-chain transfer...');
    console.log(`   Transfer: 10 USDC (Ethereum) → USDC (Arbitrum)`);
    
    const quoteParams = {
      fromChain: 1,                      // Ethereum
      toChain: 42161,                    // Arbitrum
      fromToken: USDC_ETH,
      toToken: USDC_ARB,
      fromAmount: AMOUNT,
      fromAddress: '0x552008c0f6870c2f77e5cC1d2eb9bdff03e30Ea0', // Example address
      toAddress: '0x552008c0f6870c2f77e5cC1d2eb9bdff03e30Ea0', // Same address
      slippage: 0.005,                   // 0.5% slippage
    };
    
    console.log(`\n📤 Quote Request:`);
    console.log(`   From Chain: Ethereum (1)`);
    console.log(`   To Chain: Arbitrum (42161)`);
    console.log(`   From Token: USDC (${USDC_ETH.slice(0, 10)}...)`);
    console.log(`   To Token: USDC (${USDC_ARB.slice(0, 10)}...)`);
    console.log(`   Amount: 10 USDC\n`);
    
    const quote = await retryWithBackoff(async () => {
      const response = await apiClient.get('/quote', { params: quoteParams });
      return response.data;
    });
    
    console.log('✅ Quote received:\n');
    
    // Handle the quote response structure
    if (quote.estimate) {
      // Quote endpoint returns estimate directly
      console.log(`   From Amount: ${quote.estimate.fromAmount || quote.fromAmount || '0'}`);
      console.log(`   To Amount: ~${quote.estimate.toAmount || '0'}`);
      console.log(`   Tool: ${quote.toolDetails?.name || quote.tool || 'N/A'}`);
      console.log(`   Transaction Request: ${quote.transactionRequest ? 'Ready to execute' : 'Not available'}`);
      
      if (quote.toolDetails) {
        console.log(`   Bridge: ${quote.toolDetails.name}`);
      }
    } else if (quote.toAmount) {
      // Routes-style response
      const fromToken = quote.fromToken || {};
      const toToken = quote.toToken || {};
      console.log(`   From: ${quote.fromAmount} ${fromToken.symbol || 'tokens'}`);
      console.log(`   To: ~${quote.toAmount} ${toToken.symbol || 'tokens'}`);
      console.log(`   Estimated USD value: $${quote.toAmountUSD || 'N/A'}`);
    }
    console.log('');
    
    // Step 4: Show how to check status (no real transaction executed)
    console.log('🔍 Step 4: Checking transaction status');
    console.log('ℹ️  Note: This is a read-only example. No actual transaction is executed.');
    console.log('ℹ️  To check status of a real transaction, use:\n');
    console.log('   npm run check-status <txHash>');
    console.log('   or');
    console.log('   npm run check-status -- --transactionId <id>\n');
    
    console.log('📝 Example status check (would fail without real tx):');
    console.log('   curl "https://li.quest/v1/status?txHash=0x..."\n');
    
    // Summary
    console.log('✅ Quickstart completed!\n');
    console.log('📚 What you learned:');
    console.log('   1. How to fetch supported chains');
    console.log('   2. How to get tokens for specific chains');
    console.log('   3. How to request a quote for cross-chain transfers');
    console.log('   4. How transaction status checking works\n');
    
    console.log('📖 Next steps:');
    console.log('   - Try different chain combinations');
    console.log('   - Explore more API endpoints');
    console.log('   - Get an API key for higher rate limits');
    console.log('   - Integrate this into your application\n');
    
  } catch (error) {
    console.error('\n❌ Error:', formatError(error));
    
    if (error instanceof Error) {
      console.error('Error name:', error.name);
      if (error.stack) {
        console.error('Stack trace:', error.stack);
      }
    }
    
    process.exit(1);
  }
}

// Run the example
main();

