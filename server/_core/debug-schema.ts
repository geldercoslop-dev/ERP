/**
 * Debug da estrutura do schema Drizzle
 */

import * as schema from "../../drizzle/schema.js";

console.log('=== DEBUG SCHEMA STRUCTURE ===\n');
console.log('Schema keys:', Object.keys(schema));
console.log('\nSchema keys count:', Object.keys(schema).length);

for (const key of Object.keys(schema)) {
  const value = (schema as Record<string, unknown>)[key];
  console.log(`\n${key}:`);
  console.log('  Type:', typeof value);
  console.log('  Is object:', typeof value === 'object');
  console.log('  Keys:', value && typeof value === 'object' ? Object.keys(value).slice(0, 5) : 'N/A');
  
  if (value && typeof value === 'object') {
    console.log('  Has _columns:', '_columns' in value);
    console.log('  Has _:', '_' in value);
    console.log('  Has $:', '$' in value);
  }
}
