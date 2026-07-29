import { logger } from '../utils/logger.js';

export const botConfig = {
  // =========================
  // BOT PRESENCE (봇 상태 메시지)
  // =========================
  presence: {
    status: "online",
    activities: [
      {
        name: "name", 
        state: "/도움말 | 1개의 서버에서 활동중",     
        type: 4,               
      },
    ],
  },

  // =========================
  // COMMAND BEHAVIOR (명령어 설정)
  // =========================
  commands: {
    owners: process.env.OWNER_IDS?.split(",").map((id) => id.trim()).filter(Boolean) || [],
    defaultCooldown: 3,
    deleteCommands: false,
    testGuildId: process.env.TEST_GUILD_ID,
    maintenanceMode: process.env.MAINTENANCE_MODE === "true",
    prefix: process.env.PREFIX || "!",
  },

  // =========================
  // APPLICATIONS SYSTEM (지원서 시스템)
  // =========================
  applications: {
    defaultQuestions: [
      { question: "이름이 무엇인가요?", required: true },
      { question: "몇 살 이신가요?", required: true },
      { question: "왜 여기에 참여하고 싶으셨나요?", required: true },
    ],
    statusColors: {
      pending: "#FFA500",
      approved: "#00FF00",
      denied: "#FF0000",
    },
    applicationCooldown: 24,
    deleteDeniedAfter: 7,
    deleteApprovedAfter: 30,
    managerRoles: [], 
  },

  // =========================
  // EMBED COLORS & BRANDING (임베드 색상 및 브랜드 설정)
  // =========================
  embeds: {
    colors: {
      primary: "#336699",
      secondary: "#2F3136",
      success: "#57F287",
      error: "#ED4245",
      warning: "#FEE75C",
      info: "#3498DB",
      light: "#FFFFFF",
      dark: "#202225",
      gray: "#99AAB5",
      blurple: "#5865F2",
      green: "#57F287",
      yellow: "#FEE75C",
      fuchsia: "#EB459E",
      red: "#ED4245",
      black: "#000000",
      giveaway: {
        active: "#57F287",
        ended: "#ED4245",
      },
      ticket: {
        open: "#57F287",
        claimed: "#FAA61A",
        closed: "#ED4245",
        pending: "#99AAB5",
      },
      economy: "#F1C40F",
      birthday: "#E91E63",
      moderation: "#9B59B6",
      priority: {
        none: "#95A5A6",
        low: "#3498db",
        medium: "#2ecc71",
        high: "#f1c40f",
        urgent: "#e74c3c",
      },
    },
    footer: {
      text: "민쭌봇",
      icon: null,
    },
    thumbnail: null,
    author: {
      name: null,
      icon: null,
      url: null,
    },
  },

  // =========================
  // ECONOMY SETTINGS (경제 시스템)
  // =========================
  economy: {
    currency: {
      name: "코인",
      namePlural: "코인",
      symbol: "$",
    },
    startingBalance: 0,
    baseBankCapacity: 100000,
    dailyAmount: 100,
    workMin: 10,
    workMax: 100,
    begMin: 5,
    begMax: 50,
    cooldowns: {
      daily: 24 * 60 * 60 * 1000,
      work: 60 * 60 * 1000,
      crime: 2 * 60 * 60 * 1000,
      rob: 4 * 60 * 60 * 1000,
    },
    robSuccessRate: 0.4,
    robFailJailTime: 3600000,
  },

  // =========================
  // SHOP SETTINGS (상점 시스템)
  // =========================
  shop: {},

  // =========================
  // TICKET SYSTEM (티켓 시스템)
  // =========================
  tickets: {
    defaultCategory: null,
    supportRoles: [],
    priorities: {
      none: {
        emoji: "⚪",
        color: "#95A5A6",
        label: "없음",
      },
      low: {
        emoji: "🟢",
        color: "#2ECC71",
        label: "낮음",
      },
      medium: {
        emoji: "🟡",
        color: "#F1C40F",
        label: "보통",
      },
      high: {
        emoji: "🔴",
        color: "#E74C3C",
        label: "높음",
      },
      urgent: {
        emoji: "🚨",
        color: "#E91E63",
        label: "긴급",
      },
    },
    defaultPriority: "none",
    archiveCategory: null,
    logChannel: null,
  },

  // =========================
  // GIVEAWAY SETTINGS (이벤트/추첨 시스템)
  // =========================
  giveaways: {
    defaultDuration: 86400000,
    minimumWinners: 1,
    maximumWinners: 10,
    minimumDuration: 300000,
    maximumDuration: 2592000000,
    allowedRoles: [],
    bypassRoles: [],
  },

  // =========================
  // BIRTHDAY SETTINGS (생일 알림 시스템)
  // =========================
  birthday: {
    defaultRole: null,
    announcementChannel: null,
    timezone: "KST",
  },

  // =========================
  // VERIFICATION SETTINGS (인증 시스템)
  // =========================
  verification: {
    defaultMessage: "아래 버튼을 클릭하여 인증을 완료하세요. 인증하면 서버에서 인증하였다는 사실을 알 수 있습니다.",
    defaultButtonText: "인증시작",
    autoVerify: {
      defaultCriteria: "none",
      defaultAccountAgeDays: 7,
      serverSizeThreshold: 1000,
      minAccountAge: 1,
      maxAccountAge: 365,
      sendDMNotification: true,
      criteria: {
        account_age: "계정이 지정된 일수보다 오래되어야 해요",
        server_size: "서버 인원이 1000명 미만일 경우 모든 유저가 대상이에요",
        none: "모든 유저가 즉시 인증돼요"
      }
    },
    verificationCooldown: 5000,
    maxVerificationAttempts: 3,
    attemptWindow: 60000,
    maxCooldownEntries: 10000,
    maxAttemptEntries: 10000,
    cooldownCleanupInterval: 300000,
    maxAuditMetadataBytes: 4096,
    maxInMemoryAuditEntries: 1000,
    logAllVerifications: true,
    keepAuditTrail: true,
  },

  // =========================
  // WELCOME / GOODBYE MESSAGES (환영/퇴장 메시지)
  // =========================
  welcome: {
    defaultWelcomeMessage: "{user} 님! 여기는 {server} 입니다! 만나뵙게 되어 정말 반갑습니다. {memberCount} 번째 유저입니다",
    defaultGoodbyeMessage: "{user} 님이 서버에서 나갔습니다. {memberCount} 명의 유저가 남았습니다.",
    defaultWelcomeChannel: null,
    defaultGoodbyeChannel: null,
  },

  // =========================
  // COUNTER CHANNELS (서버 카운터 시스템)
  // =========================
  counters: {
    defaults: {
      name: "{name} 카운터",
      description: "서버 {name} 카운터예요",
      type: "voice",
      channelName: "{name}-{count}",
    },
    permissions: {
      deny: ["VIEW_CHANNEL"],
      allow: ["VIEW_CHANNEL", "CONNECT", "SPEAK"],
    },
    messages: {
      created: "✅ 다음 이름으로 카운터를 만들었어요. **{name}**",
      deleted: "🗑️ 다음 이름의 카운터를 지웠어요. **{name}**",
      updated: "🔄 다음 이름의 카운터를 업데이트 했어요. **{name}**",
    },
    types: {
      members: {
        name: "👥 전체 유저",
        description: "서버의 총 인원 수예요",
        getCount: (guild) => guild.memberCount.toString(),
      },
      bots: {
        name: "🤖 봇",
        description: "서버의 봇 계정 수예요",
        getCount: (guild) =>
          guild.members.cache.filter((m) => m.user.bot).size.toString(),
      },
      members_only: {
        name: "👤 실제 유저",
        description: "서버의 실제 유저 수예요 (봇 제외)",
        getCount: (guild) =>
          guild.members.cache.filter((m) => !m.user.bot).size.toString(),
      },
    },
  },

  // =========================
  // GENERIC BOT MESSAGES (봇 공통 메시지)
  // =========================
  messages: {
    noPermission: "이 명령어를 사용할 권한이 없어요.",
    cooldownActive: "이 명령어를 다시 사용하려면 {time}을(를) 기다려야 해요.",
    errorOccurred: "명령어를 실행하는 중에 오류가 발생했어요.",
    missingPermissions: "이 작업을 수행하는 데 필요한 권한이 제게 없어요.",
    commandDisabled: "이 명령어는 현재 비활성화되어 있어요.",
    maintenanceMode: "봇이 현재 점검 중이에요. 조금만 기다려 주세요!",
  },

  // =========================
  // FEATURE TOGGLES (기능 활성화 설정)
  // =========================
  features: {
    economy: true,
    leveling: true,
    moderation: true,
    logging: true,
    welcome: true,
    tickets: true,
    giveaways: true,
    birthday: true,
    counter: true,
    verification: true,
    reactionRoles: true,
    joinToCreate: true,
    voice: true,
    search: true,
    tools: true,
    utility: true,
    community: true,
    fun: true,
    music: true,
  },
};

export function validateConfig(config) {
  const errors = [];

  if (process.env.NODE_ENV !== 'production') {
    logger.debug('환경 변수 확인 중:');
    logger.debug('DISCORD_TOKEN 존재 여부:', !!process.env.DISCORD_TOKEN);
    logger.debug('TOKEN 존재 여부:', !!process.env.TOKEN);
    logger.debug('CLIENT_ID 존재 여부:', !!process.env.CLIENT_ID);
    logger.debug('GUILD_ID 존재 여부:', !!process.env.GUILD_ID);
    logger.debug('POSTGRES_HOST 존재 여부:', !!process.env.POSTGRES_HOST);
    logger.debug('NODE_ENV:', process.env.NODE_ENV);
  }

  if (!process.env.DISCORD_TOKEN && !process.env.TOKEN) {
    errors.push("봇 토큰이 필요해요 (DISCORD_TOKEN 또는 TOKEN 환경 변수를 설정해 주세요)");
  }

  if (!process.env.CLIENT_ID) {
    errors.push("클라이언트 ID가 필요해요 (CLIENT_ID 환경 변수를 설정해 주세요)");
  }

  if (process.env.NODE_ENV === 'production') {
    const hasConnectionUrl = Boolean(process.env.POSTGRES_URL || process.env.DATABASE_URL);

    if (!hasConnectionUrl) {
      if (!process.env.POSTGRES_HOST) {
        errors.push("프로덕션 환경에서는 PostgreSQL 연결이 필요해요 (DATABASE_URL/POSTGRES_URL 또는 POSTGRES_HOST를 설정해 주세요)");
      }
      if (!process.env.POSTGRES_USER) {
        errors.push("프로덕션 환경에서는 PostgreSQL 사용자 이름이 필요해요 (DATABASE_URL/POSTGRES_URL 또는 POSTGRES_USER를 설정해 주세요)");
      }
      if (!process.env.POSTGRES_PASSWORD) {
        errors.push("프로덕션 환경에서는 PostgreSQL 비밀번호가 필요해요 (DATABASE_URL/POSTGRES_URL 또는 POSTGRES_PASSWORD를 설정해 주세요)");
      }
    }
  }

  return errors;
}

const configErrors = validateConfig(botConfig);
if (configErrors.length > 0) {
  logger.error("봇 설정 오류:", configErrors.join("\n"));
  if (process.env.NODE_ENV === "production") {
    process.exit(1);
  }
}

export const BotConfig = botConfig;

const COMMAND_CATEGORY_FEATURE_MAP = {
  birthday: "birthday",
  community: "community",
  economy: "economy",
  fun: "fun",
  giveaway: "giveaways",
  jointocreate: "joinToCreate",
  leveling: "leveling",
  logging: "logging",
  moderation: "moderation",
  music: "music",
  reaction_roles: "reactionRoles",
  search: "search",
  serverstats: "counter",
  ticket: "tickets",
  tools: "tools",
  utility: "utility",
  verification: "verification",
  welcome: "welcome",
};

function normalizeCategoryKey(category) {
  return String(category || "").trim().toLowerCase().replace(/\s+/g, "_");
}

export function getCommandPrefix() {
  return botConfig.commands?.prefix ?? "!";
}

export function getBotOwners() {
  return (botConfig.commands?.owners ?? [])
    .map((id) => String(id).trim())
    .filter(Boolean);
}

export function isBotOwner(userId) {
  if (!userId) {
    return false;
  }

  return getBotOwners().includes(String(userId));
}

export function isMaintenanceMode() {
  return botConfig.commands?.maintenanceMode === true;
}

export function getBotMessage(key, replacements = {}) {
  let message = botConfig.messages?.[key] || key;

  for (const [placeholder, value] of Object.entries(replacements)) {
    message = message.replace(new RegExp(`\\{${placeholder}\\}`, "g"), String(value));
  }

  return message;
}

export function isFeatureEnabled(featureKey) {
  if (!featureKey) {
    return true;
  }

  return botConfig.features?.[featureKey] !== false;
}

export function isCommandCategoryEnabled(category) {
  const normalized = normalizeCategoryKey(category);

  if (!normalized || normalized === "core") {
    return true;
  }

  const featureKey = COMMAND_CATEGORY_FEATURE_MAP[normalized];
  if (!featureKey) {
    return true;
  }

  return isFeatureEnabled(featureKey);
}

export function getApplicationStatusColor(status) {
  const colors = botConfig.applications?.statusColors || {};
  const hex = colors[status];
  return hex ? getColor(hex) : getColor(status === "approved" ? "success" : status === "denied" ? "error" : "warning");
}

export function getDefaultApplicationQuestions() {
  return (botConfig.applications?.defaultQuestions || []).map((entry) =>
    typeof entry === "string" ? entry : entry.question,
  ).filter(Boolean);
}

export function getColor(path, fallback = "#99AAB5") {
  if (typeof path === "number") return path;
  if (typeof path === "string" && path.startsWith("#")) {
    return parseInt(path.replace("#", ""), 16);
  }
  const result = path
    .split(".")
    .reduce(
      (obj, key) => (obj && obj[key] !== undefined ? obj[key] : fallback),
      botConfig.embeds.colors,
    );
  
  if (typeof result === "string" && result.startsWith("#")) {
    return parseInt(result.replace("#", ""), 16);
  }
  return result;
}

export function getRandomColor() {
  const colors = Object.values(botConfig.embeds.colors).flatMap((color) =>
    typeof color === "string" ? color : Object.values(color),
  );
  return colors[Math.floor(Math.random() * colors.length)];
}

export default botConfig;
