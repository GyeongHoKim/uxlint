import {act, renderHook, type RenderHookResult} from '@testing-library/react';
import test from 'ava';
import {
	useConfigWizard,
	type UseConfigWizardResult,
} from '../../source/hooks/use-config-wizard.js';
import {
	LengthValidationError,
	RequiredFieldError,
	UrlValidationError,
} from '../../source/models/errors.js';

test('useConfigWizard initializes with empty state', t => {
	const {result}: RenderHookResult<UseConfigWizardResult, unknown> = renderHook(
		() => useConfigWizard(),
	);

	t.is(result.current.state.phase, 'intro');
	t.is(result.current.currentInput, '');
	t.is(result.current.error, undefined);
});

test('useConfigWizard.validateAndSetMainUrl validates correct URL', t => {
	const {result}: RenderHookResult<UseConfigWizardResult, unknown> = renderHook(
		() => useConfigWizard(),
	);

	act(() => {
		result.current.setCurrentInput('https://example.com');
	});

	act(() => {
		const success = result.current.validateAndSetMainUrl(
			result.current.currentInput,
		);
		t.true(success);
	});

	t.is(result.current.state.phase, 'sub-urls');
	t.is(result.current.error, undefined);
	t.is(result.current.currentInput, '');
});

test('useConfigWizard.validateAndSetMainUrl adds https:// prefix when missing', t => {
	const {result}: RenderHookResult<UseConfigWizardResult, unknown> = renderHook(
		() => useConfigWizard(),
	);

	act(() => {
		const success = result.current.validateAndSetMainUrl('example.com');
		t.true(success);
	});

	t.is(result.current.state.phase, 'sub-urls');
	t.true(
		result.current.state.phase === 'sub-urls' &&
			result.current.state.data.mainPageUrl.startsWith('https://example.com'),
	);
});

test('useConfigWizard.validateAndSetMainUrl throws RequiredFieldError for empty URL', t => {
	const {result}: RenderHookResult<UseConfigWizardResult, unknown> = renderHook(
		() => useConfigWizard(),
	);

	act(() => {
		const success = result.current.validateAndSetMainUrl('');
		t.false(success);
	});

	t.true(result.current.error instanceof RequiredFieldError);
});

test('useConfigWizard.validateAndSetMainUrl throws UrlValidationError for invalid URL', t => {
	const {result}: RenderHookResult<UseConfigWizardResult, unknown> = renderHook(
		() => useConfigWizard(),
	);

	act(() => {
		const success = result.current.validateAndSetMainUrl('http://');
		t.false(success);
	});

	t.true(result.current.error instanceof UrlValidationError);
});

test('useConfigWizard.validateAndAddSubUrl validates and adds sub URL', t => {
	const {result}: RenderHookResult<UseConfigWizardResult, unknown> = renderHook(
		() => useConfigWizard(),
	);

	act(() => {
		result.current.validateAndSetMainUrl('https://example.com');
	});

	act(() => {
		const success = result.current.validateAndAddSubUrl(
			'https://example.com/about',
		);
		t.true(success);
	});

	if (result.current.state.phase === 'sub-urls') {
		t.is(result.current.state.data.subPageUrls.length, 1);
		t.is(result.current.error, undefined);
	}
});

test('useConfigWizard.validateAndAddSubUrl handles empty input as done', t => {
	const {result}: RenderHookResult<UseConfigWizardResult, unknown> = renderHook(
		() => useConfigWizard(),
	);

	act(() => {
		result.current.validateAndSetMainUrl('https://example.com');
	});

	act(() => {
		const success = result.current.validateAndAddSubUrl('');
		t.true(success);
	});

	t.is(result.current.state.phase, 'pages');
});

test('useConfigWizard.validateAndAddPage validates feature description', t => {
	const {result}: RenderHookResult<UseConfigWizardResult, unknown> = renderHook(
		() => useConfigWizard(),
	);

	act(() => {
		result.current.validateAndSetMainUrl('https://example.com');
	});

	act(() => {
		const success = result.current.validateAndAddPage(
			'https://example.com',
			'This is a valid feature description with more than 10 characters',
		);
		t.true(success);
	});

	if (result.current.state.phase === 'pages') {
		t.is(result.current.state.data.pages.length, 1);
	}
});

test('useConfigWizard.validateAndAddPage throws for too short feature description', t => {
	const {result}: RenderHookResult<UseConfigWizardResult, unknown> = renderHook(
		() => useConfigWizard(),
	);

	act(() => {
		const success = result.current.validateAndAddPage(
			'https://example.com',
			'short',
		);
		t.false(success);
	});

	t.true(result.current.error instanceof LengthValidationError);
});

test('useConfigWizard.validateAndSetPersona validates persona description', t => {
	const {result}: RenderHookResult<UseConfigWizardResult, unknown> = renderHook(
		() => useConfigWizard(),
	);

	act(() => {
		result.current.validateAndSetMainUrl('https://example.com');
	});

	act(() => {
		result.current.validateAndAddSubUrl('');
	});

	act(() => {
		result.current.validateAndAddPage(
			'https://example.com',
			'This is a valid feature description with more than 10 characters',
		);
	});

	act(() => {
		result.current.dispatch({type: 'DONE_PAGES'});
	});

	act(() => {
		const success = result.current.validateAndSetPersona(
			'This is a valid persona description with more than 20 characters',
		);
		t.true(success);
	});

	t.is(result.current.state.phase, 'report');
});

test('useConfigWizard.validateAndSetPersona throws for too short persona', t => {
	const {result}: RenderHookResult<UseConfigWizardResult, unknown> = renderHook(
		() => useConfigWizard(),
	);

	act(() => {
		const success = result.current.validateAndSetPersona('short');
		t.false(success);
	});

	t.true(result.current.error instanceof LengthValidationError);
});

test('useConfigWizard.validateAndSetReportPath validates report path', t => {
	const {result}: RenderHookResult<UseConfigWizardResult, unknown> = renderHook(
		() => useConfigWizard(),
	);

	act(() => {
		result.current.validateAndSetMainUrl('https://example.com');
	});

	act(() => {
		result.current.validateAndAddSubUrl('');
	});

	act(() => {
		result.current.validateAndAddPage(
			'https://example.com',
			'This is a valid feature description with more than 10 characters',
		);
	});

	act(() => {
		result.current.dispatch({type: 'DONE_PAGES'});
	});

	act(() => {
		result.current.validateAndSetPersona(
			'This is a valid persona description with more than 20 characters',
		);
	});

	act(() => {
		const success = result.current.validateAndSetReportPath(
			'./report.json',
			'./default.json',
		);
		t.true(success);
	});

	t.is(result.current.state.phase, 'summary');
});

test('useConfigWizard.validateAndSetReportPath uses default path when empty', t => {
	const {result}: RenderHookResult<UseConfigWizardResult, unknown> = renderHook(
		() => useConfigWizard(),
	);

	act(() => {
		result.current.validateAndSetMainUrl('https://example.com');
	});

	act(() => {
		result.current.validateAndAddSubUrl('');
	});

	act(() => {
		result.current.validateAndAddPage(
			'https://example.com',
			'This is a valid feature description with more than 10 characters',
		);
	});

	act(() => {
		result.current.dispatch({type: 'DONE_PAGES'});
	});

	act(() => {
		result.current.validateAndSetPersona(
			'This is a valid persona description with more than 20 characters',
		);
	});

	act(() => {
		const success = result.current.validateAndSetReportPath(
			'',
			'./default.json',
		);
		t.true(success);
	});

	t.is(result.current.state.phase, 'summary');
});
