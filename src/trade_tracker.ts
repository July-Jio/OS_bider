import fs from 'fs';
import path from 'path';

const TRADES_FILE = path.join(process.cwd(), 'trades.json');

export interface VolumeTrade {
    tokenAddress: string;
    tokenId: string;
    buyPrice: number;
    purchaseTime: number;
    collectionSlug: string;
}

let trades: VolumeTrade[] = [];

// Load trades from file
export const loadTrades = (): void => {
    try {
        if (fs.existsSync(TRADES_FILE)) {
            const data = fs.readFileSync(TRADES_FILE, 'utf8');
            trades = JSON.parse(data);
            console.log(`Loaded ${trades.length} tracked volume trades.`);
        }
    } catch (error) {
        console.error('Error loading trades:', error);
        trades = [];
    }
};

// Save trades to file
const saveTrades = (): void => {
    try {
        fs.writeFileSync(TRADES_FILE, JSON.stringify(trades, null, 2));
    } catch (error) {
        console.error('Error saving trades:', error);
    }
};

// Track a new volume trade
export const trackVolumeTrade = (
    tokenAddress: string,
    tokenId: string,
    buyPrice: number,
    collectionSlug: string
): void => {
    // Check if already exists, update if so
    const existingIndex = trades.findIndex(
        t => t.tokenAddress.toLowerCase() === tokenAddress.toLowerCase() && t.tokenId === tokenId
    );

    const newTrade: VolumeTrade = {
        tokenAddress,
        tokenId,
        buyPrice,
        purchaseTime: Date.now(),
        collectionSlug
    };

    if (existingIndex >= 0) {
        trades[existingIndex] = newTrade;
    } else {
        trades.push(newTrade);
    }

    saveTrades();
    console.log(`Tracked volume trade: ${tokenId} bought at ${buyPrice}`);
};

// Get trade details for an item
export const getVolumeTrade = (tokenAddress: string, tokenId: string): VolumeTrade | undefined => {
    return trades.find(
        t => t.tokenAddress.toLowerCase() === tokenAddress.toLowerCase() && t.tokenId === tokenId
    );
};

// Get all tracked trades
export const getAllTrades = (): VolumeTrade[] => {
    return [...trades].reverse(); // Return copy, newest first
};

// Remove a trade (e.g. after it's sold - optional, maybe we keep history for now)
export const removeVolumeTrade = (tokenAddress: string, tokenId: string): void => {
    const initialLength = trades.length;
    trades = trades.filter(
        t => !(t.tokenAddress.toLowerCase() === tokenAddress.toLowerCase() && t.tokenId === tokenId)
    );

    if (trades.length !== initialLength) {
        saveTrades();
    }
};

// Initialize on load
loadTrades();
