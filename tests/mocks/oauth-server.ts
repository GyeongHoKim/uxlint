import {http, HttpResponse} from 'msw';

export const oauthServerHandlers = {
	tokenSuccess: http.post(
		'https://app.uxlint.org/auth/v1/oauth/token',
		async ({request}) => {
			const bodyText = await request.text();
			const body = new URLSearchParams(bodyText);
			const grantType = body.get('grant_type');

			if (grantType === 'authorization_code') {
				return HttpResponse.json({
					access_token: 'access',
					token_type: 'Bearer',
					expires_in: 3600,
					refresh_token: 'refresh',
					id_token: 'header.payload.sig',
					scope: 'openid profile email',
				});
			}

			if (grantType === 'refresh_token') {
				return HttpResponse.json({
					access_token: 'access-2',
					token_type: 'Bearer',
					expires_in: 3600,
					refresh_token: 'refresh-2',
					scope: 'openid profile email',
				});
			}

			return HttpResponse.json(
				{error: 'unsupported_grant_type', error_description: 'bad grant'},
				{status: 400},
			);
		},
	),

	tokenError: http.post(
		'https://app.uxlint.org/auth/v1/oauth/token',
		async () => {
			return HttpResponse.json(
				{error: 'invalid_request', error_description: 'nope'},
				{status: 400},
			);
		},
	),

	openIdConfig: http.get(
		'https://app.uxlint.org/.well-known/openid-configuration',
		async () => {
			return HttpResponse.json({issuer: 'https://app.uxlint.org'});
		},
	),
};
