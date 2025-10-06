/**
 * UseKeyboardInput hook - Handle keyboard input events for terminal UI
 * Provides keyboard event handling for Ink-based input components
 */

import {useInput} from 'ink';
import {useState, useEffect} from 'react';

export type KeyboardHandlers = {
	readonly isLoading: boolean;
	readonly value: string;
	readonly onChange: (value: string) => void;
	readonly onSubmit: () => void;
};

/**
 * Handle keyboard input events for terminal input components
 * Manages character input, backspace, enter, and interruption handling
 */
export function useKeyboardInput(handlers: KeyboardHandlers) {
	const {isLoading, value, onChange, onSubmit} = handlers;
	const [isTyping, setIsTyping] = useState(false);

	// Debounce typing state - set to false after 1 second of no input
	useEffect(() => {
		if (!value) {
			setIsTyping(false);
			return;
		}

		const timeout = setTimeout(() => {
			setIsTyping(false);
		}, 1000);

		return () => {
			clearTimeout(timeout);
		};
	}, [value]);

	useInput((input, key) => {
		if (isLoading) {
			return;
		}

		// Set typing state on any input
		setIsTyping(true);

		if (key.return) {
			setIsTyping(false); // Clear typing state on submit
			onSubmit();
			return;
		}

		if (key.backspace || key.delete) {
			onChange(value.slice(0, -1));
			return;
		}

		if (key.ctrl && input === 'c') {
			throw new Error('User interrupted');
		}

		// Handle regular character input
		if (input && !key.ctrl && !key.meta) {
			onChange(value + input);
		}
	});

	return {isTyping};
}
