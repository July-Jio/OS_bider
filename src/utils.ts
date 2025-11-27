import { Chain } from 'opensea-js';

export const getNativeTokenName = (chain: string): string => {
    switch (chain) {
        case Chain.HyperEVM:
        case 'hyperevm':
            return 'HYPE';
        case Chain.Polygon:
        case 'polygon':
            return 'MATIC';
        case Chain.Base:
        case 'base':
            return 'ETH';
        default:
            return 'ETH';
    }
};

export const getWrappedTokenName = (chain: string): string => {
    switch (chain) {
        case Chain.HyperEVM:
        case 'hyperevm':
            return 'WHYPE';
        case Chain.Polygon:
        case 'polygon':
            return 'WMATIC';
        case Chain.Base:
        case 'base':
            return 'WETH';
        default:
            return 'WETH';
    }
};
