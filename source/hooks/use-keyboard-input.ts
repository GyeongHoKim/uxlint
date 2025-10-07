/**
 * UseKeyboardInput hook - Handle keyboard input events for terminal UI
 * Provides keyboard event handling for Ink-based input components
 */

import process from 'node:process';
import {useInput} from 'ink';
import {useEffect, useState} from 'react';

export type KeyboardHandlers = {
	readonly isLoading: boolean;
	readonly isDisabled?: boolean;
	readonly onSubmit?: (value: string) => void;
	readonly onInterrupt?: () => void;
};

/**
 * Handle keyboard input events for terminal input components
 * Manages character input, backspace, enter, and interruption handling
 */
export function useKeyboardInput(handlers: KeyboardHandlers) {
	const {isLoading, isDisabled, onSubmit, onInterrupt} = handlers;
	const [isTyping, setIsTyping] = useState(false);
	const [value, setValue] = useState('');

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
		if (isLoading || isDisabled) {
			return;
		}

		setIsTyping(true);

		if (key.return && !key.shift && onSubmit) {
			setValue('');
			setIsTyping(false);
			onSubmit(value);
			return;
		}

		if (key.ctrl && input === 'c') {
			if (onInterrupt) {
				onInterrupt();
			} else {
				process.exit(0);
			}

			return;
		}

		setValue(previous => previous + input);
	});

	return {isTyping, value};
}
