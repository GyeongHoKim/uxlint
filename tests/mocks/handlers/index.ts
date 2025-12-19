/**
 * Root-level request handlers for MSW.
 * Combines all domain-specific handlers into a single array.
 */
import {oauthHandlers} from './oauth.js';

// Re-export all handlers and utilities for convenience
export * from './oauth.js';

/**
 * Combined handlers from all domains.
 * These are loaded by default in the MSW server setup.
 */
export const handlers = [...oauthHandlers];
