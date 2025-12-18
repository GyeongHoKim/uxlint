/**
 * User profile information derived from authentication.
 */
export type UserProfile = {
	id: string;
	email: string;
	name: string;
	organization?: string;
	picture?: string;
	emailVerified?: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

export function isUserProfile(value: unknown): value is UserProfile {
	if (!isRecord(value)) {
		return false;
	}

	return (
		typeof value['id'] === 'string' &&
		value['id'].length > 0 &&
		typeof value['email'] === 'string' &&
		value['email'].length > 0 &&
		typeof value['name'] === 'string' &&
		value['name'].length > 0 &&
		(value['organization'] === undefined ||
			typeof value['organization'] === 'string') &&
		(value['picture'] === undefined || typeof value['picture'] === 'string') &&
		(value['emailVerified'] === undefined ||
			typeof value['emailVerified'] === 'boolean')
	);
}
