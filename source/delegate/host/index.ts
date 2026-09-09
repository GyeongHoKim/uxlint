/**
 * The host agents delegate mode can drive.
 *
 * A registry rather than a switch, so that the properties every adapter has to
 * satisfy -- a read-only posture, a session carried in the environment -- can
 * be asserted over all of them at once, and a new adapter cannot be added
 * without inheriting those assertions.
 *
 * @packageDocumentation
 */

import type {HostAgentAdapter} from './types.js';
import {claudeCode} from './claude-code.js';

/**
 * Every supported host agent.
 */
export const hostAdapters: readonly HostAgentAdapter[] = [claudeCode];
