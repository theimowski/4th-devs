import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchHubFile } from '../utils/utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const filePath = path.join(__dirname, 'failure.log');

if (!fs.existsSync(filePath)) {
  console.log('Downloading failure.log...');
  await fetchHubFile('failure.log', __dirname);
}
