/**
 * Example: Get all supported chains
 * 
 * This example demonstrates how to fetch information about all chains
 * supported by LI.FI.
 */

import { apiClient } from './api-config.js';
import { formatError } from './utils.js';

async function getChains() {
  console.log('🌐 Fetching all supported chains...\n');
  
  try {
    const response = await apiClient.get('/chains');
    const chains = response.data.chains || response.data;
    
    console.log(`✅ Found ${chains.length} supported chains\n`);
    
    // Display first 10 chains as examples
    console.log('Sample chains:');
    chains.slice(0, 10).forEach((chain: any) => {
      console.log(`- ${chain.name} (ID: ${chain.id}, Key: ${chain.key})`);
    });
    
    if (chains.length > 10) {
      console.log(`... and ${chains.length - 10} more chains`);
    }
    
    return chains;
  } catch (error) {
    console.error('❌ Error fetching chains:', formatError(error));
    throw error;
  }
}

export { getChains };

