import { openseaSDK, wallet } from './opensea';
import { config } from './config';
import { ethers } from 'ethers';
import { getWethAddress } from './constants';
import { getNativeTokenName } from './utils';
import { OrderSide } from 'opensea-js';
import { trackVolumeTrade } from './trade_tracker';

// Track last purchased NFT to prevent buying another until it's sold
let lastPurchasedNft: { tokenAddress: string; tokenId: string; listingPrice: number; purchaseTime: number } | null = null;
let lastPurchaseTime = 0;
const PURCHASE_COOLDOWN_MS = 30000; // 30 seconds cooldown between purchases

// Track recently purchased items to prevent immediate relisting (2 minute window)
const recentlyPurchasedItems = new Map<string, number>();
const RECENT_PURCHASE_WINDOW_MS = 2 * 60 * 1000; // 2 minutes

export const wasRecentlyPurchased = (tokenAddress: string, tokenId: string): boolean => {
    const key = `${tokenAddress.toLowerCase()}-${tokenId}`;
    const purchaseTime = recentlyPurchasedItems.get(key);
    if (purchaseTime && (Date.now() - purchaseTime < RECENT_PURCHASE_WINDOW_MS)) {
        return true;
    }
    // Clean up old entries
    if (purchaseTime && (Date.now() - purchaseTime >= RECENT_PURCHASE_WINDOW_MS)) {
        recentlyPurchasedItems.delete(key);
    }
    return false;
};

const markAsRecentlyPurchased = (tokenAddress: string, tokenId: string) => {
    const key = `${tokenAddress.toLowerCase()}-${tokenId}`;
    recentlyPurchasedItems.set(key, Date.now());
};

export const volumeTrade = async (
    collectionSlug: string,
    floorPrice: number
): Promise<void> => {
    try {
        const accountAddress = await wallet.getAddress();
        const nativeToken = getNativeTokenName(config.chain);

        // Check cooldown to prevent race conditions
        const timeSinceLastPurchase = Date.now() - lastPurchaseTime;
        if (timeSinceLastPurchase < PURCHASE_COOLDOWN_MS) {
            const remainingSeconds = Math.ceil((PURCHASE_COOLDOWN_MS - timeSinceLastPurchase) / 1000);
            console.log(`Volume Trading: Cooldown active - waiting ${remainingSeconds}s before next purchase`);
            return;
        }

        // 1. Get contract address from collection
        const { nfts: collectionNfts } = await openseaSDK.api.getNFTsByCollection(collectionSlug);
        if (collectionNfts.length === 0) {
            console.log('No NFTs found in collection to determine contract address');
            return;
        }
        const contractAddress = collectionNfts[0].contract;

        // Check if we already own any NFT from this collection
        const { nfts: ownedNfts } = await openseaSDK.api.getNFTsByAccount(accountAddress, 100);
        const ownedFromCollection = ownedNfts.filter(nft => {
            try {
                const collectionAny: any = (nft as any).collection;
                const slug = typeof collectionAny === 'string' ? collectionAny : collectionAny?.slug;
                return slug === collectionSlug;
            } catch (e) {
                return false;
            }
        });

        if (ownedFromCollection.length >= 4) {
            console.log(`Volume Trading: Skipping - already own ${ownedFromCollection.length} NFT(s) from ${collectionSlug} in wallet (limit: 4)`);
            ownedFromCollection.forEach(nft => {
                console.log(`  - Token ID: ${nft.identifier}`);
            });
            return;
        }

        // 2. Find the cheapest listing (floor)
        // Get listings for this collection only
        console.log(`Volume Trading: Fetching listings for collection ${collectionSlug}...`);

        const { orders: listings } = await openseaSDK.api.getOrders({
            collection_slug: collectionSlug,
            side: OrderSide.LISTING,
            limit: 100  // Get multiple listings to find the cheapest
        } as any);

        console.log(`Volume Trading: Retrieved ${listings.length} orders from OpenSea for collection ${collectionSlug}`);

        if (listings.length === 0) {
            console.log('No listings found for volume trading');
            return;
        }

        // Filter orders to those that match the collection contract address explicitly
        const filtered = listings.filter((o: any) => {
            try {
                const tokenAddr = o.protocolData?.parameters?.offer?.[0]?.token;
                return tokenAddr && tokenAddr.toLowerCase() === contractAddress.toLowerCase();
            } catch (e) {
                return false;
            }
        });

        console.log(`Volume Trading: ${filtered.length} orders match the collection contract ${contractAddress}`);

        if (filtered.length === 0) {
            console.log('No matching collection listings after filtering by contract address');
            return;
        }

        // Sort the matching listings by price (ascending)
        const sortedListings = filtered.sort((a: any, b: any) => {
            const priceA = parseFloat(ethers.formatEther(a.currentPrice));
            const priceB = parseFloat(ethers.formatEther(b.currentPrice));
            return priceA - priceB;
        });

        // Only try to buy the absolute cheapest listing
        const listing = sortedListings[0] as any;
        const price = parseFloat(ethers.formatEther(listing.currentPrice));

        // Require the cheapest listing to be at (or very near) the provided floor price before buying.
        // Use a 1% tolerance to account for small discrepancies.
        const tolerance = 0.01; // 1%
        if (price > floorPrice * (1 + tolerance)) {
            console.log(`Skipping volume trade - cheapest listing (${price}) is > ${tolerance * 100}% above provided floor (${floorPrice})`);
            return;
        }

        // Ensure the listing is for the collection we intend to trade
        const listingTokenAddress = listing.protocolData?.parameters?.offer?.[0]?.token;
        if (listingTokenAddress && listingTokenAddress.toLowerCase() !== contractAddress.toLowerCase()) {
            console.log(`Skipping listing: token ${listingTokenAddress} does not match collection contract ${contractAddress}`);
            return;
        }

        console.log(`Volume Trading: Cheapest collection listing is ${price} ${nativeToken} (floor: ${floorPrice})`);
        console.log(`Attempting to buy item ${listing.protocolData.parameters.offer[0].identifierOrCriteria} for ${price} ${nativeToken}...`);

        // Check balance and unwrap if needed
        const provider = wallet.provider;
        if (!provider) return;
        const nativeBalance = await provider.getBalance(accountAddress);
        const nativeBalanceEth = parseFloat(ethers.formatEther(nativeBalance));

        if (nativeBalanceEth < price) {
            const amountToUnwrap = price - nativeBalanceEth + 0.01;
            if (amountToUnwrap > 0) {
                console.log(`Unwrapping ${amountToUnwrap} ${nativeToken} for volume trade...`);
                try {
                    const wethAddress = getWethAddress(config.chain);
                    const wethContract = new ethers.Contract(wethAddress, ['function withdraw(uint256) external'], wallet);
                    const tx = await wethContract.withdraw(ethers.parseEther(amountToUnwrap.toString()));
                    await tx.wait();
                    console.log(`✓ Unwrapped ${amountToUnwrap} ${nativeToken}`);
                } catch (unwrapErr) {
                    console.error('Failed to unwrap:', unwrapErr);
                    return;
                }
            }
        }

        // ... inside volumeTrade function ...

        try {
            await openseaSDK.fulfillOrder({
                order: listing,
                accountAddress: accountAddress,
            });
            console.log(`✓ Volume Trade: Purchased NFT at ${price} ${nativeToken}`);

            // Set cooldown
            lastPurchaseTime = Date.now();

            // Track the trade for future relisting
            trackVolumeTrade(
                listing.protocolData.parameters.offer[0].token,
                listing.protocolData.parameters.offer[0].identifierOrCriteria,
                price,
                collectionSlug
            );

            // Mark as recently purchased to prevent immediate relisting
            markAsRecentlyPurchased(
                listing.protocolData.parameters.offer[0].token,
                listing.protocolData.parameters.offer[0].identifierOrCriteria
            );

        } catch (buyErr: any) {
            console.error(`✗ Failed to buy cheapest listing:`, buyErr?.message || buyErr);
            return;
        }

        // 3. List the item immediately
        const listPrice = price * 1.015;
        // Round to 6 decimal places to preserve precision (e.g. 0.002803)
        const roundedListPrice = Math.round(listPrice * 1000000) / 1000000;

        // We need the token ID and contract address. 
        const tokenAddress = listing.protocolData.parameters.offer[0].token;
        const tokenId = listing.protocolData.parameters.offer[0].identifierOrCriteria;

        // Check if already listed before attempting to list
        try {
            const existingListingsResponse = await openseaSDK.api.getNFTListings(tokenAddress, tokenId, 5);
            const existingListings = existingListingsResponse.listings || [];

            const hasOurListing = existingListings.some((l: any) => {
                const maker = l.maker || l.offerer || l.protocol_data?.parameters?.offerer;
                return maker && maker.toLowerCase() === accountAddress.toLowerCase();
            });

            if (hasOurListing) {
                console.log(`✓ Volume Trade: Item ${tokenId} already listed - skipping duplicate listing`);
                return;
            }
        } catch (checkErr) {
            console.log('Could not check existing listings, proceeding with listing attempt...');
        }

        console.log(`Volume Trade: Listing item at ${roundedListPrice.toFixed(6)} ${nativeToken} (Buy Price + 1.5%)...`);

        try {
            // Calculate expiration time (10 minutes from now)
            const expirationTime = Math.round(Date.now() / 1000 + 60 * 10);

            await openseaSDK.createListing({
                asset: {
                    tokenAddress: tokenAddress,
                    tokenId: tokenId,
                },
                accountAddress: accountAddress,
                amount: roundedListPrice.toString(),
                quantity: 1,
                expirationTime: expirationTime,
            });

            console.log(`✓ Volume Trade: Listed item ${tokenId} at ${roundedListPrice.toFixed(6)} ${nativeToken} (expires in 10m)`);
            // Clear tracking since we've successfully listed it
            lastPurchasedNft = null;
        } catch (listErr: any) {
            console.error(`✗ Volume Trade: Failed to list item ${tokenId}:`, listErr?.message || listErr);
            console.log('You may need to list it manually later.');
        }

    } catch (error: any) {
        console.error('Error in volume trade:', error?.message || error);
    }
};
