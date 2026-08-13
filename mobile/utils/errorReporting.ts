/**
 * Error reporting utilities.
 * Centralized error handling with hook point for Sentry/external services.
 */

/**
 * Report an error to the error tracking service.
 * Currently console-only; TODO: wire Sentry here.
 *
 * @param error - The error to report
 * @param context - Additional context (component, user action, etc.)
 */
export function reportError(error: Error, context?: Record<string, unknown>): void {
  console.error('[ErrorReport]', error.message, context);
  
  // TODO: Wire up Sentry here when ready:
  // import * as Sentry from '@sentry/react-native';
  // Sentry.captureException(error, { extra: context });
}

/**
 * Wrap an async function to catch and report errors automatically.
 * Useful for event handlers and callbacks.
 */
export function withErrorHandling<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  context?: Record<string, unknown>,
): T {
  return (async (...args: any[]) => {
    try {
      return await fn(...args);
    } catch (error) {
      reportError(error as Error, context);
      throw error;
    }
  }) as T;
}
