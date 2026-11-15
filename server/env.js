// Load a local .env file when one exists. Node 22 has this built in, so the app
// stays dependency-free; hosting providers can still inject real env vars.
import { existsSync } from 'node:fs';
import path from 'node:path';

const file = path.resolve(process.cwd(), '.env');
if (existsSync(file) && typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile(file);
  } catch (err) {
    console.warn(`[env] could not read .env: ${err.message}`);
  }
}
