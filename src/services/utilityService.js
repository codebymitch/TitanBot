/**
 * UTILITY SERVICE
 * 
 * Centralized business logic for utility commands (reports, data wiping, todos)
 * Provides validation, duplicate detection, and comprehensive auditing
 * 
 * Features:
 * - Report validation and duplicate detection
 * - Data wiping with safety checks and confirmation
 * - Complete audit trail for data deletions
 * - Todo task management and persistence
 * - Shared todo list collaboration
 * - Rate limiting for sensitive operations
 * - Data recovery prevention
 * 
 * Usage:
 * import UtilityService from '../../services/utilityService.js';
 * const result = await UtilityService.submitReport(client, guildId, userId, reportData);
 */

import { logger } from '../utils/logger.js';
import { getFromDb, setInDb, deleteFromDb } from '../utils/database.js';
import { createError, ErrorTypes } from '../utils/errorHandler.js';

// Report tracking for duplicate detection
const recentReports = new Map();
const REPORT_DUPLICATE_WINDOW = 60 * 60 * 1000; // 1 hour
const REPORT_USER_COOLDOWN = 10 * 60 * 1000; // 10 minutes per user

// Data wipe tracking
const wipedataRequests = new Map();
const WIPEDATA_COOLDOWN = 24 * 60 * 60 * 1000; // 24 hours between wipes

// Todo task limits and configurations
const TODO_MAX_TASKS = 100;
const TODO_MAX_LENGTH = 500;
const SHARED_TODO_MAX_MEMBERS = 20;

class UtilityService {

    // ========== REPORT SYSTEM ==========

    /**
     * Validate report data
     * @param {string} reportedUserId - ID of user being reported
     * @param {string} reportingUserId - ID of user making report
     * @param {string} reason - Report reason
     * @returns {Promise<boolean>}
     */
    static async validateReport(reportedUserId, reportingUserId, reason) {
        logger.debug(`[UTILITY_SERVICE] Validating report`, {
            reportedUserId,
            reportingUserId
        });

        // Validate users are not the same
        if (reportedUserId === reportingUserId) {
            throw createError(
                'Cannot report self',
                ErrorTypes.VALIDATION,
                'You cannot report yourself.',
                { reportedUserId, reportingUserId }
            );
        }

        // Validate reason
        if (!reason || typeof reason !== 'string') {
            throw createError(
                'Invalid reason',
                ErrorTypes.VALIDATION,
                'Report reason must be a non-empty string.',
                { provided: typeof reason }
            );
        }

        const trimmedReason = reason.trim();
        if (trimmedReason.length === 0) {
            throw createError(
                'Empty reason',
                ErrorTypes.VALIDATION,
                'Please provide a detailed reason for your report.',
                { length: trimmedReason.length }
            );
        }

        if (trimmedReason.length < 10) {
            throw createError(
                'Reason too short',
                ErrorTypes.VALIDATION,
                'Please be more detailed. Reason must be at least **10 characters**.',
                { length: trimmedReason.length }
            );
        }

        if (trimmedReason.length > 500) {
            throw createError(
                'Reason too long',
                ErrorTypes.VALIDATION,
                'Report reason cannot exceed **500 characters**.',
                { length: trimmedReason.length }
            );
        }

        return true;
    }

    /**
     * Check for duplicate reports
     * @param {string} guildId - Guild ID
     * @param {string} reportedUserId - ID of reported user
     * @param {string} reportingUserId - ID of reporting user
     * @returns {Promise<Object>} Duplicate check result
     */
    static async checkForDuplicateReport(guildId, reportedUserId, reportingUserId) {
        logger.debug(`[UTILITY_SERVICE] Checking for duplicate reports`, {
            guildId,
            reportedUserId
        });

        const reportsKey = `reports:${guildId}:${reportedUserId}`;
        const recentReportsList = await getFromDb(reportsKey, []);

        const now = Date.now();
        const recentWindow = recentReportsList.filter(
            r => (now - r.timestamp) < REPORT_DUPLICATE_WINDOW
        );

        // Check if same user reported recently
        const userReportCount = recentWindow.filter(
            r => r.reportingUserId === reportingUserId
        ).length;

        if (userReportCount > 0) {
            const lastReport = recentWindow
                .filter(r => r.reportingUserId === reportingUserId)
                .sort((a, b) => b.timestamp - a.timestamp)[0];

            const timeSinceLast = now - lastReport.timestamp;
            const timeRemaining = Math.ceil((REPORT_USER_COOLDOWN - timeSinceLast) / 1000 / 60);

            logger.warn(`[UTILITY_SERVICE] User trying to report twice within cooldown`, {
                guildId,
                reportedUserId,
                reportingUserId,
                timeSinceLast
            });

            throw createError(
                'Report cooldown active',
                ErrorTypes.RATE_LIMIT,
                `You can only report the same user once every **10 minutes**. Please wait **${timeRemaining}** more minutes.`,
                { timeRemaining, cooldown: REPORT_USER_COOLDOWN }
            );
        }

        return {
            isDuplicate: false,
            similarReportCount: recentWindow.length,
            userHasReportedBefore: userReportCount > 0
        };
    }

    /**
     * Submit a report
     * @param {Client} client - Discord client
     * @param {string} guildId - Guild ID
     * @param {string} reportedUserId - ID of reported user
     * @param {string} reportingUserId - ID of reporting user
     * @param {Object} reportData - Report details
     * @returns {Promise<Object>} Report result
     */
    static async submitReport(client, guildId, reportedUserId, reportingUserId, reportData) {
        logger.info(`[UTILITY_SERVICE] Submitting report`, {
            guildId,
            reportedUserId,
            reportingUserId
        });

        // Validate report
        await this.validateReport(reportedUserId, reportingUserId, reportData.reason);

        // Check for duplicates
        await this.checkForDuplicateReport(guildId, reportedUserId, reportingUserId);

        // Create report record
        const reportId = `${guildId}:${reportedUserId}:${Date.now()}`;
        const report = {
            id: reportId,
            guildId,
            reportedUserId,
            reportingUserId,
            reason: reportData.reason,
            channel: reportData.channelId,
            timestamp: new Date().toISOString(),
            status: 'pending',
            reviewed: false
        };

        // Store report in history
        const reportsKey = `reports:${guildId}:${reportedUserId}`;
        const recentReports = await getFromDb(reportsKey, []);
        recentReports.push({
            reportingUserId,
            timestamp: Date.now(),
            id: reportId
        });
        await setInDb(reportsKey, recentReports);

        // Store full report
        await setInDb(`report:${reportId}`, report);

        logger.info(`[UTILITY_SERVICE] Report submitted successfully`, {
            guildId,
            reportedUserId,
            reportingUserId,
            reportId,
            timestamp: report.timestamp
        });

        return {
            success: true,
            reportId,
            reportedUser: reportedUserId,
            timestamp: report.timestamp
        };
    }

    // ========== WIPEDATA SYSTEM ==========

    /**
     * Check if user can wipe data (cooldown)
     * @param {string} guildId - Guild ID
     * @param {string} userId - User ID
     * @returns {Promise<Object>} Cooldown status
     */
    static async checkWipedataCooldown(guildId, userId) {
        logger.debug(`[UTILITY_SERVICE] Checking wipedata cooldown`, {
            guildId,
            userId
        });

        const key = `wipedata:cooldown:${guildId}:${userId}`;
        const lastWipe = await getFromDb(key, null);

        if (!lastWipe) {
            return { canWipe: true, cooldownRemaining: 0 };
        }

        const now = Date.now();
        const timeSinceWipe = now - lastWipe;
        const remaining = WIPEDATA_COOLDOWN - timeSinceWipe;

        if (remaining > 0) {
            logger.warn(`[UTILITY_SERVICE] User on wipedata cooldown`, {
                guildId,
                userId,
                remaining
            });

            return {
                canWipe: false,
                cooldownRemaining: Math.ceil(remaining / 1000),
                canWipeAt: new Date(now + remaining)
            };
        }

        return { canWipe: true, cooldownRemaining: 0 };
    }

    /**
     * Execute data wipe with audit trail
     * @param {Client} client - Discord client
     * @param {string} guildId - Guild ID
     * @param {string} userId - User ID
     * @returns {Promise<Object>} Wipe result
     */
    static async executeDataWipe(client, guildId, userId) {
        logger.warn(`[UTILITY_SERVICE] Executing data wipe`, {
            guildId,
            userId,
            timestamp: new Date().toISOString()
        });

        // Check cooldown
        const cooldown = await this.checkWipedataCooldown(guildId, userId);
        if (!cooldown.canWipe) {
            throw createError(
                'Wipedata cooldown active',
                ErrorTypes.RATE_LIMIT,
                `You can only wipe your data once every **24 hours**. Please wait **${Math.ceil(cooldown.cooldownRemaining / 3600)}** hours.`,
                { ...cooldown }
            );
        }

        // List of all data patterns to delete
        const dataKeyPatterns = [
            `economy:${guildId}:${userId}`,
            `level:${guildId}:${userId}`,
            `xp:${guildId}:${userId}`,
            `inventory:${guildId}:${userId}`,
            `bank:${guildId}:${userId}`,
            `wallet:${guildId}:${userId}`,
            `cooldowns:${guildId}:${userId}`,
            `shop:${guildId}:${userId}`,
            `shop_data:${guildId}:${userId}`,
            `counter:${guildId}:${userId}`,
            `birthday:${guildId}:${userId}`,
            `balance:${guildId}:${userId}`,
            `user:${guildId}:${userId}`,
            `leveling:${guildId}:${userId}`,
            `crimexp:${guildId}:${userId}`,
            `robxp:${guildId}:${userId}`,
            `crime_cooldown:${guildId}:${userId}`,
            `rob_cooldown:${guildId}:${userId}`,
            `lastDaily:${guildId}:${userId}`,
            `lastWork:${guildId}:${userId}`,
            `lastCrime:${guildId}:${userId}`,
            `lastRob:${guildId}:${userId}`
        ];

        let deletedCount = 0;
        const deletedKeys = [];
        const deleteErrors = [];

        // Delete each data key
        for (const key of dataKeyPatterns) {
            try {
                await deleteFromDb(key);
                deletedCount++;
                deletedKeys.push(key);
            } catch (error) {
                logger.error(`[UTILITY_SERVICE] Error deleting key during wipe`, error, { key });
                deleteErrors.push({ key, error: error.message });
            }
        }

        // Try prefix search for additional keys
        try {
            if (client.db?.list && typeof client.db.list === 'function') {
                const userPrefix = `${guildId}:${userId}`;
                const allKeys = await client.db.list(userPrefix);

                if (Array.isArray(allKeys)) {
                    for (const key of allKeys) {
                        if (!dataKeyPatterns.includes(key)) {
                            try {
                                await deleteFromDb(key);
                                deletedCount++;
                                deletedKeys.push(key);
                            } catch (error) {
                                logger.error(`[UTILITY_SERVICE] Error deleting prefix key`, error, { key });
                            }
                        }
                    }
                }
            }
        } catch (error) {
            logger.warn(`[UTILITY_SERVICE] Could not perform prefix search`, error);
        }

        // Record wipe in cooldown system
        const cooldownKey = `wipedata:cooldown:${guildId}:${userId}`;
        await setInDb(cooldownKey, Date.now());

        // Create audit record
        const auditKey = `wipedata:audit:${guildId}:${userId}:${Date.now()}`;
        await setInDb(auditKey, {
            userId,
            guildId,
            timestamp: new Date().toISOString(),
            deletedCount,
            deletedKeys,
            errors: deleteErrors
        });

        logger.warn(`[UTILITY_SERVICE] Data wipe completed`, {
            guildId,
            userId,
            deletedCount,
            errorCount: deleteErrors.length,
            timestamp: new Date().toISOString()
        });

        return {
            success: true,
            deletedCount,
            timestamp: new Date().toISOString(),
            nextWipeAvailable: new Date(Date.now() + WIPEDATA_COOLDOWN)
        };
    }

    // ========== TODO SYSTEM ==========

    /**
     * Add a task to user's todo list
     * @param {string} userId - User ID
     * @param {string} taskContent - Task description
     * @returns {Promise<Object>} Created task
     */
    static async addTodoTask(userId, taskContent) {
        logger.debug(`[UTILITY_SERVICE] Adding todo task`, { userId, taskLength: taskContent?.length });

        if (!taskContent || typeof taskContent !== 'string') {
            throw createError(
                'Invalid task',
                ErrorTypes.VALIDATION,
                'Task must be a non-empty string.',
                { provided: typeof taskContent }
            );
        }

        const trimmed = taskContent.trim();
        if (trimmed.length === 0) {
            throw createError(
                'Empty task',
                ErrorTypes.VALIDATION,
                'Please provide a task description.',
                { length: trimmed.length }
            );
        }

        if (trimmed.length > TODO_MAX_LENGTH) {
            throw createError(
                'Task too long',
                ErrorTypes.VALIDATION,
                `Task cannot exceed **${TODO_MAX_LENGTH}** characters.`,
                { length: trimmed.length, max: TODO_MAX_LENGTH }
            );
        }

        // Get user's todo list
        const todoKey = `todo:${userId}`;
        const todoList = await getFromDb(todoKey, { tasks: [], nextId: 1 });

        // Check max tasks
        if (todoList.tasks?.length >= TODO_MAX_TASKS) {
            throw createError(
                'Too many tasks',
                ErrorTypes.VALIDATION,
                `You cannot have more than **${TODO_MAX_TASKS}** tasks.`,
                { current: todoList.tasks.length, max: TODO_MAX_TASKS }
            );
        }

        // Create task
        const taskId = todoList.nextId || 1;
        const task = {
            id: taskId,
            content: trimmed,
            completed: false,
            createdAt: new Date().toISOString()
        };

        // Add to list
        if (!Array.isArray(todoList.tasks)) {
            todoList.tasks = [];
        }
        todoList.tasks.push(task);
        todoList.nextId = (todoList.nextId || 1) + 1;

        // Save
        await setInDb(todoKey, todoList);

        logger.info(`[UTILITY_SERVICE] Todo task added`, {
            userId,
            taskId,
            taskLength: trimmed.length
        });

        return task;
    }

    /**
     * Complete a todo task
     * @param {string} userId - User ID
     * @param {number} taskId - Task ID
     * @returns {Promise<Object>} Updated task
     */
    static async completeTodoTask(userId, taskId) {
        logger.debug(`[UTILITY_SERVICE] Completing todo task`, { userId, taskId });

        const todoKey = `todo:${userId}`;
        const todoList = await getFromDb(todoKey, { tasks: [] });

        const task = todoList.tasks?.find(t => t.id === taskId);
        if (!task) {
            throw createError(
                'Task not found',
                ErrorTypes.VALIDATION,
                'The task does not exist.',
                { taskId, userId }
            );
        }

        task.completed = true;
        task.completedAt = new Date().toISOString();

        await setInDb(todoKey, todoList);

        logger.info(`[UTILITY_SERVICE] Todo task completed`, {
            userId,
            taskId,
            completedAt: task.completedAt
        });

        return task;
    }

    /**
     * Remove a todo task
     * @param {string} userId - User ID
     * @param {number} taskId - Task ID
     * @returns {Promise<Object>} Result
     */
    static async removeTodoTask(userId, taskId) {
        logger.debug(`[UTILITY_SERVICE] Removing todo task`, { userId, taskId });

        const todoKey = `todo:${userId}`;
        const todoList = await getFromDb(todoKey, { tasks: [] });

        const initialLength = todoList.tasks?.length || 0;
        todoList.tasks = todoList.tasks?.filter(t => t.id !== taskId) || [];

        if (todoList.tasks.length === initialLength) {
            throw createError(
                'Task not found',
                ErrorTypes.VALIDATION,
                'The task does not exist.',
                { taskId, userId }
            );
        }

        await setInDb(todoKey, todoList);

        logger.info(`[UTILITY_SERVICE] Todo task removed`, {
            userId,
            taskId,
            remainingTasks: todoList.tasks.length
        });

        return {
            success: true,
            taskId,
            remainingTasks: todoList.tasks.length
        };
    }

    /**
     * Get user's todo list
     * @param {string} userId - User ID
     * @returns {Promise<Object>} Todo list
     */
    static async getTodoList(userId) {
        logger.debug(`[UTILITY_SERVICE] Fetching todo list`, { userId });

        const todoKey = `todo:${userId}`;
        const todoList = await getFromDb(todoKey, { tasks: [] });

        return {
            userId,
            totalTasks: todoList.tasks?.length || 0,
            completedTasks: todoList.tasks?.filter(t => t.completed).length || 0,
            pendingTasks: todoList.tasks?.filter(t => !t.completed).length || 0,
            tasks: todoList.tasks || []
        };
    }

    /**
     * Create a shared todo list
     * @param {string} userId - Creator user ID
     * @param {string} listName - List name
     * @param {string} listId - Unique list ID
     * @returns {Promise<Object>} Created list
     */
    static async createSharedTodoList(userId, listName, listId) {
        logger.info(`[UTILITY_SERVICE] Creating shared todo list`, {
            userId,
            listName,
            listId
        });

        if (!listName || listName.trim().length === 0) {
            throw createError(
                'Invalid list name',
                ErrorTypes.VALIDATION,
                'List name cannot be empty.',
                { listName }
            );
        }

        const sharedList = {
            id: listId,
            name: listName.trim(),
            creatorId: userId,
            members: [userId],
            tasks: [],
            nextId: 1,
            createdAt: new Date().toISOString()
        };

        const listKey = `shared_todo:${listId}`;
        await setInDb(listKey, sharedList);

        // Add to user's shared lists
        const userListsKey = `user_shared_lists:${userId}`;
        const userLists = await getFromDb(userListsKey, []);
        if (!userLists.includes(listId)) {
            userLists.push(listId);
            await setInDb(userListsKey, userLists);
        }

        logger.info(`[UTILITY_SERVICE] Shared todo list created`, {
            userId,
            listId,
            listName: listName.trim()
        });

        return sharedList;
    }

    /**
     * Add member to shared todo list
     * @param {string} listId - List ID
     * @param {string} memberId - Member user ID
     * @param {string} requestedBy - User who requested adding
     * @returns {Promise<Object>} Result
     */
    static async addMemberToSharedList(listId, memberId, requestedBy) {
        logger.info(`[UTILITY_SERVICE] Adding member to shared list`, {
            listId,
            memberId,
            requestedBy
        });

        const listKey = `shared_todo:${listId}`;
        const list = await getFromDb(listKey, null);

        if (!list) {
            throw createError(
                'List not found',
                ErrorTypes.VALIDATION,
                'The shared list does not exist.',
                { listId }
            );
        }

        // Check if requester is creator
        if (list.creatorId !== requestedBy) {
            throw createError(
                'Permission denied',
                ErrorTypes.VALIDATION,
                'Only the list creator can add members.',
                { listId, creatorId: list.creatorId }
            );
        }

        // Check max members
        if (list.members?.length >= SHARED_TODO_MAX_MEMBERS) {
            throw createError(
                'Too many members',
                ErrorTypes.VALIDATION,
                `Shared lists can have a maximum of **${SHARED_TODO_MAX_MEMBERS}** members.`,
                { current: list.members.length, max: SHARED_TODO_MAX_MEMBERS }
            );
        }

        // Add member
        if (!list.members) list.members = [];
        if (!list.members.includes(memberId)) {
            list.members.push(memberId);
        }

        await setInDb(listKey, list);

        // Add list to member's shared lists
        const memberListsKey = `user_shared_lists:${memberId}`;
        const memberLists = await getFromDb(memberListsKey, []);
        if (!memberLists.includes(listId)) {
            memberLists.push(listId);
            await setInDb(memberListsKey, memberLists);
        }

        logger.info(`[UTILITY_SERVICE] Member added to shared list`, {
            listId,
            memberId,
            totalMembers: list.members.length
        });

        return {
            success: true,
            listId,
            memberId,
            totalMembers: list.members.length
        };
    }
}

export default UtilityService;
