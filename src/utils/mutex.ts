// mutex.js

const locks = new Map<string, Promise<unknown>>();

export const Mutex = {
    
    async runExclusive<T>(key: string, task: () => T | Promise<T>): Promise<T> {
        
        const currentLock = locks.get(key) || Promise.resolve();
        
        const nextLock = (async () => {
            try {
                await currentLock;
            } catch (error) {
                
            }
            return await task();
        })();

        locks.set(key, nextLock);

        const cleanup = () => {
            if (locks.get(key) === nextLock) {
                locks.delete(key);
            }
        };
        
        nextLock.then(cleanup, cleanup);

        return nextLock;
    }
};