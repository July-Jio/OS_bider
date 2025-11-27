import { openseaSDK, wallet } from './opensea';
import { ethers } from 'ethers';

export interface CollectionStats {
    floorPrice: number;
    bestOffer: number;
}

export const getCollectionStats = async (collectionSlug: string): Promise<CollectionStats> => {
    try {
        const stats = await openseaSDK.api.getCollectionStats(collectionSlug);

        return {
            floorPrice: stats.total.floor_price,
            bestOffer: 0, // We will fetch this separately
        };
    } catch (error) {
        console.error(`Error fetching stats for ${collectionSlug}:`, error);
        throw error;
    }
};

// Helper to get actual best offer
export const getBestOffer = async (collectionSlug: string): Promise<{ price: number; isOurs: boolean }> => {
    try {
        const { offers } = await openseaSDK.api.getCollectionOffers(collectionSlug, 10);

        if (offers.length > 0) {
            // Filter to only get single-item offers (quantity = 1) for accurate comparison
            const singleItemOffers = offers.filter((offer: any) => {
                const quantity = (offer as any).remaining_quantity || 1;
                return quantity === 1;
            });

            // If no single-item offers, calculate per-item price from batch offers
            const targetOffer: any = singleItemOffers.length > 0 ? singleItemOffers[0] : offers[0];

            // Parse the price
            let priceValue = 0;
            let quantity = targetOffer.remaining_quantity || 1;

            if (targetOffer.price && typeof targetOffer.price === 'object' && targetOffer.price.value) {
                const totalPrice = parseFloat(ethers.formatUnits(targetOffer.price.value, targetOffer.price.decimals || 18));
                // Divide by quantity to get per-item price
                priceValue = totalPrice / quantity;
            }

            // Check if this offer is ours
            const offerer = targetOffer.protocol_data?.parameters?.offerer;
            let isOurs = false;

            if (wallet && offerer) {
                const accountAddress = await wallet.getAddress();
                isOurs = offerer.toLowerCase() === accountAddress.toLowerCase();
            }

            return { price: priceValue, isOurs };
        }
        return { price: 0, isOurs: false };
    } catch (error) {
        console.error(`Error fetching best offer for ${collectionSlug}:`, error);
        return { price: 0, isOurs: false };
    }
}
