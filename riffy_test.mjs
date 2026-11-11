import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { Riffy } = require('riffy');

const nodes = [
  { host: 'lavalinkv4.serenetia.com', port: 443, password: 'https://seretia.link/discord', secure: true, name: 'Serenetia' },
  { host: 'lavalink.jirayu.net', port: 443, password: 'youshallnotpass', secure: true, name: 'Jirayu' },
  { host: 'lava-v4.millohost.my.id', port: 443, password: 'https://discord.gg/mjS5J2K3ep', secure: true, name: 'MilloHost' },
  { host: 'lavalink-v4.triniumhost.com', port: 443, password: 'free', secure: true, name: 'TriniumHost' },
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
  bypassChecks: { nodeFetchInfo: true },
});

let connected = 0;
riffy.on('nodeConnect', (node) => { console.log(`CONNECTED: ${node.name}`); connected++; });
riffy.on('nodeError', (node, err) => console.log(`ERROR ${node.name}: ${err?.message || err}`));
riffy.on('nodeDisconnect', (node) => console.log(`DISCONNECT: ${node.name}`));

riffy.init('123456789');

setTimeout(() => {
  console.log(`\n=== After 10s: ${connected} node(s) connected ===`);
  for (const node of riffy.nodeMap.values()) {
    console.log(`  ${node.name}: connected=${node.connected}`);
  }
  process.exit(0);
}, 10000);
