// memoryStorage.js

import { logger } from './logger.js';
import type { KeyValueStore } from './database/wrapper.js';

class MemoryStorage implements KeyValueStore {
    data: Map<string, unknown>;
    expirationTimes: Map<string, number>;

    constructor() {
        this.data = new Map();
        this.expirationTimes = new Map();
    }

    get<T = unknown>(key: string, defaultValue?: null): Promise<T | null>;
    get<T>(key: string, defaultValue: T): Promise<T>;
    get<T>(key: string, defaultValue?: T | null): Promise<T | null>;
    async get(key: string, defaultValue: unknown = null): Promise<unknown> {
        const value = this.data.get(key);
        
        if (this.expirationTimes.has(key)) {
            const expirationTime = this.expirationTimes.get(key)!;
            if (Date.now() > expirationTime) {
                this.data.delete(key);
                this.expirationTimes.delete(key);
                return defaultValue;
            }
        }
        
        return value !== undefined ? value : defaultValue;
    }

    async set(key: string, value: unknown, ttl: number | null = null): Promise<boolean> {
        this.data.set(key, value);
        
        if (ttl && ttl > 0) {
            this.expirationTimes.set(key, Date.now() + (ttl * 1000));
        }
        
        return true;
    }

    async delete(key: string): Promise<boolean> {
        this.data.delete(key);
        this.expirationTimes.delete(key);
        return true;
    }

    async list(prefix: string): Promise<string[]> {
        const keys: string[] = [];
        for (const key of this.data.keys()) {
            if (key.startsWith(prefix)) {
                if (this.expirationTimes.has(key)) {
                    const expirationTime = this.expirationTimes.get(key)!;
                    if (Date.now() > expirationTime) {
                        this.data.delete(key);
                        this.expirationTimes.delete(key);
                        continue;
                    }
                }
                keys.push(key);
            }
        }
        return keys;
    }

    async exists(key: string): Promise<boolean> {
        const value = this.data.get(key);
        
        if (this.expirationTimes.has(key)) {
            const expirationTime = this.expirationTimes.get(key)!;
            if (Date.now() > expirationTime) {
                this.data.delete(key);
                this.expirationTimes.delete(key);
                return false;
            }
        }
        
        return value !== undefined;
    }

    async increment(key: string, amount = 1): Promise<number> {
        const current = await this.get(key, 0);
        const newValue = current + amount;
        await this.set(key, newValue);
        return newValue;
    }

    async decrement(key: string, amount = 1): Promise<number> {
        const current = await this.get(key, 0);
        const newValue = current - amount;
        await this.set(key, newValue);
        return newValue;
    }

    async clear(): Promise<boolean> {
        this.data.clear();
        this.expirationTimes.clear();
        return true;
    }
}

export { MemoryStorage };