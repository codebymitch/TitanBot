import 'dotenv/config';
import { startBot } from './handlers/bootstrap.js';

startBot().catch((error) => {
  console.error('Bot startup failed:', error?.message || error);
  process.exitCode = 1;
});
