import {OpenBrowserService} from './browser-impl.js';
import {CallbackServer} from './callback-server.js';
import {KeytarKeychainService} from './keychain-impl.js';
import {getOAuthConfig} from './oauth-config.js';
import {OAuthFlow} from './oauth-flow.js';
import {OAuthHttpClient} from './oauth-http-client.js';
import {TokenManager} from './token-manager.js';
import {UXLintClient} from './uxlint-client.js';

const httpClient = new OAuthHttpClient();
const callbackServer = new CallbackServer();
const browserService = new OpenBrowserService();
const keychain = new KeytarKeychainService();
const tokenManager = new TokenManager(keychain);
const oauthFlow = new OAuthFlow(httpClient, callbackServer, browserService);
const config = getOAuthConfig();

export const uxlintClient: UXLintClient = new UXLintClient(
	tokenManager,
	oauthFlow,
	httpClient,
	config,
);
