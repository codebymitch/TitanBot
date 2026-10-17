// applicationService.js

import { logger } from '../utils/logger.js';
import { createError, ErrorTypes } from '../utils/errorHandler.js';
import { PermissionFlagsBits } from 'discord.js';
import type { GuildMember } from 'discord.js';
import { sanitizeInput, sanitizeMarkdown } from '../utils/validation.js';
import {
    getApplicationSettings,
    saveApplicationSettings,
    getApplication,
    getApplications,
    createApplication,
    updateApplication,
    getUserApplications,
    getApplicationRoles,
    saveApplicationRoles
} from '../utils/database.js';
import type { ApplicationFilters, ApplicationInput, ApplicationSettings } from '../utils/database.js';
import botConfig from '../config/bot.js';
import type { NexoClient } from '../types/index.js';

export interface ApplicationReviewData {
    action: string;
    reason?: string | null;
    reviewerId: string;
}

export interface ApplicationRoleChange {
    action: string;
    roleId?: string | null;
    name?: string | null;
}

const applicationCooldowns = new Map<string, number>();
const APPLICATION_SUBMIT_COOLDOWN = (botConfig.applications?.applicationCooldown ?? 24) * 60 * 60 * 1000;

class ApplicationService {
    static sanitizeApplicationText(value: unknown, maxLength: number): string {
        return sanitizeMarkdown(sanitizeInput(String(value ?? ''), maxLength));
    }

    static validateApplicationSubmission(data: ApplicationInput): boolean {
        if (!data.guildId || !data.userId || !data.roleId) {
            throw createError(
                'Missing required fields for application submission',
                ErrorTypes.VALIDATION,
                'Ungültige Bewerbungsdaten. Bitte versuch es erneut.',
                { data }
            );
        }

        if (!data.answers || !Array.isArray(data.answers) || data.answers.length === 0) {
            throw createError(
                'Application must have answers',
                ErrorTypes.VALIDATION,
                'Du musst alle Fragen der Bewerbung beantworten.',
                { data }
            );
        }

        for (const answer of data.answers) {
            const sanitizedQuestion = this.sanitizeApplicationText(answer.question, 200);
            const sanitizedAnswer = this.sanitizeApplicationText(answer.answer, 1000);

            if (!sanitizedQuestion || !sanitizedAnswer) {
                throw createError(
                    'Invalid answer format',
                    ErrorTypes.VALIDATION,
                    'Alle Fragen müssen beantwortet werden.',
                    { answer }
                );
            }

            if (sanitizedAnswer.length > 1000) {
                throw createError(
                    'Answer too long',
                    ErrorTypes.VALIDATION,
                    'Jede Antwort muss kürzer als 1000 Zeichen sein.',
                    { length: sanitizedAnswer.length }
                );
            }

            if (sanitizedAnswer.trim().length < 10) {
                throw createError(
                    'Answer too short',
                    ErrorTypes.VALIDATION,
                    'Bitte gib aussagekräftige Antworten (mindestens 10 Zeichen).',
                    { length: sanitizedAnswer.length }
                );
            }
        }

        return true;
    }

    static checkApplicationCooldown(userId: string): boolean {
        const now = Date.now();
        const cooldownKey = `submit_${userId}`;
        const lastSubmit = applicationCooldowns.get(cooldownKey);

        if (lastSubmit && now - lastSubmit < APPLICATION_SUBMIT_COOLDOWN) {
            const remainingTime = Math.ceil((APPLICATION_SUBMIT_COOLDOWN - (now - lastSubmit)) / 1000);
            throw createError(
                'Application submission on cooldown',
                ErrorTypes.RATE_LIMIT,
                `Bitte warte ${Math.ceil(remainingTime / 60)} Minute(n), bevor du eine weitere Bewerbung abschickst.`,
                { remainingTime, userId }
            );
        }

        applicationCooldowns.set(cooldownKey, now);
        return true;
    }

    static async checkManagerPermission(client: NexoClient, guildId: string, member: GuildMember): Promise<boolean> {
        const settings = await getApplicationSettings(client, guildId);
        
        const isManager = 
            member.permissions.has(PermissionFlagsBits.ManageGuild) ||
            ((settings.managerRoles as string[] | undefined) && 
             (settings.managerRoles as string[]).some(roleId => member.roles.cache.has(roleId)));

        if (!isManager) {
            throw createError(
                'User lacks permission to manage applications',
                ErrorTypes.PERMISSION,
                'Du hast keine Berechtigung, Bewerbungen zu verwalten.',
                { userId: member.id, guildId }
            );
        }

        return true;
    }

    static async submitApplication(client: NexoClient, data: ApplicationInput) {
        try {
            
            this.validateApplicationSubmission(data);

            this.checkApplicationCooldown(data.userId);

            const settings = await getApplicationSettings(client, data.guildId);
            if (!settings.enabled) {
                throw createError(
                    'Applications are disabled',
                    ErrorTypes.CONFIGURATION,
                    'Bewerbungen sind auf diesem Server derzeit deaktiviert.',
                    { guildId: data.guildId }
                );
            }

            const userApps = await getUserApplications(client, data.guildId, data.userId);
            const pendingApp = userApps.find(app => app.status === 'pending');

            if (pendingApp) {
                throw createError(
                    'User already has pending application',
                    ErrorTypes.VALIDATION,
                    'Du hast bereits eine offene Bewerbung. Bitte warte, bis sie geprüft wurde.',
                    { userId: data.userId, pendingAppId: pendingApp.id }
                );
            }

            const sanitizedData = {
                ...data,
                answers: data.answers!.map(answer => ({
                    question: this.sanitizeApplicationText(answer.question, 200),
                    answer: this.sanitizeApplicationText(answer.answer, 1000)
                }))
            };

            const application = await createApplication(client, sanitizedData);

            logger.info('Application submitted', {
                applicationId: application.id,
                userId: data.userId,
                guildId: data.guildId,
                roleId: data.roleId,
                roleName: data.roleName
            });

            return application;
        } catch (error) {
            logger.error('Error submitting application', {
                error: (error as Error).message,
                userId: data.userId,
                guildId: data.guildId,
                stack: (error as Error).stack
            });
            throw error;
        }
    }

    static async reviewApplication(client: NexoClient, guildId: string, applicationId: string, reviewData: ApplicationReviewData) {
        try {
            const { action, reason, reviewerId } = reviewData;

            if (!['approve', 'deny'].includes(action)) {
                throw createError(
                    'Invalid review action',
                    ErrorTypes.VALIDATION,
                    'Die Aktion muss entweder „annehmen“ oder „ablehnen“ sein.',
                    { action }
                );
            }

            const application = await getApplication(client, guildId, applicationId);
            if (!application) {
                throw createError(
                    'Application not found',
                    ErrorTypes.CONFIGURATION,
                    'Die Bewerbung, die du prüfen willst, existiert nicht.',
                    { applicationId, guildId }
                );
            }

            if (application.status !== 'pending') {
                throw createError(
                    'Application already processed',
                    ErrorTypes.VALIDATION,
                    'Diese Bewerbung wurde bereits geprüft.',
                    { applicationId, status: application.status }
                );
            }

            const status = action === 'approve' ? 'approved' : 'denied';
            const sanitizedReason = reason ? reason.trim().substring(0, 500) : 'Kein Grund angegeben.';

            const updatedApplication = await updateApplication(client, guildId, applicationId, {
                status,
                reviewer: reviewerId,
                reviewMessage: sanitizedReason,
                reviewedAt: new Date().toISOString()
            });

            logger.info('Application reviewed', {
                applicationId,
                guildId,
                status,
                reviewerId,
                userId: application.userId
            });

            return updatedApplication;
        } catch (error) {
            logger.error('Error reviewing application', {
                error: (error as Error).message,
                applicationId,
                guildId,
                stack: (error as Error).stack
            });
            throw error;
        }
    }

    static async getApplicationsList(client: NexoClient, guildId: string, filters: ApplicationFilters = {}) {
        try {
            const applications = await getApplications(client, guildId, filters);

            logger.debug('Applications retrieved', {
                guildId,
                count: applications.length,
                filters
            });

            return applications;
        } catch (error) {
            logger.error('Error getting applications list', {
                error: (error as Error).message,
                guildId,
                filters,
                stack: (error as Error).stack
            });
            throw createError(
                'Failed to retrieve applications',
                ErrorTypes.DATABASE,
                'Beim Laden der Bewerbungen ist ein Fehler aufgetreten.',
                { guildId, filters }
            );
        }
    }

    static async updateSettings(client: NexoClient, guildId: string, updates: Partial<ApplicationSettings>) {
        try {
            
            if (updates.logChannelId && typeof updates.logChannelId !== 'string') {
                throw createError(
                    'Invalid log channel ID',
                    ErrorTypes.VALIDATION,
                    'Ungültige Kanal-ID angegeben.',
                    { logChannelId: updates.logChannelId }
                );
            }

            if (updates.managerRoles && !Array.isArray(updates.managerRoles)) {
                throw createError(
                    'Invalid manager roles format',
                    ErrorTypes.VALIDATION,
                    'Die Manager-Rollen müssen eine Liste sein.',
                    { managerRoles: updates.managerRoles }
                );
            }

            if (updates.questions) {
                if (!Array.isArray(updates.questions) || updates.questions.length === 0) {
                    throw createError(
                        'Invalid questions format',
                        ErrorTypes.VALIDATION,
                        'Die Fragen müssen eine nicht-leere Liste sein.',
                        { questions: updates.questions }
                    );
                }

                updates.questions = updates.questions.map(q => 
                    typeof q === 'string' ? q.trim().substring(0, 100) : q
                );
            }

            await saveApplicationSettings(client, guildId, updates);
            const updatedSettings = await getApplicationSettings(client, guildId);

            logger.info('Application settings updated', {
                guildId,
                updates: Object.keys(updates)
            });

            return updatedSettings;
        } catch (error) {
            logger.error('Error updating application settings', {
                error: (error as Error).message,
                guildId,
                updates,
                stack: (error as Error).stack
            });
            throw error;
        }
    }

    static async manageApplicationRoles(client: NexoClient, guildId: string, data: ApplicationRoleChange) {
        try {
            const { action, roleId, name } = data;

            const currentRoles = await getApplicationRoles(client, guildId);

            if (action === 'add') {
                if (!roleId) {
                    throw createError(
                        'Missing role ID',
                        ErrorTypes.VALIDATION,
                        'Du musst eine Rolle zum Hinzufügen angeben.',
                        { action }
                    );
                }

                if (currentRoles.some(appRole => appRole.roleId === roleId)) {
                    throw createError(
                        'Role already configured',
                        ErrorTypes.VALIDATION,
                        'Diese Rolle ist bereits für Bewerbungen eingerichtet.',
                        { roleId }
                    );
                }

                currentRoles.push({
                    roleId,
                    name: name ? name.trim().substring(0, 50) : 'Bewerbungsrolle'
                });

                await saveApplicationRoles(client, guildId, currentRoles);

                logger.info('Application role added', {
                    guildId,
                    roleId,
                    name
                });
            } else if (action === 'remove') {
                if (!roleId) {
                    throw createError(
                        'Missing role ID',
                        ErrorTypes.VALIDATION,
                        'Du musst eine Rolle zum Entfernen angeben.',
                        { action }
                    );
                }

                const roleIndex = currentRoles.findIndex(appRole => appRole.roleId === roleId);
                if (roleIndex === -1) {
                    throw createError(
                        'Role not configured',
                        ErrorTypes.VALIDATION,
                        'Diese Rolle ist nicht für Bewerbungen eingerichtet.',
                        { roleId }
                    );
                }

                currentRoles.splice(roleIndex, 1);
                await saveApplicationRoles(client, guildId, currentRoles);

                logger.info('Application role removed', {
                    guildId,
                    roleId
                });
            }

            return currentRoles;
        } catch (error) {
            logger.error('Error managing application roles', {
                error: (error as Error).message,
                guildId,
                data,
                stack: (error as Error).stack
            });
            throw error;
        }
    }

    static async getUserApplications(client: NexoClient, guildId: string, userId: string) {
        try {
            const applications = await getUserApplications(client, guildId, userId);

            logger.debug('User applications retrieved', {
                guildId,
                userId,
                count: applications.length
            });

            return applications;
        } catch (error) {
            logger.error('Error getting user applications', {
                error: (error as Error).message,
                guildId,
                userId,
                stack: (error as Error).stack
            });
            throw createError(
                'Failed to retrieve your applications',
                ErrorTypes.DATABASE,
                'Beim Laden deiner Bewerbungen ist ein Fehler aufgetreten.',
                { guildId, userId }
            );
        }
    }

    static async getSingleApplication(client: NexoClient, guildId: string, applicationId: string) {
        try {
            const application = await getApplication(client, guildId, applicationId);

            if (!application) {
                throw createError(
                    'Application not found',
                    ErrorTypes.CONFIGURATION,
                    'Die gesuchte Bewerbung existiert nicht.',
                    { applicationId, guildId }
                );
            }

            return application;
        } catch (error) {
            logger.error('Error getting application', {
                error: (error as Error).message,
                applicationId,
                guildId,
                stack: (error as Error).stack
            });
            throw error;
        }
    }
}

export default ApplicationService;