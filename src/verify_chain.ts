import { openseaSDK } from './opensea';
import { config } from './config';

console.log(`Configured Chain: ${config.chain}`);
console.log(`SDK Chain: ${openseaSDK.chain}`);

if (openseaSDK.chain === config.chain) {
    console.log('PASS: SDK chain matches config.');
} else {
    console.error('FAIL: SDK chain does not match config.');
}
