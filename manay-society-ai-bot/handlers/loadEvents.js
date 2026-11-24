import { readdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';

export async function loadEvents(client) {
  const directory = fileURLToPath(new URL('../events/', import.meta.url));
  const files = (await readdir(directory)).filter((file) => file.endsWith('.js'));

  for (const file of files) {
    const moduleUrl = pathToFileURL(join(directory, file));
    const event = (await import(moduleUrl.href)).default;
    if (!event?.name || typeof event.execute !== 'function') {
      throw new Error(`Event ${file} must export name and execute().`);
    }
    const listener = (...args) => {
      Promise.resolve(event.execute(...args, client)).catch((error) => {
        console.error(`Event ${event.name} failed:`, error?.message || error);
      });
    };
    if (event.once) client.once(event.name, listener);
    else client.on(event.name, listener);
  }
}
