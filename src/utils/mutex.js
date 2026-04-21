/**
 * Simple mutex implementation to prevent race conditions
 */
const locks = new Map();

export const Mutex = {
    /**
     * Executes a task exclusively for a given key.
     * @param {string} key - Unique resource identifier
     * @param {Function} task - Async function to run
     */
    async runExclusive(key, task) {
        // Wait for existing lock if it exists
        const currentLock = locks.get(key) || Promise.resolve();
        
        const nextLock = (async () => {
            try {
                await currentLock;
            } catch (error) {
                // Ignore previous task errors
            }
            return await task();
        })();

        // Store next lock in map
        locks.set(key, nextLock);

        // Cleanup after completion only if this is the latest lock
        const cleanup = () => {
            if (locks.get(key) === nextLock) {
                locks.delete(key);
            }
        };
        
        nextLock.then(cleanup, cleanup);

        return nextLock;
    }
};
