import { openseaSDK, wallet } from './opensea';

// Track all offer hashes we've placed
const activeOfferHashes: Set<string> = new Set();

export const addOfferHash = (hash: string) => {
    activeOfferHashes.add(hash);
};

export const cancelAllOffers = async (): Promise<void> => {
    try {
        const accountAddress = await wallet.getAddress();

        if (activeOfferHashes.size === 0) {
            console.log('No tracked offers to cancel');
            return;
        }

        console.log(`Attempting to cancel ${activeOfferHashes.size} tracked offers...`);
        console.log('Note: Cancellation may not work on all chains due to SDK limitations.');
        console.log('Offers will auto-expire in 10 minutes if cancellation fails.');

        const hashesToCancel = Array.from(activeOfferHashes);
        let successCount = 0;
        let failCount = 0;

        for (const orderHash of hashesToCancel) {
            try {
                await openseaSDK.cancelOrder({
                    orderHash: orderHash,
                    accountAddress: accountAddress,
                });
                console.log(`✓ Canceled offer: ${orderHash}`);
                activeOfferHashes.delete(orderHash);
                successCount++;
            } catch (err: any) {
                console.error(`✗ Failed to cancel ${orderHash}: ${err?.message || 'SDK error'}`);
                // Remove from tracking even if cancel fails
                activeOfferHashes.delete(orderHash);
                failCount++;
            }
        }

        console.log(`Cancellation complete: ${successCount} succeeded, ${failCount} failed`);
        if (failCount > 0) {
            console.log('Failed offers will expire automatically in 10 minutes.');
            console.log('You can also cancel manually at https://opensea.io/account');
        }
    } catch (error: any) {
        console.error('Error canceling offers:', error?.message || error);
    }
};
