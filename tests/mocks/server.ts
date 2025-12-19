/**
 * MSW server setup for Node.js environment.
 * This server intercepts HTTP requests during tests.
 *
 * Usage in test files:
 * ```typescript
 * import test from 'ava';
 * import { server } from '../../mocks/server.js';
 * import { oauthErrorHandlers } from '../../mocks/handlers/index.js';
 *
 * test.before(() => {
 *   server.listen({ onUnhandledRequest: 'error' });
 * });
 *
 * test.after(() => {
 *   server.close();
 * });
 *
 * test.afterEach(() => {
 *   server.resetHandlers();
 * });
 *
 * test('my test', async (t) => {
 *   server.use(oauthErrorHandlers.tokenNetworkError());
 *   // ... test code
 * });
 * ```
 */
import {setupServer} from 'msw/node';
import {handlers} from './handlers/index.js';

/**
 * MSW server instance configured with default handlers.
 * Use server.use() in individual tests to add or override handlers.
 */
export const server = setupServer(...handlers);
