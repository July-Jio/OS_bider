import { ethers } from 'ethers';

export interface StrategyConfig {
    maxOfferPercentageOfFloor: number; // e.g., 0.8 for 80% of floor
    bidIncrement: number; // e.g., 0.001 ETH
    undercutAmount: number; // e.g., 0.001 ETH
    offerDurationMinutes: number; // Duration for offers (default 10 minutes)
    sniperBuyThreshold: number; // Buy listings below this % of floor (default 0.7 = 70%)
    harvestUndercutAmount: number;
    useSecondBestStrategy: boolean; // If true, bid above second-best instead of best
}

export const calculateOfferPrice = (
    currentBestOffer: number,
    secondBestOffer: number,
    floorPrice: number,
    config: StrategyConfig
): number | null => {
    const maxAllowedOffer = floorPrice * config.maxOfferPercentageOfFloor;

    let targetOffer: number;

    if (config.useSecondBestStrategy && secondBestOffer > 0) {
        // Strategy: Bid slightly above the second-best offer
        // This is more conservative and can save money if there's a big gap between 1st and 2nd
        targetOffer = secondBestOffer + config.bidIncrement;
        console.log(`Using second-best strategy: ${secondBestOffer} + ${config.bidIncrement} = ${targetOffer}`);
    } else {
        // Default strategy: Beat the highest offer
        targetOffer = currentBestOffer + config.bidIncrement;
    }

    // If our calculated target is too high (above safety threshold), we can't bid that high.
    if (targetOffer > maxAllowedOffer) {
        console.log(`Target offer ${targetOffer} exceeds max allowed ${maxAllowedOffer}. Skipping.`);
        return null;
    }

    // Round to 4 decimals for OpenSea API compatibility
    return Math.round(targetOffer * 10000) / 10000;
};

export const calculateListingPrice = (
    floorPrice: number,
    config: StrategyConfig
): number => {
    return floorPrice - config.undercutAmount;
};
