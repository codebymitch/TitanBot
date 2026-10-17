// serviceErrorBoundary.js

import { createError, ErrorTypes, NexoBotError, categorizeError, getUserMessage } from './errorHandler.js';
import type { ErrorContext, ErrorLike, ErrorType } from './errorHandler.js';
import { resolveErrorCode, getErrorMetadata } from './errorRegistry.js';

export interface ServiceErrorOptions {
  context?: ErrorContext | null;
  type?: ErrorType;
  service?: string;
  operation?: string;
  errorCode?: string;
  message?: string;
  userMessage?: string;
  expected?: boolean;
}

/** Static options, or a factory that derives them from the wrapped call's arguments. */
export type ServiceErrorOptionsInput<A extends unknown[]> = ServiceErrorOptions | ((...args: A) => ServiceErrorOptions);

function isThenable(value: unknown): value is Promise<unknown> {
  return Boolean(value) && typeof (value as { then?: unknown }).then === 'function';
}

function normalizeBoundaryContext(context: ErrorContext | null | undefined = {}): ErrorContext {
  if (!context || typeof context !== 'object') {
    return {};
  }

  return context;
}

export function ensureTypedServiceError(error: unknown, options: ServiceErrorOptions = {}): NexoBotError {
  if (error instanceof NexoBotError) {
    return error;
  }

  const context = normalizeBoundaryContext(options.context);
  const fallbackType = options.type || ErrorTypes.UNKNOWN;
  const categorized = categorizeError(error);
  const type = categorized === ErrorTypes.UNKNOWN ? fallbackType : categorized;
  const service = options.service || 'unknown_service';
  const operation = options.operation || 'unknown_operation';
  const errorCode = resolveErrorCode({
    error,
    errorType: type,
    context: {
      errorCode: options.errorCode || `${service}.${operation}.failed`
    }
  });
  const errorMetadata = getErrorMetadata(errorCode);
  const message = options.message || `${service}.${operation} failed`;
  const userMessage = options.userMessage || getUserMessage(error);
  const isExpectedUserFailure = ([
    ErrorTypes.VALIDATION,
    ErrorTypes.USER_INPUT,
    ErrorTypes.CONFIGURATION,
    ErrorTypes.PERMISSION,
    ErrorTypes.RATE_LIMIT,
  ] as ErrorType[]).includes(type);

  return createError(message, type, userMessage, {
    ...context,
    service,
    operation,
    errorCode,
    remediationHint: errorMetadata.remediation,
    severity: errorMetadata.severity,
    retryable: errorMetadata.retryable,
    originalErrorMessage: (error as ErrorLike | null | undefined)?.message || String(error),
    originalErrorName: (error as ErrorLike | null | undefined)?.name || 'Error',
    expected: options.expected ?? isExpectedUserFailure,
  });
}

export function wrapServiceBoundary<This, A extends unknown[], R>(
  fn: (this: This, ...args: A) => R,
  options: ServiceErrorOptionsInput<A> = {},
): (this: This, ...args: A) => R {
  return function wrappedServiceBoundary(this: This, ...args: A): R {
    try {
      const result = fn.apply(this, args);

      if (isThenable(result)) {
        return result.catch((error) => {
          throw ensureTypedServiceError(error, typeof options === 'function' ? options(...args) : options);
        }) as R;
      }

      return result;
    } catch (error) {
      throw ensureTypedServiceError(error, typeof options === 'function' ? options(...args) : options);
    }
  };
}

export function wrapServiceClassMethods<T extends { readonly name: string }>(
  ServiceClass: T,
  optionsFactory?: (methodName: string, ...args: unknown[]) => ServiceErrorOptions,
): T {
  // Static members are looked up and replaced by name.
  const staticMembers = ServiceClass as Record<string, unknown>;
  const methodNames = Object.getOwnPropertyNames(ServiceClass)
    .filter((name) => name !== 'length' && name !== 'name' && name !== 'prototype')
    .filter((name) => typeof staticMembers[name] === 'function');

  for (const methodName of methodNames) {
    staticMembers[methodName] = wrapServiceBoundary(
      staticMembers[methodName] as (this: unknown, ...args: unknown[]) => unknown,
      (...args: unknown[]) => {
        const baseOptions = typeof optionsFactory === 'function'
          ? optionsFactory(methodName, ...args)
          : {};

        return {
          service: ServiceClass.name || 'ServiceClass',
          operation: methodName,
          ...baseOptions
        };
      }
    );
  }

  return ServiceClass;
}
