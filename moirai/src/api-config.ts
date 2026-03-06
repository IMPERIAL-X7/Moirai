/**
 * LI.FI API Configuration
 * 
 * This module sets up the API client for interacting with LI.FI's REST API.
 * No API key is required for basic usage, but you can obtain one for higher rate limits.
 */

import axios, { AxiosInstance } from 'axios';
import { config } from 'dotenv';

// Load environment variables
config();

const BASE_URL = 'https://li.quest/v1';

// Get API key from environment (optional)
const API_KEY = process.env.LIFI_API_KEY || '';

/**
 * Create an axios instance with LI.FI API configuration
 */
export function createApiClient(): AxiosInstance {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // Add API key if provided
  if (API_KEY) {
    headers['x-lifi-api-key'] = API_KEY;
  }

  return axios.create({
    baseURL: BASE_URL,
    headers,
    timeout: 30000, // 30 seconds timeout
  });
}

/**
 * Validate API key by making a test request
 */
export async function testApiKey(client: AxiosInstance): Promise<boolean> {
  try {
    await client.get('/keys/test');
    console.log('✅ API key is valid');
    return true;
  } catch (error: any) {
    if (error.response?.status === 401) {
      console.log('⚠️  API key is invalid or not provided');
      return false;
    }
    // For endpoints that don't exist, we'll just skip the test
    return true;
  }
}

export const apiClient = createApiClient();

