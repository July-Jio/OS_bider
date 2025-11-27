import { getCollectionStats, getBestOffer } from './monitor';
import { calculateOfferPrice } from './strategy';
import { config } from './config';
import { openseaSDK, wallet } from './opensea';
import { getWethAddress } from './constants';
import { getNativeTokenName, getWrappedTokenName } from './utils';
import { checkAndListPurchasedItems } from './listing';
import { sniperBuy } from './sniper';
import { harvestListing } from './harvest';
import { cancelAllOffers, addOfferHash } from './cancel';
import { broadcastUpdate, shouldBotStop, shouldCancelOffers, isOffersEnabled, isHarvestEnabled, isSniperEnabled, isVolumeTradingEnabled } from './dashboard';
import { volumeTrade } from './volume';
import { ethers } from 'ethers';

const COLLECTION_SLUG = 'the-warplets-farcaster'; // TODO: Make configurable
const STRATEGY_CONFIG = {
    maxOfferPercentageOfFloor: 0.985,
    bidIncrement: 0.0001, // OpenSea only supports 4 decimal places
    undercutAmount: 0.005,
    offerDurationMinutes: 10,
    sniperBuyThreshold: 0.7,
    harvestUndercutAmount: 0.001, // Undercut floor by this amount
    useSecondBestStrategy: false, // Set to true to bid above 2nd-best instead of best
};

const POLL_INTERVAL_MS = 30000; // 30 seconds
let currentOfferHash: string | null = null;

const main = async () => {
    console.log('Starting OpenSea Automation Tool...');
    console.log(`Monitoring collection: ${COLLECTION_SLUG}`);
    console.log(`Poll interval: ${POLL_INTERVAL_MS / 1000}s\n`);

    while (true) {
        try {
            // 1. Monitor
            console.log(`[${new Date().toISOString()}] Fetching stats...`);
            const stats = await getCollectionStats(COLLECTION_SLUG);
            const bestOfferData = await getBestOffer(COLLECTION_SLUG);

            const nativeToken = getNativeTokenName(config.chain);
            const wrappedToken = getWrappedTokenName(config.chain);

            console.log(`Floor Price: ${stats.floorPrice.toFixed(6)} ${nativeToken}`);
            console.log(`Current Best Offer: ${bestOfferData.price.toFixed(6)} ${nativeToken}`);

            // Get wallet balance for dashboard
            const accountAddress = await wallet.getAddress();
            const wethAddress = getWethAddress(config.chain);
            const wethContract = new ethers.Contract(
                wethAddress,
                ['function balanceOf(address) view returns (uint256)'],
                wallet
            );
            const wethBalance = await wethContract.balanceOf(accountAddress);
            const wethBalanceEth = parseFloat(ethers.formatEther(wethBalance));

            // Check if the best offer is ours
            let isOurOffer = false;
            // 1. Monitor collection stats
            // const stats = await getCollectionStats(COLLECTION_SLUG); // Already fetched above
            // const bestOfferData = await getBestOffer(COLLECTION_SLUG); // Already fetched above

            // Get second-best offer if using that strategy
            let secondBestOffer = 0;
            if (STRATEGY_CONFIG.useSecondBestStrategy) {
                try {
                    const { offers } = await openseaSDK.api.getCollectionOffers(COLLECTION_SLUG, 2);
                    if (offers.length >= 2) {
                        secondBestOffer = parseFloat(ethers.formatEther(offers[1].price.value));
                        console.log(`Second Best Offer: ${secondBestOffer} ${nativeToken}`);
                    }
                } catch (err) {
                    console.log('Could not fetch second-best offer, using 0');
                }
            }

            console.log(`Floor Price: ${stats.floorPrice.toFixed(6)} ${nativeToken}`);
            console.log(`Current Best Offer: ${bestOfferData.price.toFixed(6)} ${nativeToken}`);

            // Check if best offer is ours
            isOurOffer = bestOfferData.isOurs;
            if (isOurOffer) {
                console.log(`Best offer is already ours (${bestOfferData.price.toFixed(6)} ${nativeToken})`);
            }

            // Broadcast stats to dashboard
            broadcastUpdate({
                type: 'stats',
                floorPrice: `${stats.floorPrice.toFixed(6)} ${nativeToken}`,
                bestOffer: `${bestOfferData.price.toFixed(6)} ${nativeToken}`,
                yourOffer: isOurOffer ? `${bestOfferData.price.toFixed(6)} ${nativeToken}` : '--',
                balance: `${wethBalanceEth.toFixed(6)} ${wrappedToken}`,
            });

            // 2. Bidding Strategy
            const targetOffer = calculateOfferPrice(
                bestOfferData.price,
                secondBestOffer,
                stats.floorPrice,
                STRATEGY_CONFIG
            );

            // Update dashboard with current stats
            broadcastUpdate({
                type: 'stats',
                floorPrice: `${stats.floorPrice.toFixed(6)} ${nativeToken}`,
                bestOffer: `${bestOfferData.price.toFixed(6)} ${nativeToken}`,
                yourOffer: isOurOffer ? `${bestOfferData.price.toFixed(6)} ${nativeToken} (Active)` : (targetOffer ? `${targetOffer.toFixed(6)} ${nativeToken}` : 'None'),
                balance: `${wethBalanceEth.toFixed(6)} ${wrappedToken}`,
            });

            // Skip if best offer is already ours
            if (isOurOffer) {
                console.log('Skipping - already have the best offer');
                broadcastUpdate({ type: 'log', message: 'Skipping - already have the best offer', level: 'info' });
            } else if (targetOffer && isOffersEnabled()) {
                console.log(`Target Offer: ${targetOffer.toFixed(6)} ${nativeToken}`);
                broadcastUpdate({ type: 'log', message: `Target offer: ${targetOffer.toFixed(6)} ${nativeToken}`, level: 'info' });

                // Check WETH/WHYPE balance
                // Re-declare these as they were incorrectly placed outside this block previously
                const accountAddress = await wallet.getAddress();
                const wethAddress = getWethAddress(config.chain);
                const wethContract = new ethers.Contract(
                    wethAddress,
                    ['function balanceOf(address) view returns (uint256)'],
                    wallet
                );
                const wethBalance = await wethContract.balanceOf(accountAddress);
                const wethBalanceEth = parseFloat(ethers.formatEther(wethBalance));

                console.log(`${wrappedToken} Balance: ${wethBalanceEth} ${nativeToken}`);

                // Auto-wrap if insufficient
                if (wethBalanceEth < targetOffer) {
                    const amountToWrap = targetOffer - wethBalanceEth + 0.001; // Add small buffer
                    console.log(`Wrapping ${amountToWrap} ${nativeToken}...`);
                    broadcastUpdate({ type: 'log', message: `Wrapping ${amountToWrap} ${nativeToken}...`, level: 'info' });

                    try {
                        await openseaSDK.wrapEth({
                            amountInEth: amountToWrap.toString(),
                            accountAddress: accountAddress,
                        });
                        console.log(`✓ Wrapped ${amountToWrap} ${nativeToken}`);
                        broadcastUpdate({ type: 'log', message: `✓ Wrapped ${amountToWrap} ${nativeToken}`, level: 'success' });
                    } catch (wrapErr) {
                        console.error(`✗ Failed to wrap:`, wrapErr);
                        broadcastUpdate({ type: 'log', message: `✗ Failed to wrap`, level: 'error' });
                        await sleep(POLL_INTERVAL_MS);
                        continue;
                    }
                }

                // Place new offer (no need to cancel - OpenSea handles duplicates)
                broadcastUpdate({ type: 'log', message: `Placing offer: ${targetOffer} ${nativeToken}`, level: 'info' });
                try {
                    // Calculate expiration time in seconds from now
                    const expirationTime = Math.floor(Date.now() / 1000) + (STRATEGY_CONFIG.offerDurationMinutes * 60);

                    const offer = await openseaSDK.createCollectionOffer({
                        collectionSlug: COLLECTION_SLUG,
                        accountAddress: accountAddress,
                        amount: targetOffer.toString(),
                        quantity: 1,
                        paymentTokenAddress: wethAddress,
                        expirationTime: expirationTime.toString(),
                    });
                    currentOfferHash = offer?.order_hash || null;
                    if (currentOfferHash) {
                        addOfferHash(currentOfferHash);
                    }
                    console.log(`✓ Offer placed: ${currentOfferHash} (expires in ${STRATEGY_CONFIG.offerDurationMinutes}min)`);
                    broadcastUpdate({ type: 'log', message: `✓ Offer placed (expires in ${STRATEGY_CONFIG.offerDurationMinutes}min)`, level: 'success' });
                } catch (err: any) {
                    console.error(`✗ Failed to place offer:`, err?.message || err);
                    broadcastUpdate({ type: 'log', message: `✗ Failed to place offer: ${err?.message || 'Unknown error'}`, level: 'error' });
                }
            } else if (!isOffersEnabled()) {
                console.log('Place offers disabled');
            } else {
                console.log('No valid offer (exceeds safety threshold)');
                broadcastUpdate({ type: 'log', message: 'No valid offer (exceeds safety threshold)', level: 'info' });
            }

            // 3. Harvest listing (keep our listings at floor)
            if (isHarvestEnabled()) {
                await harvestListing(COLLECTION_SLUG, stats.floorPrice, STRATEGY_CONFIG.harvestUndercutAmount);
            }

            // 4. Sniper buy underpriced listings
            if (isSniperEnabled()) {
                await sniperBuy(COLLECTION_SLUG, stats.floorPrice, STRATEGY_CONFIG.sniperBuyThreshold);
            }

            // 5. Volume Trading
            if (isVolumeTradingEnabled()) {
                await volumeTrade(COLLECTION_SLUG, stats.floorPrice);
            }

            // 5. Check for purchased items and auto-list (skip if volume trading is enabled, as it handles its own listing)
            if (!isVolumeTradingEnabled()) {
                await checkAndListPurchasedItems(COLLECTION_SLUG, stats.floorPrice, STRATEGY_CONFIG);
            }

        } catch (error: any) {
            console.error('Error in monitoring loop:', error?.message || error);
        }

        // Check if user requested to cancel offers
        if (shouldCancelOffers()) {
            console.log('\n🚫 Canceling all offers...');
            broadcastUpdate({ type: 'log', message: 'Canceling all offers...', level: 'info' });
            await cancelAllOffers();
            broadcastUpdate({ type: 'log', message: '✓ All offers canceled', level: 'success' });
        }

        // Check if bot should stop
        if (shouldBotStop()) {
            console.log('\n🛑 Bot stopped by user');
            console.log('Canceling all active offers...');
            broadcastUpdate({ type: 'log', message: 'Canceling all offers...', level: 'info' });
            await cancelAllOffers();
            broadcastUpdate({ type: 'log', message: 'Bot stopped', level: 'info' });
            process.exit(0);
        }

        console.log(`\nWaiting ${POLL_INTERVAL_MS / 1000}s...\n`);
        await sleep(POLL_INTERVAL_MS);
    }
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

main();
