/**
 * The browser server's real replies to the measurement tools.
 *
 * Captured from `chrome-devtools-mcp@1.7.0` driving the fixtures in
 * `specs/007-deterministic-audit/probe/`, not written by hand. Feature 006
 * shipped two defects behind doubles that were friendlier than the thing they
 * stood in for; a parser tested against invented text tests the invention.
 *
 * @packageDocumentation
 */

import {mcpError, mcpResult} from './mcp-result.js';

/**
 * A `lighthouse_audit` reply in the mode this feature uses.
 *
 * Note `URL: undefined` -- snapshot mode does not report the page's URL. Any
 * parser that reads that line gets the string "undefined".
 */
export const auditSnapshotReply =
	'## Lighthouse Audit Results\nMode: snapshot\nDevice: desktop\nURL: undefined\n### Category Scores\n- Accessibility: 67 (accessibility)\n- Best Practices: 100 (best-practices)\n- SEO: 50 (seo)\n- Agentic Browsing: 50 (agentic-browsing)\n### Audit Summary\nPassed: 14\nFailed: 7\nTotal Timing: 1485.48ms\n### Reports\n- /tmp/chrome-devtools-mcp-JkRQ4Q/report.json\n- /tmp/chrome-devtools-mcp-eGuIxy/report.html';

/**
 * The same audit in the tool's default `navigation` mode, which reloads.
 *
 * Kept so a test can show the two modes agree on accessibility while the
 * companion scores differ -- the evidence behind FR-012a.
 */
export const auditNavigationReply =
	'## Lighthouse Audit Results\nMode: navigation\nDevice: desktop\nURL: http://127.0.0.1:38649/\n### Category Scores\n- Accessibility: 67 (accessibility)\n- Best Practices: 100 (best-practices)\n- SEO: 75 (seo)\n- Agentic Browsing: 67 (agentic-browsing)\n### Audit Summary\nPassed: 34\nFailed: 7\nTotal Timing: 4308.8ms\n### Reports\n- /tmp/chrome-devtools-mcp-isONzs/report.json\n- /tmp/chrome-devtools-mcp-4AXdDY/report.html';

/** The audit reply as it arrives through the MCP adapter. */
export const auditSnapshotResult = () => mcpResult(auditSnapshotReply);

/**
 * A failed audit.
 *
 * The server reports failure by *returning* this, not by throwing.
 */
export const auditFailedResult = () =>
	mcpError('Protocol error (Target.setDiscoverTargets): Target closed');

/**
 * Replies that cannot be parsed.
 *
 * Each must degrade to a not-taken measurement rather than raise: a wording
 * change in a future server version should cost the report a number, not cost
 * the run its analysis.
 */
export const malformedAuditReplies = {
	/** No `### Reports` section, so there is no report to read */
	noReportSection: auditSnapshotReply.slice(
		0,
		auditSnapshotReply.indexOf('### Reports'),
	),

	/** A report path that does not exist on disk */
	missingReportFile: auditSnapshotReply.replace(
		/- \/[^\n]*\.json/,
		'- /tmp/chrome-devtools-mcp-gone/report.json',
	),

	/** Nothing resembling the expected reply at all */
	unrelated: 'The performance trace has been stopped.',
};
