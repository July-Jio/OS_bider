import dotenv from 'dotenv';
import { ethers } from 'ethers';

dotenv.config();

export interface Config {
    openseaApiKey: string;
    walletPrivateKey: string;
    network: 'mainnet' | 'testnet';
    chain: string; // e.g. 'ethereum', 'polygon', 'hyperevm', 'base'
    rpcUrl: string;
}

const getEnv = (key: string, required: boolean = true): string => {
    const value = process.env[key];
    if (!value && required) {
        throw new Error(`Missing environment variable: ${key}`);
    }
    return value || '';
};

import { DEFAULT_RPC_URLS } from './constants';

export const config: Config = {
    openseaApiKey: getEnv('OPENSEA_API_KEY'),
    walletPrivateKey: getEnv('WALLET_PRIVATE_KEY'),
    network: (getEnv('NETWORK', false) || 'mainnet') as 'mainnet' | 'testnet',
    chain: getEnv('CHAIN', false) || 'ethereum',
    rpcUrl: getEnv('RPC_URL', false) || DEFAULT_RPC_URLS[getEnv('CHAIN', false) || 'ethereum'] || 'https://mainnet.infura.io/v3/YOUR_INFURA_KEY',
};

export const getWallet = (provider: ethers.JsonRpcProvider): ethers.Wallet => {
    return new ethers.Wallet(config.walletPrivateKey, provider);
}
