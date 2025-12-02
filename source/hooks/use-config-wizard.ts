/**
 * UseConfigWizard Hook
 * React hook for managing config wizard form state and validation
 * Handles all form inputs, validation, and error states using Zod
 */

import {useCallback, useState} from 'react';
import {z} from 'zod';
import type {Page} from '../models/config.js';
import {
	LengthValidationError,
	RequiredFieldError,
	UrlValidationError,
} from '../models/errors.js';
import type {WizardState} from '../models/wizard-state.js';
import {useWizard} from './use-wizard.js';

/**
 * Validation result type
 */
type ValidationResult<T = string> =
	| {success: true; value: T}
	| {success: false; error: Error};

/**
 * Convert Zod error to custom validation error
 * Returns specific error types when possible, otherwise returns ZodError directly
 */
function convertZodError(
	error: z.ZodError,
	fieldName: string,
	value: string,
): Error {
	const firstIssue = error.issues[0];
	if (!firstIssue) {
		// Return ZodError directly if no issues
		return error;
	}

	const message = firstIssue.message ?? 'Validation failed';

	// Handle URL validation errors - check for URL-related messages
	if (
		message.includes('URL') ||
		message.includes('url') ||
		firstIssue.code === 'invalid_format'
	) {
		return new UrlValidationError(message, value, 'format');
	}

	// Handle required field errors
	if (
		firstIssue.code === 'invalid_type' &&
		'received' in firstIssue &&
		(firstIssue.received === 'undefined' || firstIssue.received === 'null')
	) {
		return new RequiredFieldError(fieldName);
	}

	// Handle length validation errors
	if (firstIssue.code === 'too_small' && 'minimum' in firstIssue) {
		const min = Number(firstIssue.minimum ?? 0);
		return new LengthValidationError(message, {
			actualLength: value?.trim().length ?? 0,
			expectedLength: min,
			lengthType: 'min',
			value,
			fieldName,
		});
	}

	if (firstIssue.code === 'too_big' && 'maximum' in firstIssue) {
		const max = Number(firstIssue.maximum ?? 0);
		return new LengthValidationError(message, {
			actualLength: value.trim().length,
			expectedLength: max,
			lengthType: 'max',
			value,
			fieldName,
		});
	}

	// For other errors, return ZodError directly
	return error;
}

/**
 * Form state for current input
 */
type FormState = {
	readonly currentInput: string;
	readonly error: Error | undefined;
};

/**
 * Hook return type
 */
export type UseConfigWizardResult = {
	readonly state: WizardState;
	readonly currentInput: string;
	readonly error: Error | undefined;
	readonly setCurrentInput: (value: string) => void;
	readonly validateAndSetMainUrl: (value: string) => boolean;
	readonly validateAndAddSubUrl: (value: string) => boolean;
	readonly validateAndAddPage: (url: string, value: string) => boolean;
	readonly validateAndSetPersona: (value: string) => boolean;
	readonly validateAndSetReportPath: (
		value: string,
		defaultPath: string,
	) => boolean;
	readonly dispatch: ReturnType<typeof useWizard>['dispatch'];
	readonly setError: (error: Error | undefined) => void;
};

/**
 * Validate URL format and structure using Zod
 */
function validateUrl(value: string): ValidationResult {
	const trimmedValue = value?.trim() ?? '';

	if (trimmedValue.length === 0) {
		return {success: false, error: new RequiredFieldError('URL')};
	}

	// Add protocol if missing
	const urlToTest =
		trimmedValue.startsWith('http://') || trimmedValue.startsWith('https://')
			? trimmedValue
			: `https://${trimmedValue}`;

	// Use Zod for URL validation
	const urlSchema = z
		.string()
		.pipe(z.url())
		.refine(
			url => {
				try {
					const parsedUrl = new URL(url);
					return ['http:', 'https:'].includes(parsedUrl.protocol);
				} catch {
					return false;
				}
			},
			{message: 'URL must use HTTP or HTTPS protocol'},
		)
		.refine(
			url => {
				try {
					const parsedUrl = new URL(url);
					return Boolean(parsedUrl.hostname && parsedUrl.hostname.length > 0);
				} catch {
					return false;
				}
			},
			{message: 'URL must have a valid hostname'},
		)
		.transform(url => {
			// Return normalized URL
			try {
				return new URL(url).toString();
			} catch {
				return url;
			}
		});

	try {
		const validated = urlSchema.parse(urlToTest);
		return {success: true, value: validated};
	} catch (error) {
		if (error instanceof z.ZodError) {
			return {
				success: false,
				error: convertZodError(error, 'URL', trimmedValue),
			};
		}

		return {
			success: false,
			error: new UrlValidationError(
				'Please enter a valid URL',
				trimmedValue,
				'format',
			),
		};
	}
}

/**
 * Validate required field with minimum length using Zod
 */
function validateRequiredWithMinLength(
	value: string,
	fieldName: string,
	minLength: number,
): ValidationResult {
	const schema = z
		.string()
		.min(1, `${fieldName} is required`)
		.min(minLength, `${fieldName} must be at least ${minLength} characters`)
		.trim()
		.transform(value_ => value_.trim());

	try {
		const validated = schema.parse(value);
		return {success: true, value: validated};
	} catch (error) {
		if (error instanceof z.ZodError) {
			return {
				success: false,
				error: convertZodError(error, fieldName, value),
			};
		}

		const trimmed = value?.trim() ?? '';
		if (trimmed.length === 0) {
			return {success: false, error: new RequiredFieldError(fieldName)};
		}

		return {
			success: false,
			error: new LengthValidationError(
				`${fieldName} must be at least ${minLength} characters`,
				{
					actualLength: trimmed.length,
					expectedLength: minLength,
					lengthType: 'min',
					value: trimmed,
					fieldName,
				},
			),
		};
	}
}

/**
 * Validate file path format using Zod
 */
function validateFilePath(value: string, fieldName: string): ValidationResult {
	const invalidChars = /[<>"|?*]/;
	const schema = z
		.string()
		.min(1, `${fieldName} is required`)
		.refine(path => !invalidChars.test(path), {
			message: `${fieldName} contains invalid characters. Avoid using < > " | ? * in file paths`,
		})
		.trim()
		.transform(value_ => value_.trim());

	try {
		const validated = schema.parse(value);
		return {success: true, value: validated};
	} catch (error) {
		if (error instanceof z.ZodError) {
			return {
				success: false,
				error: convertZodError(error, fieldName, value),
			};
		}

		const trimmed = value?.trim() ?? '';
		if (trimmed.length === 0) {
			return {success: false, error: new RequiredFieldError(fieldName)};
		}

		if (invalidChars.test(trimmed)) {
			// Create a ZodError for invalid file path
			const zodError = new z.ZodError([
				{
					code: 'custom',
					message: `${fieldName} contains invalid characters. Avoid using < > " | ? * in file paths`,
					path: [],
				},
			]);
			return {
				success: false,
				error: zodError,
			};
		}

		return {success: true, value: trimmed};
	}
}

/**
 * Use config wizard hook
 * Manages form state, validation, and wizard state
 *
 * @returns Form state, validation functions, and wizard dispatch
 */
export function useConfigWizard(): UseConfigWizardResult {
	const {state, dispatch} = useWizard();
	const [formState, setFormState] = useState<FormState>({
		currentInput: '',
		error: undefined,
	});

	const setCurrentInput = useCallback((value: string) => {
		setFormState(previous => ({
			...previous,
			currentInput: value,
			error: undefined,
		}));
	}, []);

	const setError = useCallback((error: Error | undefined) => {
		setFormState(previous => ({...previous, error}));
	}, []);

	const validateAndSetMainUrl = useCallback(
		(value: string): boolean => {
			const result = validateUrl(value);
			if (result.success) {
				dispatch({type: 'SET_MAIN_URL', payload: result.value});
				setFormState({currentInput: '', error: undefined});
				return true;
			}

			setFormState(previous => ({
				...previous,
				error: result.success ? undefined : result.error,
			}));
			return false;
		},
		[dispatch],
	);

	const validateAndAddSubUrl = useCallback(
		(value: string): boolean => {
			// Empty value means user is done
			if (!value.trim()) {
				dispatch({type: 'DONE_SUB_URLS'});
				setFormState({currentInput: '', error: undefined});
				return true;
			}

			const result = validateUrl(value);
			if (result.success && state.phase === 'sub-urls') {
				// Check for duplicates
				const allUrls = [state.data.mainPageUrl, ...state.data.subPageUrls];
				if (allUrls.includes(result.value)) {
					setFormState(previous => ({
						...previous,
						error: new Error('This URL has already been added'),
					}));
					return false;
				}

				dispatch({type: 'ADD_SUB_URL', payload: result.value});
				setFormState({currentInput: '', error: undefined});
				return true;
			}

			setFormState(previous => ({
				...previous,
				error: result.success ? undefined : result.error,
			}));
			return false;
		},
		[dispatch, state],
	);

	const validateAndAddPage = useCallback(
		(url: string, value: string): boolean => {
			const result = validateRequiredWithMinLength(
				value,
				'Feature description',
				10,
			);
			if (result.success) {
				const page: Page = {
					url,
					features: result.value,
				};
				dispatch({type: 'ADD_PAGE', payload: page});
				setFormState({currentInput: '', error: undefined});
				return true;
			}

			setFormState(previous => ({
				...previous,
				error: result.success ? undefined : result.error,
			}));
			return false;
		},
		[dispatch],
	);

	const validateAndSetPersona = useCallback(
		(value: string): boolean => {
			const result = validateRequiredWithMinLength(
				value,
				'Persona description',
				20,
			);
			if (result.success) {
				dispatch({type: 'SET_PERSONA', payload: result.value});
				setFormState({currentInput: '', error: undefined});
				return true;
			}

			setFormState(previous => ({
				...previous,
				error: result.success ? undefined : result.error,
			}));
			return false;
		},
		[dispatch],
	);

	const validateAndSetReportPath = useCallback(
		(value: string, defaultPath: string): boolean => {
			const pathToValidate = value.trim() || defaultPath;
			const result = validateFilePath(pathToValidate, 'Report output path');
			if (result.success) {
				dispatch({type: 'SET_REPORT_OUTPUT', payload: result.value});
				dispatch({type: 'PROCEED_TO_SUMMARY'});
				setFormState({currentInput: '', error: undefined});
				return true;
			}

			setFormState(previous => ({
				...previous,
				error: result.success ? undefined : result.error,
			}));
			return false;
		},
		[dispatch],
	);

	return {
		state,
		currentInput: formState.currentInput,
		error: formState.error,
		setCurrentInput,
		validateAndSetMainUrl,
		validateAndAddSubUrl,
		validateAndAddPage,
		validateAndSetPersona,
		validateAndSetReportPath,
		dispatch,
		setError,
	};
}
