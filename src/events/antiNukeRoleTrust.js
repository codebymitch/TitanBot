import { Events } from 'discord.js';

// Trust commands are handled by 00_antiNukeOwnerGuard.js. This file remains as
// a compatibility event for deployments that still reference it, but it must
// not process MessageCreate a second time.
export default {
  name: Events.MessageCreate,
  once: false,
  async execute() {},
};
