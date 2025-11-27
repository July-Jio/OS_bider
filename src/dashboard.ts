import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import { getAllTrades } from './trade_tracker';

const app = express();
const PORT = 3000;

// Parse JSON bodies
app.use(express.json());

// Serve static files
app.use(express.static('public'));

// Bot control endpoints
let botShouldStop = false;
let cancelOffersFlag = false;

// Feature toggles
let ENABLE_PLACE_OFFERS = true;
let ENABLE_HARVEST_LISTING = false; // Disabled by default
let ENABLE_SNIPER = true;
let ENABLE_VOLUME_TRADING = true; // Enable by default

app.post('/api/stop', (req, res) => {
    botShouldStop = true;
    res.json({ success: true, message: 'Bot stopping...' });
});

app.post('/api/cancel-offers', async (req, res) => {
    try {
        cancelOffersFlag = true;
        res.json({ success: true, message: 'Canceling all offers...' });
        broadcastUpdate({ type: 'log', message: 'Cancel request received', level: 'info' });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed to cancel offers' });
    }
});

app.post('/api/toggle-offers', (req, res) => {
    const { enabled } = req.body;
    res.json({ success: true, enabled, message: `Place offers ${enabled ? 'enabled' : 'disabled'}` });
    broadcastUpdate({ type: 'toggle-offers', enabled });
});

app.post('/api/toggle-harvest', (req, res) => {
    const { enabled } = req.body;
    res.json({ success: true, enabled, message: `Harvest listing ${enabled ? 'enabled' : 'disabled'}` });
    broadcastUpdate({ type: 'toggle-harvest', enabled });
});

app.post('/api/toggle-sniper', (req, res) => {
    const { enabled } = req.body;
    res.json({ success: true, enabled, message: `Sniper ${enabled ? 'enabled' : 'disabled'}` });
    broadcastUpdate({ type: 'toggle-sniper', enabled });
});

app.post('/api/toggle-volume', (req, res) => {
    const { enabled } = req.body;
    res.json({ success: true, enabled, message: `Volume Trading ${enabled ? 'enabled' : 'disabled'}` });
    broadcastUpdate({ type: 'toggle-volume', enabled });
});

app.get('/api/trades', (req, res) => {
    try {
        const trades = getAllTrades();
        res.json({ success: true, trades });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed to fetch trades' });
    }
});

// Start HTTP server
const server = app.listen(PORT, () => {
    console.log(`📊 Dashboard available at http://localhost:${PORT}`);
});

// WebSocket server for real-time updates
const wss = new WebSocketServer({ server });

let clients: Set<WebSocket> = new Set();

wss.on('connection', (ws) => {
    clients.add(ws);
    console.log('Dashboard client connected');

    ws.on('close', () => {
        clients.delete(ws);
        console.log('Dashboard client disconnected');
    });
});

// Broadcast function to send updates to all connected clients
export const broadcastUpdate = (data: any) => {
    const message = JSON.stringify(data);
    clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
};

export const shouldBotStop = () => botShouldStop;
export const shouldCancelOffers = () => {
    if (cancelOffersFlag) {
        cancelOffersFlag = false; // Reset flag
        return true;
    }
    return false;
};

// Export toggle getters for main loop
export const isOffersEnabled = () => ENABLE_PLACE_OFFERS;
export const isHarvestEnabled = () => ENABLE_HARVEST_LISTING;
export const isSniperEnabled = () => ENABLE_SNIPER;
export const isVolumeTradingEnabled = () => ENABLE_VOLUME_TRADING;

// Export toggle setters for API endpoints
const setEnableOffers = (enabled: boolean) => { ENABLE_PLACE_OFFERS = enabled; };
const setEnableHarvest = (enabled: boolean) => { ENABLE_HARVEST_LISTING = enabled; };
const setEnableSniper = (enabled: boolean) => { ENABLE_SNIPER = enabled; };
const setEnableVolume = (enabled: boolean) => { ENABLE_VOLUME_TRADING = enabled; };

// Handle toggle updates from WebSocket
wss.on('connection', (ws) => {
    clients.add(ws);
    console.log('Dashboard client connected');

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message.toString());
            if (data.type === 'toggle-offers') setEnableOffers(data.enabled);
            if (data.type === 'toggle-harvest') setEnableHarvest(data.enabled);
            if (data.type === 'toggle-sniper') setEnableSniper(data.enabled);
            if (data.type === 'toggle-volume') setEnableVolume(data.enabled);
        } catch (err) {
            // Ignore invalid messages
        }
    });

    ws.on('close', () => {
        clients.delete(ws);
        console.log('Dashboard client disconnected');
    });
});

export { server };
