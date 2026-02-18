



















import { logger } from '../utils/logger.js';
import { getFromDb, setInDb, deleteFromDb } from '../utils/database.js';
import { createError, ErrorTypes } from '../utils/errorHandler.js';

const REPORT_DUPLICATE_WINDOW = 60 * 60 * 1000; 
const REPORT_USER_COOLDOWN = 10 * 60 * 1000; 


const wipedataRequests = new Map();
const WIPEDATA_COOLDOWN = 24 * 60 * 60 * 1000; 
const WIPEDATA_CONFIRM_WINDOW = 2 * 60 * 1000; 
const WIPEDATA_REQUEST_CACHE_LIMIT = 1000;


const TODO_MAX_TASKS = 100;
const TODO_MAX_LENGTH = 500;
const SHARED_TODO_MAX_MEMBERS = 20;

class UtilityService {

    

    






    static async validateReport(reportedUserId, reportingUserId, reason) {
        logger.debug(`[UTILITY_SERVICE] Validating report`, {
            reportedUserId,
            reportingUserId
        });

        
        if (reportedUserId === reportingUserId) {
            throw createError(
                'Cannot report self',
                ErrorTypes.VALIDATION,
                'You cannot report yourself.',
                { reportedUserId, reportingUserId }
            );
        }

        
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

    








    static async submitReport(client, guildId, reportedUserId, reportingUserId, reportData) {
        logger.info(`[UTILITY_SERVICE] Submitting report`, {
            guildId,
            reportedUserId,
            reportingUserId
        });

        
        await this.validateReport(reportedUserId, reportingUserId, reportData.reason);

        
        await this.checkForDuplicateReport(guildId, reportedUserId, reportingUserId);

        
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

        
        const reportsKey = `reports:${guildId}:${reportedUserId}`;
        const recentReports = await getFromDb(reportsKey, []);
        recentReports.push({
            reportingUserId,
            timestamp: Date.now(),
            id: reportId
        });
        await setInDb(reportsKey, recentReports);

        
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

    






    static async executeDataWipe(client, guildId, userId) {
        logger.warn(`[UTILITY_SERVICE] Executing data wipe`, {
            guildId,
            userId,
            timestamp: new Date().toISOString()
        });

        const now = Date.now();
        const confirmationKey = `${guildId}:${userId}`;
        const existingConfirmation = wipedataRequests.get(confirmationKey);

        if (wipedataRequests.size > WIPEDATA_REQUEST_CACHE_LIMIT) {
            for (const [key, value] of wipedataRequests.entries()) {
                if (!value?.requestedAt || (now - value.requestedAt) > WIPEDATA_CONFIRM_WINDOW) {
                    wipedataRequests.delete(key);
                }
            }
        }

        const hasValidConfirmation = existingConfirmation &&
            (now - existingConfirmation.requestedAt) <= WIPEDATA_CONFIRM_WINDOW;

        if (!hasValidConfirmation) {
            wipedataRequests.set(confirmationKey, {
                requestedAt: now,
                expiresAt: now + WIPEDATA_CONFIRM_WINDOW
            });

            throw createError(
                'Wipedata confirmation required',
                ErrorTypes.VALIDATION,
                'This action permanently deletes your stored data. Run the wipe command again within 2 minutes to confirm.',
                {
                    confirmationRequired: true,
                    expiresAt: new Date(now + WIPEDATA_CONFIRM_WINDOW).toISOString()
                }
            );
        }

        wipedataRequests.delete(confirmationKey);

        
        const cooldown = await this.checkWipedataCooldown(guildId, userId);
        if (!cooldown.canWipe) {
            throw createError(
                'Wipedata cooldown active',
                ErrorTypes.RATE_LIMIT,
                `You can only wipe your data once every **24 hours**. Please wait **${Math.ceil(cooldown.cooldownRemaining / 3600)}** hours.`,
                { ...cooldown }
            );
        }

        
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

        
        const cooldownKey = `wipedata:cooldown:${guildId}:${userId}`;
        await setInDb(cooldownKey, Date.now());

        
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

        
        const todoKey = `todo:${userId}`;
        const todoList = await getFromDb(todoKey, { tasks: [], nextId: 1 });

        
        if (todoList.tasks?.length >= TODO_MAX_TASKS) {
            throw createError(
                'Too many tasks',
                ErrorTypes.VALIDATION,
                `You cannot have more than **${TODO_MAX_TASKS}** tasks.`,
                { current: todoList.tasks.length, max: TODO_MAX_TASKS }
            );
        }

        
        const taskId = todoList.nextId || 1;
        const task = {
            id: taskId,
            content: trimmed,
            completed: false,
            createdAt: new Date().toISOString()
        };

        
        if (!Array.isArray(todoList.tasks)) {
            todoList.tasks = [];
        }
        todoList.tasks.push(task);
        todoList.nextId = (todoList.nextId || 1) + 1;

        
        await setInDb(todoKey, todoList);

        logger.info(`[UTILITY_SERVICE] Todo task added`, {
            userId,
            taskId,
            taskLength: trimmed.length
        });

        return task;
    }

    





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

        
        if (list.creatorId !== requestedBy) {
            throw createError(
                'Permission denied',
                ErrorTypes.VALIDATION,
                'Only the list creator can add members.',
                { listId, creatorId: list.creatorId }
            );
        }

        
        if (list.members?.length >= SHARED_TODO_MAX_MEMBERS) {
            throw createError(
                'Too many members',
                ErrorTypes.VALIDATION,
                `Shared lists can have a maximum of **${SHARED_TODO_MAX_MEMBERS}** members.`,
                { current: list.members.length, max: SHARED_TODO_MAX_MEMBERS }
            );
        }

        
        if (!list.members) list.members = [];
        if (!list.members.includes(memberId)) {
            list.members.push(memberId);
        }

        await setInDb(listKey, list);

        
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
