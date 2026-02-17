import {
  checkVerificationCooldown,
  trackVerificationAttempt,
  validateAutoVerifyCriteria
} from '../src/services/verificationService.js';

describe('verificationService validation', () => {
  test('validateAutoVerifyCriteria rejects invalid criteria', () => {
    expect(() => validateAutoVerifyCriteria('invalid', 1)).toThrow();
  });

  test('validateAutoVerifyCriteria rejects invalid account age range', () => {
    expect(() => validateAutoVerifyCriteria('account_age', 0)).toThrow();
    expect(() => validateAutoVerifyCriteria('account_age', 366)).toThrow();
  });
});

describe('verificationService rate limiting', () => {
  test('checkVerificationCooldown blocks rapid re-verify', async () => {
    const guildId = 'guild-cooldown';
    const userId = 'user-cooldown';

    await expect(checkVerificationCooldown(userId, guildId, 5000)).resolves.toBeUndefined();
    await expect(checkVerificationCooldown(userId, guildId, 5000)).rejects.toThrow();
  });

  test('trackVerificationAttempt enforces max attempts', async () => {
    const guildId = 'guild-attempts';
    const userId = 'user-attempts';

    await expect(trackVerificationAttempt(userId, guildId, 2, 60000)).resolves.toBeUndefined();
    await expect(trackVerificationAttempt(userId, guildId, 2, 60000)).resolves.toBeUndefined();
    await expect(trackVerificationAttempt(userId, guildId, 2, 60000)).rejects.toThrow();
  });
});
