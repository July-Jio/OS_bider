import { OpenSeaSDK, Chain } from 'opensea-js';
import { config, getWallet } from './config';
import { ethers } from 'ethers';

// Initialize provider
const provider = new ethers.JsonRpcProvider(config.rpcUrl);

// Initialize wallet
const wallet = getWallet(provider);

// Initialize OpenSea SDK
export const openseaSDK = new OpenSeaSDK(wallet, {
    chain: config.chain as Chain,
    apiKey: config.openseaApiKey,
});

export { wallet, provider };
