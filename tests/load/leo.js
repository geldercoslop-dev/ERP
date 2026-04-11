import http from 'k6/http';
import { check, sleep } from 'k6';

const tokenFile = (__ENV.TOKEN_FILE || './access_token.txt').trim();
const token = (__ENV.ACCESS_TOKEN || open(tokenFile)).trim();
const baseUrl = (__ENV.BASE_URL || 'http://localhost:3001').trim();

const appSecret = (__ENV.APP_SECRET || '2231c2109b94474a3776c48ec2a32501f1b9b1e376834b27306183b7a0270cfaf39f4e1c4906254614131947fa2a79103e2c96bfa2304a091e7f61abd0dd8d95').trim();
export const options = {
  vus: 100,
  duration: '1m',
};

export default function () {
  // tRPC endpoint: /api/trpc/leo.status (publicProcedure)
  // The real endpoint is /api/trpc/leo.*, NOT /api/leo/action (which doesn't exist)
  const res = http.get(
    `${baseUrl}/api/trpc/leo.status`,
    {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'k6-load-test/1.0',
        'x-app-secret': appSecret, // Required by middleware
      },
    }
  );

  check(res, {
    'status 200': (r) => r.status === 200,
    'has result or error': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.result !== undefined || body.error !== undefined;
      } catch {
        return false;
      }
    }
  });

  sleep(0.1);
}
