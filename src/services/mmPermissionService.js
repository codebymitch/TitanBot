/**
 * Serviço de Permissões do Sistema de Intermediação (MM)
 * 
 * Este módulo centraliza todas as regras de permissão para abertura e participação
 * em intermediações, garantindo consistência e facilidade de manutenção.
 * 
 * REGRAS DE NEGÓCIO:
 * 1. Administradores (Founder, Mod, Dev, Suporte, Middleman) PODEM abrir MM, mas NÃO PODEM ser chamados
 * 2. Bots específicos NÃO PODEM participar de MM (nem chamar nem ser chamados)
 * 3. Membros comuns (Membro, Booster) PODEM participar de MM (chamar e ser chamados)
 * 4. Apenas usuários humanos com roles permitidas podem iniciar MM
 */

import { logger } from '../utils/logger.js';

// ============================================================
// 🛡️ CONFIGURAÇÃO DE PERMISSÕES
// ============================================================

/**
 * IDs dos cargos de administração
 * Estes cargos PODEM abrir MM, mas NÃO PODEM ser chamados como contraparte
 */
export const ADMIN_ROLE_IDS = Object.freeze([
  '1505606856742277171', // Founder
  '1505611786039328768', // Mod
  '1505611576940433538', // Dev
  '1505631589407658064', // Suporte
  '1505618270492033094'  // Middleman
]);

/**
 * IDs dos bots que NÃO PODEM participar de MM de jeito nenhum
 * (nem chamar nem ser chamados)
 */
export const BLOCKED_BOT_IDS = Object.freeze([
  '1505774316418109520', // MMbot
  '1505630788761424056', // Ticket tool
  '1505612480796168355', // Vouch
  '1505636836092018868', // Jockie Music
  '1505636940618404042', // Bots
  '1506726277434970283'  // Bot Oficial
]);

/**
 * IDs dos cargos que PODEM ser chamados para MM
 * (desde que não sejam administradores ou bots)
 */
export const ALLOWED_CALLABLE_ROLE_IDS = Object.freeze([
  '1505611790942343298', // Membro
  '1505623811930853557'  // Booster
]);

/**
 * IDs dos cargos que NÃO PODEM iniciar MM
 * (administradores que não podem ser chamados)
 */
export const BLOCKED_START_ROLE_IDS = Object.freeze([
  '1505636940618404042', // Bots (role de bots)
  '1505606856742277171', // Founder
  '1505611576940433538'  // Dev
]);

// ============================================================
// 🔍 FUNÇÕES DE VERIFICAÇÃO
// ============================================================

/**
 * Verifica se um usuário é um bot bloqueado
 * @param {string} userId - ID do usuário
 * @returns {boolean} - True se o bot estiver bloqueado
 */
export function isBlockedBot(userId) {
  return BLOCKED_BOT_IDS.includes(userId);
}

/**
 * Verifica se um usuário tem algum cargo de administração
 * @param {import('discord.js').GuildMember} member - Membro do Discord
 * @returns {boolean} - True se tiver cargo de admin
 */
export function isAdmin(member) {
  if (!member?.roles) return false;
  return ADMIN_ROLE_IDS.some(roleId => member.roles.cache.has(roleId));
}

/**
 * Verifica se um usuário tem cargo que permite ser chamado para MM
 * @param {import('discord.js').GuildMember} member - Membro do Discord
 * @returns {boolean} - True se puder ser chamado
 */
export function isCallableRole(member) {
  if (!member?.roles) return false;
  return ALLOWED_CALLABLE_ROLE_IDS.some(roleId => member.roles.cache.has(roleId));
}

/**
 * Verifica se um usuário pode iniciar um MM
 * @param {import('discord.js').GuildMember} member - Membro do Discord
 * @returns {boolean} - True se puder iniciar
 */
export function canStartMM(member) {
  if (!member?.roles) return false;
  
  // Verifica se é bot bloqueado
  if (isBlockedBot(member.id)) {
    return false;
  }
  
  // Verifica se tem cargo bloqueado para iniciar
  if (BLOCKED_START_ROLE_IDS.some(roleId => member.roles.cache.has(roleId))) {
    return false;
  }
  
  return true;
}

/**
 * Verifica se um usuário pode ser chamado/convocado para um MM como contraparte
 * @param {import('discord.js').GuildMember} member - Membro do Discord
 * @returns {boolean} - True se puder ser chamado
 */
export function canBeCalledToMM(member) {
  if (!member?.roles) return false;
  
  // Verifica se é bot bloqueado
  if (isBlockedBot(member.id)) {
    return false;
  }
  
  // Verifica se é administrador (não pode ser chamado)
  if (isAdmin(member)) {
    return false;
  }
  
  // Verifica se tem cargo permitido para ser chamado
  if (!isCallableRole(member)) {
    return false;
  }
  
  return true;
}

/**
 * Verifica se um usuário pode participar de MM (tanto como iniciante quanto como contraparte)
 * @param {import('discord.js').GuildMember} member - Membro do Discord
 * @returns {boolean} - True se puder participar
 */
export function canParticipateInMM(member) {
  if (!member?.roles) return false;
  
  // Verifica se é bot bloqueado
  if (isBlockedBot(member.id)) {
    return false;
  }
  
  // Verifica se é administrador (pode participar mas não pode ser chamado)
  if (isAdmin(member)) {
    return true; // Admin pode participar
  }
  
  // Verifica se tem cargo permitido
  if (isCallableRole(member)) {
    return true;
  }
  
  return false;
}

/**
 * Verifica se um usuário pode ser selecionado como contraparte em um MM
 * Esta é a verificação mais restritiva - apenas membros comuns com roles permitidas
 * @param {import('discord.js').GuildMember} member - Membro do Discord
 * @param {string} initiatorId - ID do iniciante (para não selecionar a si mesmo)
 * @returns {{allowed: boolean, reason?: string}} - Resultado da verificação
 */
export function canBeSelectedAsCounterparty(member, initiatorId = null) {
  // Verifica se é o próprio iniciante
  if (initiatorId && member.id === initiatorId) {
    return {
      allowed: false,
      reason: 'Você não pode selecionar a si mesmo como contraparte.'
    };
  }
  
  // Verifica se é bot bloqueado
  if (isBlockedBot(member.id)) {
    return {
      allowed: false,
      reason: 'Bots não podem participar de intermediações.'
    };
  }
  
  // Verifica se é administrador
  if (isAdmin(member)) {
    return {
      allowed: false,
      reason: 'Administradores não podem ser chamados para intermediações.'
    };
  }
  
  // Verifica se tem cargo permitido
  if (!isCallableRole(member)) {
    return {
      allowed: false,
      reason: 'Este usuário não tem permissão para participar de intermediações.'
    };
  }
  
  return { allowed: true };
}

/**
 * Verifica se um membro pode agir como Middleman em um ticket
 * @param {import('discord.js').GuildMember} member - Membro do Discord
 * @param {Object} ticketData - Dados do ticket
 * @returns {boolean} - True se puder agir como MM
 */
export async function canActAsMM(member, ticketData) {
  if (!member?.roles) return false;
  
  // É o dono do servidor
  if (member.id === member.guild.ownerId) {
    return true;
  }
  
  // É o MM responsável pelo ticket
  if (ticketData?.mmId && ticketData.mmId === member.id) {
    return true;
  }
  
  // Tem cargo de Suporte ou Middleman
  const supportRoleId = '1505631589407658064';
  const middlemanRoleId = '1505618270492033094';
  
  return member.roles.cache.has(supportRoleId) || 
         member.roles.cache.has(middlemanRoleId);
}

/**
 * Verifica se um usuário é staff (para fins de assumir intermediação)
 * @param {import('discord.js').GuildMember} member - Membro do Discord
 * @param {import('discord.js').Guild} guild - Guild do Discord
 * @returns {Promise<boolean>} - True se for staff
 */
export async function isUserStaff(member, guild) {
  if (!member?.roles) return false;
  
  // É o dono do servidor
  if (member.id === guild.ownerId) {
    return true;
  }
  
  // Tem cargo de suporte (por nome)
  const supportRole = guild.roles.cache.find(r => r.name.toLowerCase() === 'suporte');
  if (supportRole && member.roles.cache.has(supportRole.id)) {
    return true;
  }
  
  // Tem cargo de staff configurado
  const staffRoleId = '1505631589407658064'; // Suporte
  if (staffRoleId && member.roles.cache.has(staffRoleId)) {
    return true;
  }
  
  return false;
}

// ============================================================
// 📋 FUNÇÕES DE VALIDAÇÃO COMPLETA
// ============================================================

/**
 * Valida se um MM pode ser criado entre duas partes
 * @param {import('discord.js').GuildMember} initiator - Quem está iniciando
 * @param {import('discord.js').GuildMember} counterparty - Contraparte selecionada
 * @returns {{valid: boolean, errors: string[]}} - Resultado da validação
 */
export function validateMMCreation(initiator, counterparty) {
  const errors = [];
  
  // Valida iniciante
  if (!canStartMM(initiator)) {
    errors.push('Você não tem permissão para iniciar uma intermediação.');
  }
  
  // Valida contraparte
  const counterpartyCheck = canBeSelectedAsCounterparty(counterparty, initiator?.id);
  if (!counterpartyCheck.allowed) {
    errors.push(counterpartyCheck.reason);
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Obtém informações detalhadas sobre permissões de um usuário
 * @param {import('discord.js').GuildMember} member - Membro do Discord
 * @returns {Object} - Informações de permissão
 */
export function getPermissionInfo(member) {
  if (!member?.roles) {
    return {
      canStartMM: false,
      canBeCalledToMM: false,
      canParticipate: false,
      isAdmin: false,
      isBlockedBot: isBlockedBot(member?.id || ''),
      roles: {
        admin: [],
        callable: [],
        blocked: []
      }
    };
  }
  
  const adminRoles = ADMIN_ROLE_IDS.filter(roleId => member.roles.cache.has(roleId));
  const callableRoles = ALLOWED_CALLABLE_ROLE_IDS.filter(roleId => member.roles.cache.has(roleId));
  const blockedRoles = BLOCKED_START_ROLE_IDS.filter(roleId => member.roles.cache.has(roleId));
  
  return {
    canStartMM: canStartMM(member),
    canBeCalledToMM: canBeCalledToMM(member),
    canParticipate: canParticipateInMM(member),
    isAdmin: isAdmin(member),
    isBlockedBot: isBlockedBot(member.id),
    roles: {
      admin: adminRoles,
      callable: callableRoles,
      blocked: blockedRoles
    }
  };
}

// ============================================================
// 🎯 EXPORTAÇÃO PADRÃO
// ============================================================

export default {
  // Constantes
  ADMIN_ROLE_IDS,
  BLOCKED_BOT_IDS,
  ALLOWED_CALLABLE_ROLE_IDS,
  BLOCKED_START_ROLE_IDS,
  
  // Funções de verificação
  isBlockedBot,
  isAdmin,
  isCallableRole,
  canStartMM,
  canBeCalledToMM,
  canParticipateInMM,
  canBeSelectedAsCounterparty,
  canActAsMM,
  isUserStaff,
  
  // Funções de validação
  validateMMCreation,
  getPermissionInfo
};