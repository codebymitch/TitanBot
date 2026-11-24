import { registerCommands } from '../handlers/registerCommands.js';
import { getEnv } from '../config/env.js';

export default {
  name: 'ready',
  once: true,
  async execute(client) {
    console.log(`Logged in as ${client.user.tag}.`);
    try {
      await registerCommands(client, getEnv());
    } catch (error) {
      console.error('Failed to register slash commands:', error?.message || error);
    }
  },
};
