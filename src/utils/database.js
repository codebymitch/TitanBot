// database.js — facade re-exporting split modules for backward compatibility

export {
    db,
    initializeDatabase,
    getFromDb,
    setInDb,
    deleteFromDb,
} from './database/wrapper.js';

export { pgDb } from './postgresDatabase.js';
