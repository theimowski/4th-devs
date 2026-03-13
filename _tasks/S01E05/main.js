import fs from 'node:fs';
import path from 'node:path';
import { verify } from '../utils/utils.js';

if (typeof process.loadEnvFile === 'function') {
  try { process.loadEnvFile(path.join(import.meta.dirname, '../../.env')); } catch {}
}

const response = await verify('railway', { "action": "help" });

console.log(response.status);

const headers = {};
response.headers.forEach((value, key) => {
  headers[key] = value;
});
fs.writeFileSync(path.join(import.meta.dirname, 'help-headers'), JSON.stringify(headers, null, 2));

const body = await response.text();
fs.writeFileSync(path.join(import.meta.dirname, 'help.json'), body);
