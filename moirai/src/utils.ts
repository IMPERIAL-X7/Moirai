/**
 * Utility Functions for LI.FI API Examples
 */

import { AxiosError } from 'axios';

/**
 * Format errors for better readability
 */
export function formatError(error: unknown): string {
  if (error instanceof AxiosError) {
    if (error.response) {
      // Server responded with error status
      return `HTTP ${error.response.status}: ${JSON.stringify(error.response.data)}`;
    } else if (error.request) {
      // Request was made but no response received
      return `No response received: ${error.message}`;
    } else {
      // Error setting up the request
      return `Request setup error: ${error.message}`;
    }
  }
  
  if (error instanceof Error) {
    return error.message;
  }
  
  return String(error);
}

/**
 * Sleep for a specified number of milliseconds
 */
export async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  initialDelay = 1000
): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxAttempts) {
        throw error;
      }
      
      const delay = initialDelay * Math.pow(2, attempt - 1);
      console.log(`Attempt ${attempt} failed, retrying in ${delay}ms...`);
      await sleep(delay);
    }
  }
  
  throw new Error('Max attempts reached');
}

/**
 * Format token amounts based on decimals
 */
export function formatTokenAmount(amount: string, decimals: number): string {
  const num = BigInt(amount);
  const divisor = BigInt(10 ** decimals);
  const whole = num / divisor;
  const fractional = num % divisor;
  
  if (fractional === BigInt(0)) {
    return whole.toString();
  }
  
  const fractionalStr = fractional.toString().padStart(decimals, '0');
  const trimmed = fractionalStr.replace(/0+$/, '');
  
  return trimmed ? `${whole}.${trimmed}` : whole.toString();
}

/**
 * Parse token amount to smallest unit
 */
export function parseTokenAmount(amount: string, decimals: number): string {
  const parts = amount.split('.');
  const whole = parts[0] || '0';
  const fractional = parts[1] || '0';
  
  const fractionalPadded = fractional.padEnd(decimals, '0').slice(0, decimals);
  return whole + fractionalPadded;
}

