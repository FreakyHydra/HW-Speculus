import { createApp } from './app.js';

const port = Number(process.env.PORT || 8790);
const server = createApp({ production: process.env.NODE_ENV === 'production' }).listen(port, '127.0.0.1', () => {
  console.log(`Speculus API listening on ${port}`);
});

const shutdown = () => server.close(() => process.exit(0));
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
