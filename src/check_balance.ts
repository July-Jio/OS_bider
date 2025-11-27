import { ethers } from 'ethers';
import { config, getWallet } from './config';
import { getWethAddress } from './constants';

const main = async () => {
    console.log('--- Checking Wallet Balance ---');
    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    const wallet = getWallet(provider);
    const address = await wallet.getAddress();
    console.log(`Wallet Address: ${address}`);

    // Check Native Balance (ETH/HYPE)
    const nativeBalance = await provider.getBalance(address);
    console.log(`Native Balance: ${ethers.formatEther(nativeBalance)} ETH/HYPE`);

    // Check Wrapped Balance (WETH/WHYPE)
    const wethAddress = getWethAddress(config.chain);
    console.log(`Checking Wrapped Token at: ${wethAddress}`);

    const abi = [
        "function balanceOf(address owner) view returns (uint256)",
        "function symbol() view returns (string)"
    ];
    const contract = new ethers.Contract(wethAddress, abi, provider);

    try {
        const symbol = await contract.symbol();
        const balance = await contract.balanceOf(address);
        console.log(`${symbol} Balance: ${ethers.formatEther(balance)}`);

        if (balance.toString() === '0') {
            console.warn(`WARNING: You have 0 ${symbol}. You need to wrap your native token to create offers.`);
        }
    } catch (error) {
        console.error('Failed to fetch token balance:', error);
    }
};

main();
