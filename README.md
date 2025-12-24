# uxlint

AI-powered UX review CLI for web apps — guided by your product personas and key features.

## Demo

![uxlint demo](./uxlint-demo.gif)

## Overview

uxlint is a CLI tool that generates a UX evaluation report for a target web application using AI. It takes your configuration file as input — including the main and sub page URLs, freeform descriptions of key features on each page, and your customer personas — and outputs a persona-aware, task-oriented UX report to the path you specify.

Designed for frontend engineers who want quick, actionable UX feedback aligned with real user contexts.

## Key capabilities

- Persona-aware analysis using your provided persona descriptions
- Page-by-page evaluation guided by your freeform feature descriptions
- Actionable recommendations prioritized for frontend teams
- Single command execution with zero boilerplate beyond one config file

## Installation

```bash
npm install -g @gyeonghokim/uxlint
```

Or use directly with npx (no installation required):

```bash
npx @gyeonghokim/uxlint
```

### On Linux

For using UXLint Cloud features, uxlint currently uses libsecret to store your OAuth credentials, so you may need to install it.

Depending on your distribution, you will need to run the following command:

```bash
# Debian/Ubuntu
sudo apt-get install libsecret-1-dev
# Red Hat-based
sudo yum install libsecret-devel
# Arch Linux
sudo pacman -S libsecret
```

## Quick start

```bash
npx @gyeonghokim/uxlint --interactive
```

uxlint supports two execution modes: **Interactive mode** (with UI) and **CI mode** (headless). The behavior depends on the `--interactive` flag and whether a configuration file exists.

### Scenario 1: Interactive mode without config (Wizard)

When you run `uxlint --interactive` **without** a configuration file, the interactive wizard launches:

```bash
uxlint --interactive
# or
npx @gyeonghokim/uxlint --interactive
```

The wizard guides you through:

1. Main page URL
2. Additional pages (optional)
3. Feature descriptions for each page
4. User personas
5. Report output path
6. Option to save configuration to a file

After completing the wizard, analysis runs automatically and generates the report.

### Scenario 2: Interactive mode with config (Direct analysis)

When you run `uxlint --interactive` **with** an existing `.uxlintrc.yml` or `.uxlintrc.json` file, the wizard is skipped and analysis starts immediately:

```bash
uxlint --interactive
# or
npx @gyeonghokim/uxlint --interactive
```

The CLI reads the configuration file and runs analysis with a visual progress UI.

### Scenario 3: CI mode with config (Headless)

When you run `uxlint` **without** the `--interactive` flag **with** a configuration file, it runs in CI mode (no UI):

```bash
uxlint
# or
npx @gyeonghokim/uxlint
```

This mode is designed for CI/CD pipelines, UI is disabled.

### Scenario 4: CI mode without config (Error)

When you run `uxlint` **without** the `--interactive` flag **without** a configuration file, it exits with an error:

```bash
uxlint
# Error: Configuration file not found. Use --interactive flag to create one,
# or create .uxlintrc.yml or .uxlintrc.json in the current directory.
```

**Solution**: Use `uxlint --interactive` to create a configuration file, or manually create `.uxlintrc.yml` or `.uxlintrc.json` in your project root.

### Quick reference

| Command                | Config file exists? | Behavior                            |
| ---------------------- | ------------------- | ----------------------------------- |
| `uxlint --interactive` | ❌ No               | Launches wizard, then runs analysis |
| `uxlint --interactive` | ✅ Yes              | Skips wizard, runs analysis with UI |
| `uxlint`               | ✅ Yes              | Runs analysis in CI mode (headless) |
| `uxlint`               | ❌ No               | Shows error and exits               |

## Authentication

uxlint supports cloud-based features through UXLint Cloud authentication. Authentication is optional for local-only usage but required for cloud features like collaborative reports and advanced AI models.

### Authentication commands

#### `uxlint auth login`

Authenticate with UXLint Cloud using OAuth 2.0.

```bash
uxlint auth login
```

The CLI will:

1. Open your default browser to the UXLint Cloud authorization page
2. Wait for you to complete authentication in the browser
3. Securely store your credentials in your system's keychain
4. Confirm successful login

**Browser fallback**: If the browser fails to open automatically, the CLI displays the authorization URL for manual copy-paste.

**Already logged in**: If you're already authenticated, the CLI notifies you and offers the option to re-authenticate.

#### `uxlint auth status`

Check your current authentication status and view user information.

```bash
uxlint auth status
```

Displays:

- Authentication status (Authenticated/Expired/Not logged in)
- User name and email
- Organization (if applicable)
- Token expiration time
- Available cloud features based on your scopes

**Example output (authenticated)**:

```
✓ Authenticated

User: John Doe (john@example.com)
Organization: Acme Inc
Token expires: 2025-12-21 14:30:00
Available features: Cloud Reports, Team Collaboration, Advanced AI Models
```

**Example output (not logged in)**:

```
⚠ Not logged in

You are not currently authenticated with UXLint Cloud.
Run 'uxlint auth login' to authenticate.
```

#### `uxlint auth logout`

Log out from UXLint Cloud and clear stored credentials.

```bash
uxlint auth logout
```

This command:

- Removes your session from the system keychain
- Clears any cached authentication data
- Confirms successful logout

### Security

- **Secure storage**: Credentials are stored in your operating system's native keychain:
  - macOS: Keychain
  - Windows: Credential Manager
  - Linux: Secret Service API (e.g., gnome-keyring)
- **OAuth 2.0 PKCE**: Uses industry-standard OAuth 2.0 with PKCE (Proof Key for Code Exchange) for enhanced security
- **Automatic token refresh**: Access tokens are automatically refreshed when needed, with no user intervention
- **Local-only logging**: All authentication events are logged to local files only, never to stdout or external services

### Examples

**Complete authentication flow**:

```bash
# Login to UXLint Cloud
uxlint auth login
# Opens browser, complete authentication, returns to CLI

# Check authentication status
uxlint auth status
# Shows: Authenticated, user info, token expiration

# Use cloud features in analysis (coming soon)
uxlint --cloud

# Logout when done
uxlint auth logout
# Confirms: Logged out successfully
```

**Handling errors**:

If authentication fails, the CLI provides clear error messages:

- **Network errors**: "Network error: Please check your internet connection and try again"
- **User cancellation**: "Authentication cancelled"
- **Expired tokens**: "Session expired: Please run 'uxlint auth login' to re-authenticate"

**Ctrl+C cancellation**: Press `Ctrl+C` at any time during authentication to cleanly cancel the operation.

## Configuration

### Configuration file

uxlint reads one of the following files from the current working directory (CWD):

- `.uxlintrc.yml`
- `.uxlintrc.json`

**When is a config file required?**

- ✅ **CI mode** (`uxlint` without `--interactive`): Config file is **required**
- ✅ **Interactive mode** (`uxlint --interactive`): Config file is **optional**
  - If present: Wizard is skipped, analysis starts immediately
  - If absent: Wizard launches to create configuration

**Creating a config file:**

1. **Interactive wizard**: Run `uxlint --interactive` and choose to save the configuration
2. **Manual creation**: Create `.uxlintrc.yml` or `.uxlintrc.json` in your project root (see schema below)

### Schema

Required fields are marked as required. All text fields accept natural language.

- `mainPageUrl` (string, required): The primary entry URL of your app.
- `subPageUrls` (string[], required): Additional pages to analyze.
- `pages` (array, required): Per-page descriptions to guide analysis.
  - `url` (string, required): Page URL, must match one of the listed URLs.
  - `features` (string, required): Freeform description of key tasks/flows/components on the page.
- `persona` (string, required): Can be a short paragraph describing goals, motives, accessibility needs, devices, constraints, etc.
- `report` (object, required): Report output configuration.
  - `output` (string, required): File path where the report will be written (e.g., `./ux-report.md`).

**Note**: AI configuration has been moved to environment variables for security. See [Environment Variables](#environment-variables) section below.

### Environment Variables

uxlint uses environment variables for sensitive configuration like API keys. Create a `.env` file in your project root (see [`.env.example`](./.env.example) for reference).

#### AI Provider Configuration (Required)

All AI configuration is done via environment variables to keep sensitive data out of version control:

- `UXLINT_AI_PROVIDER` (required): AI provider to use. One of: `anthropic`, `openai`, `ollama`, `xai`, `google`.
- `UXLINT_AI_API_KEY` (required for all providers except `ollama`): API key for the selected provider.
- `UXLINT_AI_MODEL` (optional): AI model name. Defaults vary by provider (see below).
- `UXLINT_AI_BASE_URL` (optional, only for `ollama`): Ollama server base URL. Defaults to `http://localhost:11434/api`.

**Supported providers:**

- **Anthropic** (default):

  - Set `UXLINT_AI_PROVIDER=anthropic`
  - Requires `UXLINT_AI_API_KEY`
  - Default model: `claude-sonnet-4-5-20250929`
  - Get your API key from https://console.anthropic.com/

- **OpenAI**:

  - Set `UXLINT_AI_PROVIDER=openai`
  - Requires `UXLINT_AI_API_KEY`
  - Default model: `gpt-5`
  - Get your API key from https://platform.openai.com/api-keys

- **Ollama** (local):

  - Set `UXLINT_AI_PROVIDER=ollama`
  - Does not require `UXLINT_AI_API_KEY`
  - Optional `UXLINT_AI_BASE_URL` (default: `http://localhost:11434/api`)
  - Default model: `qwen3-vl`
  - Requires [Ollama](https://ollama.ai/) to be installed and running locally
  - **⚠️ Important**: The model must support **both vision (multimodal) and tool calling**
    - ✅ Recommended: `qwen3-vl`, `qwen2-vl:7b`, `qwen2-vl:2b`
    - ❌ Not supported: `llama3.2-vision` (no tool calling), `llama3.1` (no vision)

- **xAI (Grok)**:

  - Set `UXLINT_AI_PROVIDER=xai`
  - Requires `UXLINT_AI_API_KEY`
  - Default model: `grok-4`
  - Get your API key from https://x.ai/

- **Google (Gemini)**:
  - Set `UXLINT_AI_PROVIDER=google`
  - Requires `UXLINT_AI_API_KEY`
  - Default model: `gemini-2.5-pro`
  - Get your API key from https://ai.google.dev/

**Example `.env` file:**

```bash
# AI Provider Configuration
UXLINT_AI_PROVIDER=anthropic
UXLINT_AI_API_KEY=sk-ant-your-api-key-here
UXLINT_AI_MODEL=claude-sonnet-4-5-20250929  # optional
```

#### Cloud/OAuth Configuration (Optional)

Authentication can be configured using environment variables:

- `UXLINT_CLOUD_CLIENT_ID`: OAuth client ID (optional, uses default if not set)
- `UXLINT_CLOUD_API_BASE_URL`: UXLint Cloud API base URL (optional, defaults to production URL)
- `UXLINT_CLOUD_REDIRECT_URI`: OAuth redirect URI (optional, defaults to `http://localhost:8080/callback`)

These variables are typically not needed unless you're using a custom UXLint Cloud instance.

### Example: YAML

```yaml
mainPageUrl: 'https://github.com'
subPageUrls:
  - 'https://github.com/login'
  - 'https://github.com/explore'
  - 'https://github.com/pricing'
  - 'https://github.com/signup'
pages:
  - url: 'https://github.com'
    features: >-
      GitHub landing page. User interactions: 1. Scroll down to view features
      section showcasing code hosting, collaboration tools, and integrations. 2.
      Click "Sign up" button located in the top right corner to navigate to
      signup page. 3. Use top navigation menu to access "Product", "Solutions",
      "Pricing", and "Enterprise" pages. 4. View trending repositories section
      showing popular open source projects. 5. Use search bar at the top to
      search for repositories, users, or topics.
  - url: 'https://github.com/login'
    features: >-
      GitHub login page. User interaction steps: 1. Locate the username or email
      input field and type your GitHub username or email address. 2. Locate the
      password input field and type your password. 3. Optionally check the
      "Remember me" checkbox to stay logged in. 4. Click the "Sign in" button to
      submit the form. If two-factor authentication is enabled, enter the 2FA
      code when prompted. After successful login, user will be redirected to
      their dashboard.
  - url: 'https://github.com/explore'
    features: >-
      GitHub Explore page showing trending repositories and topics. User
      interactions: 1. Browse trending repositories: Scroll through the list of
      trending repositories showing repository name, description, language, and
      star count. Click on any repository to view its details. 2. Explore topics:
      Click on topic tags to see repositories related to that topic. Topics are
      displayed as clickable badges. 3. Filter by language: Use the language
      filter dropdown to filter repositories by programming language (e.g.,
      JavaScript, Python, Java). 4. View collections: Scroll to see curated
      collections of repositories organized by theme or purpose. Click on a
      collection to view its contents. 5. Search: Use the search bar at the top
      to search for specific repositories, users, or topics.
  - url: 'https://github.com/pricing'
    features: >-
      GitHub pricing page displaying subscription plans. User interactions: 1.
      View pricing tiers: The page displays pricing cards for Free, Team, and
      Enterprise plans with feature comparisons. Each plan shows monthly and
      annual pricing. 2. Toggle billing period: Click the toggle switch or
      buttons to switch between monthly and annual billing. Prices update
      automatically to show discounts for annual plans. 3. Compare features: Scroll
      down to view detailed feature comparison table showing what's included in
      each plan. 4. Select a plan: Click "Get started with Team" or "Contact
      Sales" button on a pricing card to proceed with that plan. 5. View FAQ:
      Scroll down to view FAQ section about billing, plan features, and
      migration. Click on FAQ items to expand and view answers.
  - url: 'https://github.com/signup'
    features: >-
      GitHub signup page for new user registration. User interaction steps: 1.
      Enter username: Locate the username input field and type a desired
      username. The system will check availability in real-time and show
      feedback. 2. Enter email address: Locate the email input field and type an
      email address. 3. Enter password: Locate the password field and type a
      password. Observe the password strength indicator showing requirements
      (e.g., at least 8 characters, one lowercase letter, one number). 4. Email
      preferences: Optionally check/uncheck boxes for receiving product updates
      and announcements. 5. Verify account: Check the "Verify your account"
      puzzle or CAPTCHA if presented. 6. Submit form: Click "Create account"
      button to submit the registration. A verification email will be sent to
      the provided email address. Click the link in the email to verify and
      complete registration.
persona: >-
  You are a developer looking to host your open source project on GitHub. You
  want to understand how easy it is to get started, explore existing projects,
  and set up your repository. Your approach: First, visit the pricing page to
  understand what features are available in the free plan. Next, explore the
  Explore page to see what kinds of projects are popular and get inspiration.
  Then, sign up for a free account to start hosting your own projects. Finally,
  log in to access your dashboard and create your first repository.
report:
  output: './ux-report.md'
```

### Example: JSON

```json
{
	"mainPageUrl": "https://github.com",
	"subPageUrls": [
		"https://github.com/login",
		"https://github.com/explore",
		"https://github.com/pricing",
		"https://github.com/signup"
	],
	"pages": [
		{
			"url": "https://github.com",
			"features": "GitHub landing page. User interactions: 1. Scroll down to view features section showcasing code hosting, collaboration tools, and integrations. 2. Click \"Sign up\" button located in the top right corner to navigate to signup page. 3. Use top navigation menu to access \"Product\", \"Solutions\", \"Pricing\", and \"Enterprise\" pages. 4. View trending repositories section showing popular open source projects. 5. Use search bar at the top to search for repositories, users, or topics."
		},
		{
			"url": "https://github.com/login",
			"features": "GitHub login page. User interaction steps: 1. Locate the username or email input field and type your GitHub username or email address. 2. Locate the password input field and type your password. 3. Optionally check the \"Remember me\" checkbox to stay logged in. 4. Click the \"Sign in\" button to submit the form. If two-factor authentication is enabled, enter the 2FA code when prompted. After successful login, user will be redirected to their dashboard."
		},
		{
			"url": "https://github.com/explore",
			"features": "GitHub Explore page showing trending repositories and topics. User interactions: 1. Browse trending repositories: Scroll through the list of trending repositories showing repository name, description, language, and star count. Click on any repository to view its details. 2. Explore topics: Click on topic tags to see repositories related to that topic. Topics are displayed as clickable badges. 3. Filter by language: Use the language filter dropdown to filter repositories by programming language (e.g., JavaScript, Python, Java). 4. View collections: Scroll to see curated collections of repositories organized by theme or purpose. Click on a collection to view its contents. 5. Search: Use the search bar at the top to search for specific repositories, users, or topics."
		},
		{
			"url": "https://github.com/pricing",
			"features": "GitHub pricing page displaying subscription plans. User interactions: 1. View pricing tiers: The page displays pricing cards for Free, Team, and Enterprise plans with feature comparisons. Each plan shows monthly and annual pricing. 2. Toggle billing period: Click the toggle switch or buttons to switch between monthly and annual billing. Prices update automatically to show discounts for annual plans. 3. Compare features: Scroll down to view detailed feature comparison table showing what's included in each plan. 4. Select a plan: Click \"Get started with Team\" or \"Contact Sales\" button on a pricing card to proceed with that plan. 5. View FAQ: Scroll down to view FAQ section about billing, plan features, and migration. Click on FAQ items to expand and view answers."
		},
		{
			"url": "https://github.com/signup",
			"features": "GitHub signup page for new user registration. User interaction steps: 1. Enter username: Locate the username input field and type a desired username. The system will check availability in real-time and show feedback. 2. Enter email address: Locate the email input field and type an email address. 3. Enter password: Locate the password field and type a password. Observe the password strength indicator showing requirements (e.g., at least 8 characters, one lowercase letter, one number). 4. Email preferences: Optionally check/uncheck boxes for receiving product updates and announcements. 5. Verify account: Check the \"Verify your account\" puzzle or CAPTCHA if presented. 6. Submit form: Click \"Create account\" button to submit the registration. A verification email will be sent to the provided email address. Click the link in the email to verify and complete registration."
		}
	],
	"persona": "You are a developer looking to host your open source project on GitHub. You want to understand how easy it is to get started, explore existing projects, and set up your repository. Your approach: First, visit the pricing page to understand what features are available in the free plan. Next, explore the Explore page to see what kinds of projects are popular and get inspiration. Then, sign up for a free account to start hosting your own projects. Finally, log in to access your dashboard and create your first repository.",
	"report": {
		"output": "./ux-report.md"
	}
}
```

## uxlint CLI State Machine

The CLI uses an XState state machine to manage execution flow. The behavior depends on the `--interactive` flag and configuration file presence:

```mermaid
stateDiagram-v2
    [*] --> IDLE

    IDLE --> TTY: --interactive flag is present
    IDLE --> CI: --interactive flag is not present

    %% TTY branch (Interactive mode)
    TTY --> Wizard: uxlintrc file is not present
    TTY --> AnalyzeWithUI: uxlintrc file is present
    Wizard --> AnalyzeWithUI: uxlintrc file is created

    %% CI branch (Headless mode)
    CI --> AnalyzeWithoutUI: uxlintrc file is present
    CI --> Error: uxlintrc file is not present

    %% After analysis, report is created
    AnalyzeWithUI --> ReportBuilder: UxReport is created
    AnalyzeWithoutUI --> ReportBuilder: UxReport is created

    ReportBuilder --> [*]
```

### State descriptions

- **IDLE**: Initial state, determines mode based on `--interactive` flag
- **TTY (Interactive mode)**: Uses Ink UI components
  - **Wizard**: Interactive configuration wizard (when no config file exists)
  - **AnalyzeWithUI**: Analysis with visual progress indicators
- **CI (Headless mode)**: No UI, uses `console.log` output
  - **AnalyzeWithoutUI**: Headless analysis execution
  - **Error**: Missing configuration error state
- **ReportBuilder**: Generates final markdown report
- **Done**: Final state, exits with appropriate exit code

### Mapping to usage scenarios

| Scenario        | Command                              | Initial State                | Final State          |
| --------------- | ------------------------------------ | ---------------------------- | -------------------- |
| Wizard          | `uxlint --interactive` (no config)   | IDLE → TTY → Wizard          | ReportBuilder → Done |
| Direct analysis | `uxlint --interactive` (with config) | IDLE → TTY → AnalyzeWithUI   | ReportBuilder → Done |
| CI mode         | `uxlint` (with config)               | IDLE → CI → AnalyzeWithoutUI | ReportBuilder → Done |
| Error           | `uxlint` (no config)                 | IDLE → CI → Error            | Done (exit code 1)   |

## Roadmap

- Richer report sections tailored for frontend implementation
- Deeper task and heuristic coverage
- Expanded guidance for accessibility and performance trade-offs

## Contributing

Issues and pull requests are welcome.

## License

MIT
