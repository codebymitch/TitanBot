const DEFAULT_SOFT_WARN_THRESHOLD = 3;

class SoftWarningServiceClass {
  constructor(threshold = DEFAULT_SOFT_WARN_THRESHOLD) {
    this.threshold = threshold;
    // المفتاح: `${guildId}:${userId}` -> { count: number, warnings: Array }
    this.records = new Map();
  }

  getKey(guildId, userId) {
    return `${guildId}:${userId}`;
  }

  getRecord(guildId, userId) {
    const key = this.getKey(guildId, userId);

    if (!this.records.has(key)) {
      this.records.set(key, {
        count: 0,
        warnings: [],
      });
    }

    return this.records.get(key);
  }

  async addSoftWarning({ guildId, userId, moderatorId, reason, threshold, timestamp = Date.now() }) {
    const activeThreshold = Number.isInteger(threshold) && threshold > 0 ? threshold : this.threshold;
    const record = this.getRecord(guildId, userId);
    const id = `sw_${timestamp}_${Math.random().toString(36).slice(2, 7)}`;

    record.count += 1;
    record.warnings.push({
      id,
      moderatorId,
      reason,
      timestamp,
    });

    const reachedCount = record.count;
    const reachedThreshold = reachedCount >= activeThreshold;

    if (reachedThreshold) {
      record.count = 0;
      record.warnings = [];
    }

    return {
      id,
      softCount: reachedCount,
      resetCount: record.count,
      threshold: activeThreshold,
      reachedThreshold,
      escalated: reachedThreshold,
    };
  }

  async resetSoftWarnings({ guildId, userId }) {
    this.records.set(this.getKey(guildId, userId), {
      count: 0,
      warnings: [],
    });
  }

  getCount(guildId, userId) {
    return this.getRecord(guildId, userId).count;
  }

  getWarnings(guildId, userId) {
    return this.getRecord(guildId, userId).warnings;
  }

  clearWarnings(guildId, userId) {
    this.records.set(this.getKey(guildId, userId), {
      count: 0,
      warnings: [],
    });
  }
}

export const SoftWarningService = new SoftWarningServiceClass();

export default {
  SoftWarningService,
};
