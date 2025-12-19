import type {UserProfile} from './user-profile.js';
import type {TokenSet} from './token-set.js';

/**
 * Session metadata and timestamps
 */
export type SessionMetadata = {
	/** When the session was created (ISO 8601) */
	createdAt: string;

	/** When the session was last refreshed (ISO 8601) */
	lastRefreshedAt: string;

	/** When the access token expires (ISO 8601) */
	expiresAt: string;

	/** OAuth scopes granted */
	scopes: string[];

	/** Session ID (from server, if provided) */
	sessionId?: string;
};

/**
 * Complete authentication session state
 */
export type AuthenticationSession = {
	/** Schema version for migration */
	version: 1;

	/** User identity information */
	user: UserProfile;

	/** OAuth tokens */
	tokens: TokenSet;

	/** Session metadata */
	metadata: SessionMetadata;
};

/**
 * Type guard for valid AuthenticationSession
 */
export function isValidSession(
	session: unknown,
): session is AuthenticationSession {
	if (!session || typeof session !== 'object') {
		return false;
	}

	const s = session as Partial<AuthenticationSession>;

	return (
		s.user !== undefined &&
		typeof s.user.id === 'string' &&
		typeof s.user.email === 'string' &&
		s.tokens !== undefined &&
		typeof s.tokens.accessToken === 'string' &&
		typeof s.tokens.refreshToken === 'string' &&
		s.metadata !== undefined &&
		typeof s.metadata.expiresAt === 'string'
	);
}

/**
 * Check if session is expired or expiring soon
 * @param session - Authentication session to check
 * @param bufferMinutes - Minutes before expiry to consider "expired" (default: 5)
 * @returns true if session is expired or expiring within buffer window
 */
export function isSessionExpired(
	session: AuthenticationSession,
	bufferMinutes = 5,
): boolean {
	const expiryTime = new Date(session.metadata.expiresAt).getTime();
	const now = Date.now();
	const buffer = bufferMinutes * 60 * 1000;

	return now >= expiryTime - buffer;
}
