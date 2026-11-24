import { routeInteraction } from '../handlers/interactionRouter.js';

export default {
  name: 'interactionCreate',
  async execute(interaction, client) {
    await routeInteraction(interaction, client);
  },
};
