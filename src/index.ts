import { serve } from '@hono/node-server';
import { createApp } from './app.js';

const app = createApp();
const port = parseInt(process.env.PORT ?? '5000', 10);

console.log(`Starting ledger server on port ${port}...`);

serve({
  fetch: app.fetch,
  port,
});

console.log(`Ledger server running at http://localhost:${port}`);
