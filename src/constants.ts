import { Chain } from 'opensea-js';

export const WETH_ADDRESSES: Record<string, string> = {
    [Chain.Mainnet]: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    [Chain.Polygon]: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
    [Chain.HyperEVM]: '0x5555555555555555555555555555555555555555',
    [Chain.Base]: '0x4200000000000000000000000000000000000006',
    // Add others as needed
    // Goerli
    'goerli': '0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6',
    // Sepolia
    'sepolia': '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
};

export const DEFAULT_RPC_URLS: Record<string, string> = {
    [Chain.Mainnet]: 'https://mainnet.infura.io/v3/YOUR_INFURA_KEY',
    [Chain.Polygon]: 'https://polygon-rpc.com',
    [Chain.HyperEVM]: 'https://rpc.hyperliquid.xyz/evm',
    [Chain.Base]: 'https://mainnet.base.org',
    'goerli': 'https://goerli.infura.io/v3/YOUR_INFURA_KEY',
    'sepolia': 'https://sepolia.infura.io/v3/YOUR_INFURA_KEY',
};

export const getWethAddress = (chain: string): string => {
    const address = WETH_ADDRESSES[chain];
    if (!address) {
        throw new Error(`WETH address not defined for chain: ${chain}`);
    }
    return address;
};
