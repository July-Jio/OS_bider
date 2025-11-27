import { calculateOfferPrice, calculateListingPrice, StrategyConfig } from './strategy';

const runTests = () => {
    console.log('Running Strategy Verification...');

    const config: StrategyConfig = {
        maxOfferPercentageOfFloor: 0.8,
        bidIncrement: 0.001,
        undercutAmount: 0.001,
        offerDurationMinutes: 10,
        sniperBuyThreshold: 0.7,
        harvestUndercutAmount: 0.001,
        useSecondBestStrategy: false,
    };

    const floorPrice = 1.0;

    // Test 1: Normal bidding
    const bestOffer1 = 0.5;
    const target1 = calculateOfferPrice(bestOffer1, 0, floorPrice, config);
    console.log(`Test 1 (Normal): BestOffer=${bestOffer1}, Floor=${floorPrice} -> Target=${target1}`);
    if (target1 !== 0.501) console.error('FAIL: Expected 0.501');
    else console.log('PASS');

    // Test 2: Bidding cap
    const bestOffer2 = 0.9; // Above max allowed (0.8)
    const target2 = calculateOfferPrice(bestOffer2, 0, floorPrice, config);
    console.log(`Test 2 (Cap): BestOffer=${bestOffer2}, Floor=${floorPrice} -> Target=${target2}`);
    if (target2 !== null) console.error('FAIL: Expected null (skip bid)');
    else console.log('PASS');

    // Test 3: Listing price
    const listPrice = calculateListingPrice(floorPrice, config);
    console.log(`Test 3 (Listing): Floor=${floorPrice} -> ListPrice=${listPrice}`);
    if (listPrice !== 0.999) console.error('FAIL: Expected 0.999');
    else console.log('PASS');
};

runTests();
