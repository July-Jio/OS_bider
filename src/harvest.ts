import { openseaSDK, wallet } from './opensea';
import { config } from './config';
import { ethers } from 'ethers';
import { getVolumeTrade } from './trade_tracker';

export const harvestListing = async (
    collectionSlug: string,
    floorPrice: number,
    undercutAmount: number
): Promise<void> => {
    try {
        const accountAddress = await wallet.getAddress();

        // Get NFTs owned by the account in this collection
        const { nfts } = await openseaSDK.api.getNFTsByAccount(accountAddress, 50);

        // Filter for items from the target collection. `nft.collection` may be a string or
        // an object with a `slug` property, so normalize before comparing.
        const collectionNfts = nfts.filter(nft => {
            try {
                const collectionAny: any = (nft as any).collection;
                const slug = typeof collectionAny === 'string' ? collectionAny : collectionAny?.slug;
                return slug === collectionSlug;
            } catch (e) {
                return false;
            }
        });

        if (collectionNfts.length === 0) {
            return;
        }

        console.log(`Checking ${collectionNfts.length} owned items for harvest listing...`);

        // Get current floor listings to check if we're the floor
        const { listings } = await openseaSDK.api.getAllListings(collectionSlug, 1);

        let currentFloorListing = null;
        if (listings.length > 0) {
            currentFloorListing = listings[0];
        }

        // Check if the floor is ours
        const floorIsOurs = currentFloorListing &&
            currentFloorListing.protocol_data?.parameters?.offerer?.toLowerCase() === accountAddress.toLowerCase();

        if (floorIsOurs) {
            console.log('Floor listing is already ours, skipping harvest');
            return;
        }

        // Target price: 0.001 below floor
        const targetPrice = Math.max(0.001, floorPrice - undercutAmount);

        console.log(`Harvest target: ${targetPrice} (floor: ${floorPrice})`);

        // Update listings for our NFTs
        for (const nft of collectionNfts) {
            try {
                // Skip volume trade items - they are managed by volume trading logic
                const volumeTrade = getVolumeTrade(nft.contract, nft.identifier);
                if (volumeTrade) {
                    console.log(`Item ${nft.identifier} is a volume trade item - skipping harvest`);
                    continue;
                }

                // Check if already listed
                const response = await openseaSDK.api.getNFTListings(
                    nft.contract,
                    nft.identifier,
                    1
                );

                const nftListings = response.listings || [];

                // Check if we have an active listing
                const ourListing = nftListings.find(
                    (listing: any) => listing.protocol_data?.parameters?.offerer?.toLowerCase() === accountAddress.toLowerCase()
                );

                if (ourListing) {
                    const currentPrice = parseFloat(ethers.formatEther(ourListing.price.current.value));

                    // If our price is already at target, skip
                    if (Math.abs(currentPrice - targetPrice) < 0.0001) {
                        console.log(`Item ${nft.identifier} already listed at target price`);
                        continue;
                    }

                    // Cancel old listing and create new one
                    console.log(`Updating listing for ${nft.identifier}: ${currentPrice} → ${targetPrice}`);
                }

                // Create/update listing
                await openseaSDK.createListing({
                    asset: {
                        tokenAddress: nft.contract,
                        tokenId: nft.identifier,
                    },
                    accountAddress: accountAddress,
                    amount: targetPrice.toString(),
                    quantity: 1,
                });

                console.log(`✓ Listed ${nft.identifier} at ${targetPrice}`);

                // Only update one listing per cycle to avoid rate limits
                break;

            } catch (err: any) {
                console.error(`✗ Failed to list ${nft.identifier}:`, err?.message || err);
            }
        }
    } catch (error: any) {
        console.error('Error in harvest listing:', error?.message || error);
    }
};
