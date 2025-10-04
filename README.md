# uxlint

AI-powered UX review CLI for web apps — guided by your product personas and key features.

## Overview

uxlint is a CLI tool that generates a UX evaluation report for a target web application using AI. It takes your configuration file as input — including the main and sub page URLs, freeform descriptions of key features on each page, and your customer personas — and outputs a persona-aware, task-oriented UX report to the path you specify.

Designed for frontend engineers who want quick, actionable UX feedback aligned with real user contexts.

## Key capabilities

- Persona-aware analysis using your provided persona descriptions
- Page-by-page evaluation guided by your freeform feature descriptions
- Actionable recommendations prioritized for frontend teams
- Single command execution with zero boilerplate beyond one config file

## Quick start

1. Create a configuration file in your project root named either `uxlintrc.yml` or `uxlintrc.json`.

2. Run the CLI:

```bash
npx uxlint
```

The CLI reads the configuration file in the current working directory and writes the UX report to the configured output path.

## Configuration

uxlint reads one of the following files from the current working directory (CWD):

- `uxlintrc.yml`
- `uxlintrc.json`

### Schema

Required fields are marked as required. All text fields accept natural language.

- `mainPageUrl` (string, required): The primary entry URL of your app.
- `subPageUrls` (string[], required): Additional pages to analyze.
- `pages` (array, required): Per-page descriptions to guide analysis.
  - `url` (string, required): Page URL, must match one of the listed URLs.
  - `features` (string, required): Freeform description of key tasks/flows/components on the page.
- `personas` (string[], required): One or more persona descriptions. Each string can be a short paragraph describing goals, motives, accessibility needs, devices, constraints, etc.
- `report` (object, required): Report output configuration.
  - `output` (string, required): File path where the report will be written (e.g., `./ux-report.md`).

### Example: YAML

```yaml
mainPageUrl: 'https://example.com'
subPageUrls:
  - 'https://example.com/pricing'
  - 'https://example.com/signup'
pages:
  - url: 'https://example.com'
    features: >-
      Landing page communicates the core value proposition with a hero CTA "Start free".
      Secondary navigation to docs and pricing. Social proof logos. Responsive layout on mobile.
  - url: 'https://example.com/signup'
    features: >-
      Email sign-up form with password strength meter. Google OAuth option.
      Error messages for invalid email and weak password. Terms checkbox.
personas:
  - >-
    "Startup founder Alice" — Time-constrained, evaluates tools quickly on mobile.
    Values clear pricing, short signup, and credibility signals.
  - >-
    "Enterprise admin Bob" — Desktop-first, cares about security, SSO, and auditability.
report:
  output: './ux-report.md'
```

### Example: JSON

```json
{
	"mainPageUrl": "https://example.com",
	"subPageUrls": ["https://example.com/pricing", "https://example.com/signup"],
	"pages": [
		{
			"url": "https://example.com",
			"features": "Landing page communicates the core value proposition with a hero CTA \"Start free\". Secondary navigation to docs and pricing. Social proof logos. Responsive layout on mobile."
		},
		{
			"url": "https://example.com/signup",
			"features": "Email sign-up form with password strength meter. Google OAuth option. Error messages for invalid email and weak password. Terms checkbox."
		}
	],
	"personas": [
		"\"Startup founder Alice\" — Time-constrained, evaluates tools quickly on mobile. Values clear pricing, short signup, and credibility signals.",
		"\"Enterprise admin Bob\" — Desktop-first, cares about security, SSO, and auditability."
	],
	"report": {
		"output": "./ux-report.md"
	}
}
```

## Writing effective inputs

- Personas: Describe goals, motivations, constraints, devices, and accessibility needs. Example: “Mobile-first founder who scans pricing before trying the product.”
- Features: Describe intended outcomes and key tasks, not just UI widgets. Add important states (empty states, errors, loading) and constraints.
- Coverage: Include every page you want evaluated and keep `features` crisp and outcome-oriented.

## Usage

Run from the directory that contains `uxlintrc.yml` or `uxlintrc.json`:

```bash
npx uxlint
```

The command exits after writing the report to the configured path.

## Output

- The report is written to the `report.output` path you provide.
- You can use a `.md` path to keep results versioned in your repo.

## Troubleshooting

- Config not found: Ensure the file name is exactly `uxlintrc.yml` or `uxlintrc.json` and that you run the command from the same directory.
- Invalid config: Validate your YAML/JSON syntax and required fields.
- Network reachability: Confirm the listed URLs are publicly accessible from your environment.

## Security & privacy

- Provide only URLs and descriptions you are comfortable sending for analysis.
- Avoid including sensitive or personal data in persona and feature descriptions.

## Roadmap

- Richer report sections tailored for frontend implementation
- Deeper task and heuristic coverage
- Expanded guidance for accessibility and performance trade-offs

## Contributing

Issues and pull requests are welcome.

## License

MIT
