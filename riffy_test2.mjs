import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { Riffy } = require('riffy');

const nodes = [
  { host: 'lava-v4.millohost.my.id', port: 443, password: 'https://discord.gg/mjS5J2K3ep', secure: true, name: 'MilloHost' },
];

const fakeClient = {
  user: { id: '123456789' },
  guilds: { cache: new Map() },
  ws: { shards: new Map([[0, { send() {} }]]) },
  on() {},
};

const riffy = new Riffy(fakeClient, nodes, {
  send() {},
  defaultSearchPlatform: 'ytmsearch',
  restVersion: 'v4',
  // NO bypassChecks
});

riffy.on('nodeConnect', (node) => console.log(`CONNECTED: ${node.name}`));
riffy.on('nodeError', (node, err) => console.log(`ERROR ${node.name}: ${err?.message || err}`));
riffy.on('nodeDisconnect', (node) => console.log(`DISCONNECT: ${node.name}`));
riffy.on('nodeReconnect', (node) => console.log(`RECONNECT: ${node.name}`));

riffy.init('123456789');

setTimeout(() => {
  for (const node of riffy.nodeMap.values()) {
    console.log(`${node.name}: connected=${node.connected}`);
  }
  process.exit(0);
}, 8000);
