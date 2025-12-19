/**
 * User identity information from OIDC ID token or /userinfo endpoint
 */
export type UserProfile = {
	/** Unique user identifier */
	id: string;

	/** User's email address */
	email: string;

	/** User's display name */
	name: string;

	/** Organization name (if applicable) */
	organization?: string;

	/** Profile picture URL (optional) */
	picture?: string;

	/** Email verification status */
	emailVerified: boolean;
};
