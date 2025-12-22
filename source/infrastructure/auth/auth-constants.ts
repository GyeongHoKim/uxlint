/**
 * Authentication and OAuth flow constants
 * Centralized configuration values for timeouts, buffers, and limits
 */

/**
 * OAuth flow timeout in milliseconds (5 minutes)
 * Maximum time to wait for user to complete OAuth authorization
 */
export const OAUTH_FLOW_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * HTTP request timeout in milliseconds (30 seconds)
 * Maximum time to wait for HTTP requests to complete
 */
export const HTTP_REQUEST_TIMEOUT_MS = 30 * 1000;

/**
 * Token refresh buffer in minutes (5 minutes)
 * Refresh tokens this many minutes before they expire
 */
export const TOKEN_REFRESH_BUFFER_MINUTES = 5;

/**
 * Maximum port range size for callback server
 * Limits the number of ports to try when starting callback server
 */
export const MAX_PORT_RANGE_SIZE = 100;

/**
 * Maximum authorization code length (2048 characters)
 * OAuth authorization codes should not exceed this length
 */
export const MAX_AUTH_CODE_LENGTH = 2048;

/**
 * Maximum state parameter length (2048 characters)
 * OAuth state parameters should not exceed this length
 */
export const MAX_STATE_LENGTH = 2048;
