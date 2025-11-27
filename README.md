# OpenSea Bot

An automated OpenSea trading bot with volume trading, sniping, and offer placement features.

## Features

- **Volume Trading**: Automatically buy floor NFTs and list them at a markup
- **Sniper Buy**: Purchase underpriced listings
- **Auto Offers**: Place competitive collection offers
- **Harvest Listing**: Auto-list owned NFTs below floor
- **Dashboard**: Real-time monitoring at `http://localhost:3000`
- **Trade Tracking**: Persistent storage of volume trades

## Prerequisites

- Node.js 18+ and npm
- An Ethereum/Base wallet with private key
- OpenSea API key (optional, for enhanced features)

## Installation on VPS

### 1. Clone the Repository

```bash
git clone https://github.com/July-Jio/OS_bider.git
cd OS_bider
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment

Create a `.env` file in the project root:

```bash
cp .env.example .env
nano .env
```

Add your configuration:

```env
PRIVATE_KEY=your_wallet_private_key_here
OPENSEA_API_KEY=your_opensea_api_key_here
CHAIN=base
COLLECTION_SLUG=your-collection-slug
```

**Important**: Never commit your `.env` file to git!

### 4. Build the Project

```bash
npm run build
```

### 5. Run the Bot

#### Development Mode (with auto-restart):
```bash
npm start
```

#### Production Mode (with PM2):

Install PM2 globally:
```bash
npm install -g pm2
```

Start the bot:
```bash
pm2 start dist/index.js --name opensea-bot
```

View logs:
```bash
pm2 logs opensea-bot
```

Stop the bot:
```bash
pm2 stop opensea-bot
```

Restart the bot:
```bash
pm2 restart opensea-bot
```

Auto-start on system reboot:
```bash
pm2 startup
pm2 save
```

## Dashboard Access

The dashboard runs on port 3000. To access it from your local machine:

### SSH Tunnel Method:
```bash
ssh -L 3000:localhost:3000 user@your-vps-ip
```

Then open `http://localhost:3000` in your browser.

### Nginx Reverse Proxy (Production):

Install Nginx:
```bash
sudo apt update
sudo apt install nginx
```

Create Nginx config:
```bash
sudo nano /etc/nginx/sites-available/opensea-bot
```

Add:
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable the site:
```bash
sudo ln -s /etc/nginx/sites-available/opensea-bot /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

## Configuration

### Strategy Settings

Edit `src/index.ts` to adjust:

```typescript
const STRATEGY_CONFIG = {
    maxOfferPercentageOfFloor: 0.92,  // Max offer = 92% of floor
    bidIncrement: 0.0001,              // Minimum bid increment
    undercutAmount: 0.005,             // Undercut floor by this amount
    offerDurationMinutes: 10,          // Offer validity period
    sniperBuyThreshold: 0.7,           // Buy if price < 70% of floor
    harvestUndercutAmount: 0.001,      // Harvest listing undercut
};
```

### Volume Trading Settings

- **Max Wallet Items**: 4 (configurable in `src/volume.ts`)
- **Listing Price**: `floor * 1.02`
- **Listing Duration**: 10 minutes
- **Purchase Cooldown**: 30 seconds between purchases

## Feature Toggles

Control features via the dashboard or `src/dashboard.ts`:

- **Place Offers**: Enabled by default
- **Harvest Listing**: Disabled by default
- **Sniper Buy**: Enabled by default
- **Volume Trading**: Enabled by default

## Troubleshooting

### Bot won't start
- Check `.env` file exists and has correct values
- Verify Node.js version: `node --version` (should be 18+)
- Check logs: `pm2 logs opensea-bot`

### "Cannot find module" errors
- Run `npm install` again
- Delete `node_modules` and `package-lock.json`, then `npm install`

### Listing errors
- Ensure wallet has enough ETH/HYPE for gas
- Check if items are already listed
- Verify OpenSea API is accessible

### Dashboard not accessible
- Check if port 3000 is open: `sudo ufw allow 3000`
- Verify bot is running: `pm2 status`
- Check firewall rules on your VPS

## Security Notes

1. **Never share your `.env` file** - it contains your private key
2. **Use a dedicated wallet** for the bot with limited funds
3. **Monitor the bot regularly** via dashboard and logs
4. **Keep dependencies updated**: `npm audit fix`

## Updating the Bot

```bash
git pull origin main
npm install
npm run build
pm2 restart opensea-bot
```

## Support

For issues or questions, check the logs:
```bash
pm2 logs opensea-bot --lines 100
```

## License

MIT
