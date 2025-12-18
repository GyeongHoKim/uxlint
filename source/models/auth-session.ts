import {isTokenSet, type TokenSet} from './token-set.js';
import {isUserProfile, type UserProfile} from './user-profile.js';

export type AuthenticationSession = {
	version: 1;
	user: UserProfile;
	tokens: TokenSet;
	metadata: {
		createdAt: string;
		expiresAt: string;
	};
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function isIsoDateString(value: unknown): value is string {
	if (typeof value !== 'string' || value.length === 0) {
		return false;
	}

	const time = Date.parse(value);
	return Number.isFinite(time);
}

export function isValidSession(value: unknown): value is AuthenticationSession {
	if (!isRecord(value)) {
		return false;
	}

	if (value['version'] !== 1) {
		return false;
	}

	if (!isUserProfile(value['user'])) {
		return false;
	}

	if (!isTokenSet(value['tokens'])) {
		return false;
	}

	const {metadata} = value;
	if (!isRecord(metadata)) {
		return false;
	}

	const {createdAt, expiresAt} = metadata;
	return isIsoDateString(createdAt) && isIsoDateString(expiresAt);
}

/**
 * Returns true if session is expired or will expire within bufferMs.
 */
export function isSessionExpired(
	session: AuthenticationSession,
	bufferMs = 0,
): boolean {
	const expiresAt = Date.parse(session.metadata.expiresAt);
	return expiresAt <= Date.now() + bufferMs;
}
