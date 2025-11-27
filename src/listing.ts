import { openseaSDK, wallet } from './opensea';
import { config } from './config';
import { calculateListingPrice, StrategyConfig } from './strategy';
import { getWethAddress } from './constants';
import { getVolumeTrade } from './trade_tracker';

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
                // Check if already listed via API
                const response = await openseaSDK.api.getNFTListings(
                    nft.contract,
                    nft.identifier,
                    10  // Get more listings to be thorough
                );

                const listings = response.listings || [];

                // Debug: Log what we got from the API
                if (listings.length > 0) {
                    console.log(`Item ${nft.identifier} has ${listings.length} listing(s) from API`);
                    listings.forEach((l: any, idx: number) => {
                        const maker = l.maker || l.offerer || l.protocol_data?.parameters?.offerer;
                        console.log(`  Listing ${idx + 1}: maker=${maker}, isOurs=${maker?.toLowerCase() === accountAddress.toLowerCase()}`);
                    });
                }

                // Skip if already listed by us - check multiple possible field names
                const hasOurListing = listings.some((listing: any) => {
                    const maker = listing.maker || listing.offerer || listing.protocol_data?.parameters?.offerer;
                    return maker && maker.toLowerCase() === accountAddress.toLowerCase();
                });

                if (hasOurListing) {
                    console.log(`Item ${nft.identifier} already listed (API confirmed) - skipping`);
                    continue;
                }


                // ... (existing imports)

                // ... inside checkAndListPurchasedItems loop ...

                // Check if this is a volume trade item
                const volumeTrade = getVolumeTrade(nft.contract, nft.identifier);
                let listingPrice: number;
                let expirationTime: number | undefined;

                if (volumeTrade) {
                    // It's a volume trade item, list at floor * 1.02
                    listingPrice = floorPrice * 1.02;
                    // Round to 6 decimals
                    listingPrice = Math.round(listingPrice * 1000000) / 1000000;
                    // Set expiration to 10 minutes from now
                    expirationTime = Math.round(Date.now() / 1000 + 60 * 10);
                    console.log(`Relisting volume trade item ${nft.identifier} at ${listingPrice.toFixed(6)} (floor * 1.02, expires in 10m)...`);
                } else {
                    // Standard listing logic
                    listingPrice = calculateListingPrice(floorPrice, strategyConfig);
                    console.log(`Listing ${nft.identifier} at ${listingPrice}...`);
                }

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
