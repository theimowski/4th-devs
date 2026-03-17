import fs from 'node:fs';
import path from 'node:path';
import { fetchHubFile } from '../utils/utils.js';

const filePath = path.join(import.meta.dirname, 'electricity.png');
if (!fs.existsSync(filePath)) {
    await fetchHubFile('electricity.png', import.meta.dirname);
}
