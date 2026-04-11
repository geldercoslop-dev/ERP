import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, '.env');

console.log('Loading from:', envPath);
const result = dotenv.config({ path: envPath, override: false });

if (result.error) {
  console.error('Error loading .env:', result.error);
} else {
  console.log('Parsed keys:', Object.keys(result.parsed || {}).length);
  console.log('APP_SECRET length:', (result.parsed?.APP_SECRET || '').length);
  console.log('JWT_ACCESS_SECRET length:', (result.parsed?.JWT_ACCESS_SECRET || '').length);
  console.log('JWT_REFRESH_SECRET length:', (result.parsed?.JWT_REFRESH_SECRET || '').length);
  
  console.log('\nprocess.env check:');
  console.log('process.env.APP_SECRET length:', (process.env.APP_SECRET || '').length);
  console.log('process.env.JWT_ACCESS_SECRET length:', (process.env.JWT_ACCESS_SECRET || '').length);
  console.log('process.env.JWT_REFRESH_SECRET length:', (process.env.JWT_REFRESH_SECRET || '').length);
}
