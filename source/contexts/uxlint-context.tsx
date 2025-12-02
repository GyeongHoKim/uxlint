/**
 * React Context for uxlint state machine
 * Provides global state management using XState actor context
 */
import {createActorContext} from '@xstate/react';
import {uxlintMachine} from '../machines/uxlint-machine.js';

/**
 * Context for the uxlint state machine
 * Provides:
 * - Provider: Wrap your app to provide the machine context
 * - useSelector: Subscribe to machine state changes
 * - useActorRef: Get reference to send events to the machine
 */
export const UxlintMachineContext = createActorContext(uxlintMachine);

/**
 * Hook to get the current machine state value
 * @returns The current state value (e.g., 'idle', {tty: 'wizard'}, etc.)
 */
export function useUxlintState() {
	return UxlintMachineContext.useSelector(state => state.value);
}

/**
 * Hook to get the current machine context
 * @returns The current machine context with all state data
 */
export function useUxlintContext() {
	return UxlintMachineContext.useSelector(state => state.context);
}

/**
 * Hook to get the actor reference for sending events
 * @returns The actor reference to send events
 */
export function useUxlintActor() {
	return UxlintMachineContext.useActorRef();
}

/**
 * Helper to check if state matches a nested state path
 * @param stateValue - Current state value from snapshot
 * @param path - Dot-separated path to check (e.g., 'tty.wizard')
 * @returns True if the state matches the path
 */
export function matchesStatePath(stateValue: unknown, path: string): boolean {
	const parts = path.split('.');
	const firstPart = parts[0];

	if (!firstPart) {
		return false;
	}

	if (parts.length === 1) {
		return stateValue === firstPart;
	}

	if (typeof stateValue === 'object' && stateValue !== null) {
		const nested = (stateValue as Record<string, unknown>)[firstPart];
		if (nested) {
			return matchesStatePath(nested, parts.slice(1).join('.'));
		}
	}

	return false;
}
