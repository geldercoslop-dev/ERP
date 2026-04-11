import 'dotenv/config';


/**
** STRICT 128-char minimum validation - NO BYPASSES
**/
const secretKeys = ['APP_SECRET', 'JWT_SECRET', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'];
const errors: string[] = [];

secretKeys.forEach(k => {
  const v = process.env[k];
  const len = (v || '').length;
  
  if (!v) {
    errors.push(`${k} NOT SET`);
  } else if (len < 128) {
    errors.push(`${k} = ${len} chars (REQUIRED: >= 128)`);
  }
});

if (errors.length > 0) {
  console.error('[ENV_FATAL] Secret validation FAILED:');
  errors.forEach(err => console.error(`  ✗ ${err}`));
  console.error('[ENV_FATAL] Exiting with code 1');
  process.exit(1);
}

console.log('✓ All secrets validated: >= 128 chars');
secretKeys.forEach(k => {
  const len = (process.env[k] || '').length;
  if (len > 0) console.log(`  ✓ ${k}: ${len} chars`);
});
