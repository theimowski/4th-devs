import fs from 'node:fs';
import { hubApi } from '../utils/utils.js';

async function main() {
    try {
        const response = await hubApi('zmail', { action: 'help', page: 1 });
        const body = await response.text();
        fs.writeFileSync('help-1', body);
        console.log('Saved response to help-1');
    } catch (error) {
        console.error('Error:', error);
    }
}

main();
