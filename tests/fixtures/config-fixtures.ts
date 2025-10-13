/**
 * Config Test Fixtures
 * Mock UxLintConfig data for testing
 *
 * @packageDocumentation
 */

import type {UxLintConfig} from '../../source/models/config.js';

/**
 * Mock UxLint configuration with 2 pages and 2 personas
 *
 * @example
 * ```typescript
 * const config = mockUxLintConfig;
 * expect(config.pages).toHaveLength(2);
 * expect(config.personas).toHaveLength(2);
 * ```
 */
export const mockUxLintConfig: UxLintConfig = {
	mainPageUrl: 'https://example.com',
	subPageUrls: ['https://example.com/about'],
	pages: [
		{
			url: 'https://example.com',
			features: 'Login form with email and password inputs, OAuth integration',
		},
		{
			url: 'https://example.com/about',
			features: 'About page with company history and team member profiles',
		},
	],
	personas: [
		'Screen reader user who relies on keyboard navigation and semantic HTML',
		'Mobile user on slow 3G connection with limited data plan',
	],
	report: {
		output: './ux-report.md',
	},
};

/**
 * Mock UxLint configuration with 3 pages and multiple personas
 */
export const mockLargeUxLintConfig: UxLintConfig = {
	mainPageUrl: 'https://example.com',
	subPageUrls: ['https://example.com/login', 'https://example.com/dashboard'],
	pages: [
		{
			url: 'https://example.com',
			features:
				'Homepage with hero banner, feature highlights, and CTA buttons',
		},
		{
			url: 'https://example.com/login',
			features:
				'Login form with email/password, social OAuth, and forgot password link',
		},
		{
			url: 'https://example.com/dashboard',
			features:
				'User dashboard with analytics charts, notification panel, and settings',
		},
	],
	personas: [
		'Screen reader user who relies on keyboard navigation and semantic HTML',
		'Mobile user on slow 3G connection with limited data plan',
		'Low vision user who uses screen magnification and high contrast',
		'Elderly user who is not tech-savvy and prefers simple interfaces',
	],
	report: {
		output: './reports/ux-analysis.md',
	},
};

/**
 * Mock UxLint configuration with single page
 */
export const mockSinglePageConfig: UxLintConfig = {
	mainPageUrl: 'https://example.com',
	subPageUrls: [],
	pages: [
		{
			url: 'https://example.com',
			features: 'Single-page application with React and modern UI components',
		},
	],
	personas: [
		'Power user who expects keyboard shortcuts and efficient workflows',
	],
	report: {
		output: './ux-report.md',
	},
};

/**
 * Mock UxLint configuration for e-commerce site
 */
export const mockEcommerceConfig: UxLintConfig = {
	mainPageUrl: 'https://shop.example.com',
	subPageUrls: [
		'https://shop.example.com/products',
		'https://shop.example.com/cart',
		'https://shop.example.com/checkout',
	],
	pages: [
		{
			url: 'https://shop.example.com',
			features:
				'Homepage with product carousel, featured items, and search bar',
		},
		{
			url: 'https://shop.example.com/products',
			features:
				'Product listing page with filters, sorting, and pagination controls',
		},
		{
			url: 'https://shop.example.com/cart',
			features:
				'Shopping cart with quantity controls, coupon input, and checkout button',
		},
		{
			url: 'https://shop.example.com/checkout',
			features:
				'Multi-step checkout with shipping, payment, and order confirmation',
		},
	],
	personas: [
		'First-time buyer who is unfamiliar with the site and needs clear guidance',
		'International customer who may face language barriers or currency confusion',
		'Mobile shopper who wants to complete purchase quickly on-the-go',
	],
	report: {
		output: './ecommerce-ux-report.md',
	},
};

/**
 * Mock UxLint configuration with minimal features
 */
export const mockMinimalConfig: UxLintConfig = {
	mainPageUrl: 'https://minimal.example.com',
	subPageUrls: [],
	pages: [
		{
			url: 'https://minimal.example.com',
			features: 'Simple landing page with contact form',
		},
	],
	personas: ['General web user with average technical skills'],
	report: {
		output: './minimal-report.md',
	},
};
