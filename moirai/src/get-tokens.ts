/**
 * Example: Get tokens for specific chains
 * 
 * This example demonstrates how to fetch information about tokens
 * on specific chains.
 */

import { apiClient } from './api-config.js';
import { formatError } from './utils.js';

async function getTokens(chains?: string[], minPriceUSD?: number) {
  console.log('🪙 Fetching tokens...\n');
  
  try {
    const params: Record<string, any> = {};
    
    if (chains && chains.length > 0) {
      params.chains = chains.join(',');
      console.log(`📋 Filtering tokens for chains: ${chains.join(', ')}\n`);
    }
    
    if (minPriceUSD) {
      params.minPriceUSD = minPriceUSD;
      console.log(`💰 Minimum price filter: $${minPriceUSD}\n`);
    }
    
    const response = await apiClient.get('/tokens', { params });
    const tokensData = response.data.tokens || response.data;
    
    // If tokens is an object with chain IDs as keys, flatten it
    let tokens: any[] = [];
    if (typeof tokensData === 'object' && !Array.isArray(tokensData)) {
      // It's an object with chain IDs as keys
      Object.values(tokensData).forEach((chainTokens: any) => {
        if (Array.isArray(chainTokens)) {
          tokens.push(...chainTokens);
        }
      });
    } else if (Array.isArray(tokensData)) {
      tokens = tokensData;
    }
    
    if (tokens.length > 0) {
      console.log(`✅ Found ${tokens.length} tokens\n`);
      
      // Display first 10 tokens as examples
      console.log('Sample tokens:');
      tokens.slice(0, 10).forEach((token: any) => {
        console.log(`- ${token.symbol} on chain ${token.chainId}`);
        if (token.priceUSD) {
          console.log(`  Price: $${parseFloat(token.priceUSD).toFixed(6)}`);
        }
      });
      
      if (tokens.length > 10) {
        console.log(`... and ${tokens.length - 10} more tokens`);
      }
    } else {
      console.log('No tokens found');
    }
    
    return tokens;
  } catch (error) {
    console.error('❌ Error fetching tokens:', formatError(error));
    throw error;
  }
}

// Run if called directly
const args = process.argv.slice(2);
const chains = args[0]?.split(',');
const minPrice = args[1] ? parseFloat(args[1]) : undefined;

getTokens(chains, minPrice)
  .then(() => process.exit(0))
  .catch(() => process.exit(1));

export { getTokens };

