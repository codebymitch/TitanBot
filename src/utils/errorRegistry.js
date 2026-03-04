const ErrorCodes = Object.freeze({
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  CONFIGURATION_ERROR: 'CONFIGURATION_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
  DISCORD_API_ERROR: 'DISCORD_API_ERROR',
  USER_INPUT_ERROR: 'USER_INPUT_ERROR',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERACTION_INVALID: 'INTERACTION_INVALID',
  INTERACTION_EXPIRED: 'INTERACTION_EXPIRED',
  INTERACTION_RESPONSE_FAILED: 'INTERACTION_RESPONSE_FAILED',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR'
});

const ErrorCodeRegistry = Object.freeze({
  [ErrorCodes.VALIDATION_FAILED]: {
    severity: 'low',
    retryable: false,
    remediation: 'Validate command inputs before processing and return field-specific guidance.'
  },
  [ErrorCodes.PERMISSION_DENIED]: {
    severity: 'low',
    retryable: false,
    remediation: 'Review bot/user role permissions and required Discord permissions for this command.'
  },
  [ErrorCodes.CONFIGURATION_ERROR]: {
    severity: 'medium',
    retryable: false,
    remediation: 'Check required environment variables and guild feature configuration.'
  },
  [ErrorCodes.DATABASE_ERROR]: {
    severity: 'high',
    retryable: true,
    remediation: 'Check Postgres connectivity, pool saturation, statement timeouts, and recent migrations.'
  },
  [ErrorCodes.NETWORK_ERROR]: {
    severity: 'medium',
    retryable: true,
    remediation: 'Check network reachability, upstream service status, and retry/backoff behavior.'
  },
  [ErrorCodes.DISCORD_API_ERROR]: {
    severity: 'high',
    retryable: true,
    remediation: 'Check Discord API status, rate-limit response patterns, and bot token validity.'
  },
  [ErrorCodes.USER_INPUT_ERROR]: {
    severity: 'low',
    retryable: false,
    remediation: 'Validate user-provided IDs/mentions and return clearer input examples.'
  },
  [ErrorCodes.RATE_LIMITED]: {
    severity: 'low',
    retryable: true,
    remediation: 'Apply cooldown-aware retries and reduce bursty command execution.'
  },
  [ErrorCodes.INTERACTION_INVALID]: {
    severity: 'medium',
    retryable: false,
    remediation: 'Ensure interaction object is available and valid before replying.'
  },
  [ErrorCodes.INTERACTION_EXPIRED]: {
    severity: 'medium',
    retryable: false,
    remediation: 'Defer or reply to interactions earlier to avoid 15-minute expiry windows.'
  },
  [ErrorCodes.INTERACTION_RESPONSE_FAILED]: {
    severity: 'medium',
    retryable: false,
    remediation: 'Check interaction acknowledgement state and Discord response error codes.'
  },
  [ErrorCodes.UNKNOWN_ERROR]: {
    severity: 'high',
    retryable: false,
    remediation: 'Capture trace context and stack, then classify this failure under a specific error code.'
  }
});

const TypeToErrorCode = Object.freeze({
  validation: ErrorCodes.VALIDATION_FAILED,
  permission: ErrorCodes.PERMISSION_DENIED,
  configuration: ErrorCodes.CONFIGURATION_ERROR,
  database: ErrorCodes.DATABASE_ERROR,
  network: ErrorCodes.NETWORK_ERROR,
  discord_api: ErrorCodes.DISCORD_API_ERROR,
  user_input: ErrorCodes.USER_INPUT_ERROR,
  rate_limit: ErrorCodes.RATE_LIMITED,
  unknown: ErrorCodes.UNKNOWN_ERROR
});

function normalizeErrorCode(errorCode) {
  if (errorCode === null || errorCode === undefined) {
    return null;
  }

  return String(errorCode).trim().toUpperCase();
}

export function getErrorMetadata(errorCode) {
  const normalized = normalizeErrorCode(errorCode);
  if (!normalized) {
    return ErrorCodeRegistry[ErrorCodes.UNKNOWN_ERROR];
  }

  return ErrorCodeRegistry[normalized] || ErrorCodeRegistry[ErrorCodes.UNKNOWN_ERROR];
}

export function getDefaultErrorCodeByType(errorType = 'unknown') {
  return TypeToErrorCode[errorType] || ErrorCodes.UNKNOWN_ERROR;
}

export function resolveErrorCode({ error, errorType = 'unknown', context = {} } = {}) {
  const contextCode = normalizeErrorCode(context?.errorCode);
  if (contextCode) {
    return contextCode;
  }

  const nestedContextCode = normalizeErrorCode(error?.context?.errorCode);
  if (nestedContextCode) {
    return nestedContextCode;
  }

  const code = normalizeErrorCode(error?.code);
  if (code) {
    return code;
  }

  return getDefaultErrorCodeByType(errorType);
}

export { ErrorCodes, ErrorCodeRegistry, TypeToErrorCode };
