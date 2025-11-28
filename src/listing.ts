import { openseaSDK, wallet } from './opensea';
import { config } from './config';
import { calculateListingPrice, StrategyConfig } from './strategy';
import { getWethAddress } from './constants';
import { getVolumeTrade } from './trade_tracker';
import { wasRecentlyPurchased } from './volume';

// Track recently created listings to prevent immediate relisting (15 minute window)
const recentlyCreatedListings = new Map<string, number>();
const LISTING_CACHE_DURATION_MS = 15 * 60 * 1000; // 15 minutes

export const checkAndListPurchasedItems = async (
    collectionSlug: string,
    floorPrice: number,
    strategyConfig: StrategyConfig
): Promise<void> => {
    try {
        const accountAddress = await wallet.getAddress();

        // Get NFTs owned by the account in this collection
        const { nfts } = await openseaSDK.api.getNFTsByAccount(accountAddress, 50);

        // Filter for items from the target collection. `nft.collection` may be a string
        // or an object with a `slug` property, so normalize before comparing.
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

        console.log(`Found ${collectionNfts.length} owned items in collection`);

        // Check each NFT to see if it's already listed
        for (const nft of collectionNfts) {
            try {
                // Skip if this was just purchased (within 2 minutes)
                if (wasRecentlyPurchased(nft.contract, nft.identifier)) {
                    console.log(`Item ${nft.identifier} was recently purchased - skipping to avoid duplicate listing`);
                    continue;
                }

                // Check local cache for recently created listings
                const cacheKey = `${nft.contract.toLowerCase()}-${nft.identifier}`;
                const cachedListingTime = recentlyCreatedListings.get(cacheKey);
                if (cachedListingTime && (Date.now() - cachedListingTime < LISTING_CACHE_DURATION_MS)) {
                    const minutesAgo = Math.floor((Date.now() - cachedListingTime) / 60000);
                    console.log(`✓ Item ${nft.identifier} was listed ${minutesAgo} minute(s) ago (cached) - skipping`);
                    continue;
                }

                // Check if already listed via API
                console.log(`Checking listings for item ${nft.identifier} (${nft.contract})...`);

                const response = await openseaSDK.api.getNFTListings(
                    nft.contract,
                    nft.identifier,
                    10  // Get more listings to be thorough
                );

                const listings = response.listings || [];

                console.log(`API returned ${listings.length} listing(s) for item ${nft.identifier}`);

                // Debug: Log what we got from the API
                if (listings.length > 0) {
                    listings.forEach((l: any, idx: number) => {
                        const maker = l.maker || l.offerer || l.protocol_data?.parameters?.offerer;
                        console.log(`  Listing ${idx + 1}: maker=${maker}, ourAddress=${accountAddress}, isOurs=${maker?.toLowerCase() === accountAddress.toLowerCase()}`);
                    });
                } else {
                    console.log(`  No listings found via API for item ${nft.identifier} - will attempt to list`);
                }

                // Skip if already listed by us - check multiple possible field names
                const hasOurListing = listings.some((listing: any) => {
                    const maker = listing.maker || listing.offerer || listing.protocol_data?.parameters?.offerer;
                    return maker && maker.toLowerCase() === accountAddress.toLowerCase();
                });

                if (hasOurListing) {
                    console.log(`✓ Item ${nft.identifier} already listed (API confirmed) - skipping`);
                    continue;
                }

                // Check if this is a volume trade item
                const volumeTrade = getVolumeTrade(nft.contract, nft.identifier);

                if (!volumeTrade) {
                    // Skip non-volume-trade items (they should be managed by harvest listing if enabled)
                    continue;
                }

                // It's a volume trade item, list at floor * 1.02
                const listingPrice = Math.round((floorPrice * 1.02) * 1000000) / 1000000;
                const expirationTime = Math.round(Date.now() / 1000 + 60 * 10);

                console.log(`Relisting volume trade item ${nft.identifier} at ${listingPrice.toFixed(6)} (floor * 1.02, expires in 10m)...`);

                // Create listing with retry logic
                let listed = false;
                for (let attempt = 1; attempt <= 3; attempt++) {
                    try {
                        const created = await openseaSDK.createListing({
                            asset: {
                                tokenAddress: nft.contract,
                                tokenId: nft.identifier,
                            },
                            accountAddress: accountAddress,
                            amount: listingPrice.toString(),
                            quantity: 1,
                            expirationTime: expirationTime,
                        });

                        // `createListing` returns an OrderV2-like object with `orderHash`
                        console.log(`✓ Listed ${nft.identifier}`, created?.orderHash || '');
                        listed = true;

                        // Add to cache to prevent immediate relisting
                        const cacheKey = `${nft.contract.toLowerCase()}-${nft.identifier}`;
                        recentlyCreatedListings.set(cacheKey, Date.now());

                        break; // Success
                    } catch (createErr: any) {
                        console.error(`✗ Failed to create listing for ${nft.identifier} (Attempt ${attempt}/3):`, createErr?.message || createErr);
                        if (attempt < 3) {
                            console.log('Waiting 2s before retry...');
                            await new Promise(resolve => setTimeout(resolve, 2000));
                        }
                    }
                }

                if (!listed) {
                    console.error(`✗ Could not list ${nft.identifier} after 3 attempts.`);
                }
            } catch (err: any) {
                console.error(`✗ Failed to list ${nft.identifier}:`, err?.message || err);
            }
        }
    } catch (error: any) {
        console.error('Error checking purchased items:', error?.message || error);
    }
};
