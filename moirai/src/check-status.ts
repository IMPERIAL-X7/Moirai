/**
 * Example: Check transaction status
 * 
 * This example demonstrates how to check the status of a cross-chain
 * transaction using either txHash or transactionId.
 */

import { apiClient } from './api-config.js';
import { formatError } from './utils.js';

interface StatusParams {
  txHash?: string;
  transactionId?: string;
}

async function checkStatus(params: StatusParams) {
  console.log('🔍 Checking transaction status...\n');
  
  if (!params.txHash && !params.transactionId) {
    throw new Error('Either txHash or transactionId must be provided');
  }
  
  try {
    const queryParams: Record<string, string> = {};
    
    if (params.txHash) {
      queryParams.txHash = params.txHash;
      console.log(`📋 Checking by txHash: ${params.txHash}\n`);
    }
    
    if (params.transactionId) {
      queryParams.transactionId = params.transactionId;
      console.log(`📋 Checking by transactionId: ${params.transactionId}\n`);
    }
    
    const response = await apiClient.get('/status', { params: queryParams });
    const status = response.data;
    
    console.log('✅ Status retrieved:\n');
    console.log(`Status: ${status.status}`);
    
    if (status.substatus) {
      console.log(`Substatus: ${status.substatus}`);
    }
    
    if (status.receiving) {
      console.log('\nReceiving:');
      console.log(`  Chain ID: ${status.receiving.chainId}`);
      console.log(`  Token: ${status.receiving.token.symbol}`);
      console.log(`  Amount: ${status.receiving.amount}`);
    }
    
    if (status.sending) {
      console.log('\nSending:');
      console.log(`  Chain ID: ${status.sending.chainId}`);
      console.log(`  Token: ${status.sending.token.symbol}`);
      console.log(`  Amount: ${status.sending.amount}`);
    }
    
    if (status.lifuelTxId) {
      console.log(`\nLI.Fuel TX ID: ${status.lifuelTxId}`);
    }
    
    return status;
  } catch (error) {
    console.error('❌ Error checking status:', formatError(error));
    throw error;
  }
}

// Run if called directly
const args = process.argv.slice(2);

if (args.length === 0) {
  console.error('Usage: npm run check-status <txHash> or npm run check-status <transactionId>');
  process.exit(1);
}

const txHash = args[0];

checkStatus({ txHash })
  .then(() => process.exit(0))
  .catch(() => process.exit(1));

export { checkStatus };

