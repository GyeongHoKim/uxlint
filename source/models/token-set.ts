/**
 * OAuth token response persisted as part of an authentication session.
 */
export type TokenSet = {
	accessToken: string;
	tokenType: 'Bearer';
	expiresIn: number;
	refreshToken: string;
	idToken?: string;
	scope?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

export function isTokenSet(value: unknown): value is TokenSet {
	if (!isRecord(value)) {
		return false;
	}

	return (
		typeof value['accessToken'] === 'string' &&
		value['accessToken'].length > 0 &&
		value['tokenType'] === 'Bearer' &&
		typeof value['expiresIn'] === 'number' &&
		Number.isFinite(value['expiresIn']) &&
		value['expiresIn'] > 0 &&
		typeof value['refreshToken'] === 'string' &&
		value['refreshToken'].length > 0 &&
		(value['idToken'] === undefined || typeof value['idToken'] === 'string') &&
		(value['scope'] === undefined || typeof value['scope'] === 'string')
	);
}
