import { openseaSDK, wallet } from './opensea';
import { config } from './config';
import { ethers } from 'ethers';
import { getWethAddress } from './constants';
import { getNativeTokenName } from './utils';

export const sniperBuy = async (
    collectionSlug: string,
    floorPrice: number,
    threshold: number
): Promise<void> => {
    try {
        const accountAddress = await wallet.getAddress();
        const nativeToken = getNativeTokenName(config.chain);

        // Get NFTs in collection (without limit to avoid cursor error)
        const { nfts } = await openseaSDK.api.getNFTsByCollection(collectionSlug);

        // Check first 20 NFTs for underpriced listings
        const nftsToCheck = nfts.slice(0, 20);

        for (const nft of nftsToCheck) {
            try {
                // Get listings for this specific NFT
                const { listings } = await openseaSDK.api.getNFTListings(
                    nft.contract,
                    nft.identifier,
                    1
                );

                if (listings.length === 0) continue;

                const listing = listings[0];
                const price = parseFloat(ethers.formatEther(listing.price.current.value));
                const priceThreshold = floorPrice * threshold;

                if (price < priceThreshold) {
                    console.log(`🎯 Found underpriced listing: ${price} ${nativeToken} (${(price / floorPrice * 100).toFixed(1)}% of floor)`);

                    // Check if we have enough native token
                    const provider = wallet.provider;
                    if (!provider) continue;

                    const nativeBalance = await provider.getBalance(accountAddress);
                    const nativeBalanceEth = parseFloat(ethers.formatEther(nativeBalance));

                    // If not enough native, unwrap WETH
                    if (nativeBalanceEth < price) {
                        const amountToUnwrap = price - nativeBalanceEth + 0.01; // Add buffer for gas
                        console.log(`Unwrapping ${amountToUnwrap} ${nativeToken}...`);

                        try {
                            const wethAddress = getWethAddress(config.chain);
                            const wethContract = new ethers.Contract(
                                wethAddress,
                                ['function withdraw(uint256) external'],
                                wallet
                            );

                            const tx = await wethContract.withdraw(
                                ethers.parseEther(amountToUnwrap.toString())
                            );
                            await tx.wait();
                            console.log(`✓ Unwrapped ${amountToUnwrap} ${nativeToken}`);
                        } catch (unwrapErr) {
                            console.error('Failed to unwrap:', unwrapErr);
                            continue;
                        }
                    }

                    // Buy the listing using fulfillOrder
                    try {
                        await openseaSDK.fulfillOrder({
                            order: listing,
                            accountAddress: accountAddress,
                        });
                        console.log(`✓ Purchased NFT at ${price} ${nativeToken}`);
                        return; // Only buy one per cycle
                    } catch (buyErr) {
                        console.error('Failed to buy:', buyErr);
                    }
                }
            } catch (nftErr) {
                // Skip this NFT if there's an error
                continue;
            }
        }
    } catch (error: any) {
        console.error('Error in sniper buy:', error?.message || error);
    }
};
