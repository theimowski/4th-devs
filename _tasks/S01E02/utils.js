import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import config from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function fetchHubFile(filename) {
  const filePath = path.join(__dirname, filename);
  
  if (fs.existsSync(filePath)) {
    console.log(`File ${filename} already exists. Skipping download.`);
    return fs.readFileSync(filePath, 'utf-8');
  }

  const url = `${config.HUB_URL}/${config.API_KEY}/${filename}`;
  console.log(`Downloading ${filename} from ${url}...`);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${filename}: ${response.status} ${response.statusText}`);
  }

  const text = await response.text();
  fs.writeFileSync(filePath, text);
  console.log(`File ${filename} downloaded successfully.`);
  return text;
}
