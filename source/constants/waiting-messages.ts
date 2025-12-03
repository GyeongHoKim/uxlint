/**
 * Waiting Messages
 * Humorous messages displayed while waiting for LLM response
 *
 * @packageDocumentation
 */

/**
 * Collection of humorous waiting messages
 */
export const waitingMessages = [
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
	'🎯 Focusing on user experience...',
	'🚀 Accelerating analysis...',
	'🔬 Investigating interface patterns...',
	'📝 Documenting findings...',
	'🎪 Performing UX acrobatics...',
	'🌊 Riding the wave of user feedback...',
	'🎭 Acting out user scenarios...',
	'🔍 Sherlock Holmes mode: investigating UX mysteries...',
	'⚡ Processing at light speed...',
	'🎨 Painting a picture of your UX...',
	'🧪 Running UX experiments...',
	'📚 Reading the UX playbook...',
	'🎯 Aiming for perfect UX...',
	'🌟 Searching for UX gold...',
] as const;

/**
 * Get a random waiting message from the collection
 * @returns A randomly selected waiting message
 */
export function getRandomWaitingMessage(): string {
	return waitingMessages[Math.floor(Math.random() * waitingMessages.length)]!;
}
