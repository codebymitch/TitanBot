import { robloxJoinRequestButton } from '../../handlers/robloxButtons.js';

export default [
  {
    name: 'roblox_request',
    execute: robloxJoinRequestButton.execute.bind(robloxJoinRequestButton),
    customId: robloxJoinRequestButton.customId
  }
];

