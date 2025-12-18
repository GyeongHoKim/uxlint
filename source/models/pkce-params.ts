/**
 * OAuth 2.0 PKCE parameters.
 */
export type PKCEParameters = {
	codeVerifier: string;
	codeChallenge: string;
	codeChallengeMethod: 'S256';
	state: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

export function isPKCEParameters(value: unknown): value is PKCEParameters {
	if (!isRecord(value)) {
		return false;
	}

	return (
		typeof value['codeVerifier'] === 'string' &&
		value['codeVerifier'].length >= 43 &&
		value['codeVerifier'].length <= 128 &&
		typeof value['codeChallenge'] === 'string' &&
		value['codeChallenge'].length > 0 &&
		value['codeChallengeMethod'] === 'S256' &&
		typeof value['state'] === 'string' &&
		value['state'].length > 0
	);
}
