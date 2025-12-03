/**
 * Waiting Messages Contract
 * Defines the interface for waiting messages displayed during LLM analysis
 *
 * @packageDocumentation
 */

/**
 * A humorous or informative message displayed while waiting for LLM response
 */
export type WaitingMessage = string;

/**
 * Category of waiting message for organization
 */
export type WaitingMessageCategory =
	| 'ai-humor'
	| 'ux-analysis'
	| 'encouragement'
	| 'general';

/**
 * Waiting messages module interface
 */
export interface WaitingMessagesModule {
	/**
	 * All available waiting messages
	 */
	readonly messages: readonly WaitingMessage[];

	/**
	 * Get a random message from the collection
	 * @returns A randomly selected waiting message
	 */
	getRandomMessage(): WaitingMessage;
}

/**
 * Example messages for reference (actual implementation in source/constants/)
 */
export const exampleMessages: readonly WaitingMessage[] = [
	'🤔 AI is pondering the mysteries of your UI...',
	'🔍 Examining every pixel with care...',
	'☕ The AI is taking a coffee break... just kidding!',
	'🧠 Neural networks are firing up...',
	'✨ Sprinkling some UX magic...',
	'📊 Crunching usability numbers...',
	'🎨 Appreciating your design choices...',
	'🤖 Beep boop... analyzing human interfaces...',
	'💡 Looking for UX insights...',
	'🔮 Consulting the UX oracle...',
] as const;

