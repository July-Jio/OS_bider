import { ethers } from 'ethers';
import { config } from './config';
import { getWethAddress } from './constants';

const main = async () => {
    console.log('--- Debugging Chain Connection ---');
    console.log(`Configured Chain: ${config.chain}`);
    console.log(`RPC URL: ${config.rpcUrl}`);

    const provider = new ethers.JsonRpcProvider(config.rpcUrl);

    try {
        const network = await provider.getNetwork();
        console.log(`Connected to Network: ${network.name} (Chain ID: ${network.chainId})`);
    } catch (error) {
        console.error('Failed to connect to RPC:', error);
        return;
    }

    const wethAddress = getWethAddress(config.chain);
    console.log(`Target WETH/WHYPE Address: ${wethAddress}`);

    try {
        const code = await provider.getCode(wethAddress);
        if (code === '0x') {
            console.error('ERROR: No contract code found at this address!');
        } else {
            console.log('Contract code exists at address.');

            // Try to call name() and symbol()
            const abi = [
                "function name() view returns (string)",
                "function symbol() view returns (string)",
                "function decimals() view returns (uint8)"
            ];
            const contract = new ethers.Contract(wethAddress, abi, provider);

            try {
                const name = await contract.name();
                console.log(`Token Name: ${name}`);
                const symbol = await contract.symbol();
                console.log(`Token Symbol: ${symbol}`);
            } catch (err) {
                console.error('Failed to call token methods:', err);
            }
        }
    } catch (error) {
        console.error('Error checking contract:', error);
    }
};

main();
