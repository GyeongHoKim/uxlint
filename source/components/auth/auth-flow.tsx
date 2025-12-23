import process from 'node:process';
import {Spinner} from '@inkjs/ui';
import {Box, Text} from 'ink';
import {useLogout} from '../../hooks/use-logout.js';
import {logger} from '../../infrastructure/logger.js';
import {AuthStatus} from './auth-status.js';
import {LoginFlow} from './login-flow.js';

type AuthFlowProps = {
	readonly command?: string;
	readonly onAuthError: () => never;
};

const AUTH_COMMANDS = ['login', 'logout', 'status'];
export type AuthCommand = (typeof AUTH_COMMANDS)[number];
export const isAuthCommand = (command: unknown): command is AuthCommand => {
	if (typeof command !== 'string') {
		return false;
	}

	return AUTH_COMMANDS.includes(command);
};

export function AuthFlow({command, onAuthError}: AuthFlowProps) {
	const {logout, isLoading, isSuccess, error} = useLogout();
	if (!isAuthCommand(command)) {
		logger.error(`Invalid auth command: ${command}`);
		return (
			<Box flexDirection="column">
				<Text color="red">{`Invalid auth command: ${command}`}</Text>
				<Text>{`Available commands: ${AUTH_COMMANDS.join(', ')}`}</Text>
			</Box>
		);
	}

	switch (command) {
		case 'login': {
			return (
				<LoginFlow
					onComplete={profile => {
						logger.info('Login successful', {
							email: profile.email,
							name: profile.name,
						});
						process.removeListener('SIGINT', onAuthError);
						process.exit(0);
					}}
					onError={error => {
						logger.error('Login failed', {
							error: error.message,
						});
						process.removeListener('SIGINT', onAuthError);
						process.exit(1);
					}}
				/>
			);
		}

		case 'status': {
			return (
				<AuthStatus
					onComplete={() => {
						logger.info('Status check complete');
						process.removeListener('SIGINT', onAuthError);
						process.exit(0);
					}}
				/>
			);
		}

		case 'logout': {
			void logout();
			break;
		}

		default: {
			break;
		}
	}

	if (isLoading) {
		return (
			<Box>
				<Spinner label="Logging out..." />
			</Box>
		);
	}

	if (isSuccess) {
		logger.info('Logout successful');
		process.removeListener('SIGINT', onAuthError);
		setTimeout(() => process.exit(0), 1000);
		return (
			<Box>
				<Text color="green">Logged out successfully</Text>
			</Box>
		);
	}

	if (error) {
		logger.error('Logout failed', {
			error: error.message,
		});
		process.removeListener('SIGINT', onAuthError);
		setTimeout(() => process.exit(1), 1000);
		return (
			<Box>
				<Text color="red">Failed to logout: {error.message}</Text>
			</Box>
		);
	}

	return null;
}
