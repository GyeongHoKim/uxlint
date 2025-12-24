# Security Policy

## Supported Versions

We release patches for security vulnerabilities in the following versions:

| Version | Supported          |
| ------- | ------------------ |
| 3.x     | :white_check_mark: |
| 2.x     | :x:                |
| < 2.0   | :x:                |

We follow [Semantic Versioning](https://semver.org/) and use automated releases via [semantic-release](https://github.com/semantic-release/semantic-release). Security patches are released as soon as possible after verification.

**Note**: Only the latest major version (currently 3.x) receives security updates. We strongly recommend upgrading to the latest version to ensure you have the most recent security fixes.

## Security Considerations

uxlint is a CLI tool that interacts with sensitive data and external services. When using uxlint, be aware of the following security considerations:

### API Keys and Credentials

- **Never commit API keys** to version control
- Store all sensitive credentials in `.env` files (listed in `.gitignore`)
- Use environment variables for AI provider API keys and cloud authentication
- Credentials are stored in your OS's native secure storage:
  - **macOS**: Keychain
  - **Windows**: Credential Manager
  - **Linux**: Secret Service API (e.g., gnome-keyring)

### Configuration Files

- `.uxlintrc.yml` and `.uxlintrc.json` should **not** contain sensitive data
- Sanitize configuration files before sharing or committing
- Review page URLs and feature descriptions for any accidentally included secrets

### Network Security

- uxlint makes HTTPS requests to:
  - AI provider APIs (Anthropic, OpenAI, Google, xAI, or local Ollama)
  - UXLint Cloud (optional, for authentication and cloud features)
  - User-specified URLs (for UX analysis)
- Ensure you trust the URLs you provide for analysis
- OAuth 2.0 with PKCE is used for cloud authentication

### Local Logging

- All logs are written to local files only (MCP protocol requirement)
- Log files may contain sensitive information (URLs, API responses, error details)
- Redact sensitive information before sharing log files for debugging
- Log files location: Check your system's temp directory or the project's logs directory

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

We take security seriously and appreciate responsible disclosure. If you discover a security vulnerability, please report it privately using one of the following methods:

### Preferred Method: GitHub Security Advisory

1. Go to the [Security Advisories page](https://github.com/GyeongHoKim/uxlint/security/advisories)
2. Click "Report a vulnerability"
3. Fill in the advisory details form with:
   - **Title**: Clear, concise description of the vulnerability
   - **Severity**: Your assessment (Critical, High, Medium, Low)
   - **Description**: Detailed explanation of the vulnerability
   - **Steps to reproduce**: Minimal reproduction case
   - **Impact**: What an attacker could accomplish
   - **Suggested fix**: If you have recommendations (optional)

### Alternative Method: Email

If you prefer email or cannot use GitHub Security Advisories:

- **Email**: gyeongho.dev@proton.me
- **Subject**: [SECURITY] Brief description of the issue
- **Include**:
  - Affected version(s)
  - Detailed description of the vulnerability
  - Steps to reproduce
  - Proof of concept (if applicable)
  - Your contact information for follow-up

## Response Timeline

We are committed to responding promptly to security reports:

- **Acknowledgment**: Within **5 business days** of receiving your report
- **Initial assessment**: Within **10 business days** of acknowledgment
- **Status updates**: Every **7 days** until the issue is resolved
- **Fix and disclosure**: Typically within **30-90 days**, depending on complexity

### What to Expect

1. **Acknowledgment**: We'll confirm receipt of your report and assign a tracking ID
2. **Validation**: We'll reproduce and validate the vulnerability
3. **Fix development**: We'll develop and test a patch
4. **CVE assignment**: For qualifying vulnerabilities, we'll request a CVE identifier
5. **Coordinated disclosure**: We'll work with you to determine an appropriate disclosure timeline
6. **Public release**: We'll release a patched version and publish a security advisory

## Disclosure Policy

We follow a **coordinated disclosure** approach:

- We request **90 days** from the initial report before public disclosure
- If you need to disclose earlier, please discuss with us first
- We'll credit you in the security advisory (unless you prefer to remain anonymous)
- We may offer recognition in our CONTRIBUTORS file (if created)

### Public Disclosure

When we release a security fix:

1. We'll publish a **GitHub Security Advisory** with details
2. We'll release a **new version** with the fix via semantic-release
3. We'll update the **CHANGELOG.md** with security fix details
4. We'll notify users via **GitHub Release notes**

## Scope

### In Scope

Security vulnerabilities in the following areas are in scope:

- **Authentication**: OAuth 2.0 PKCE implementation, token handling
- **API key storage**: Keychain/credential manager integration
- **Command injection**: Shell command execution vulnerabilities
- **Path traversal**: File system access vulnerabilities
- **Dependency vulnerabilities**: Security issues in npm dependencies
- **Configuration parsing**: YAML/JSON parsing vulnerabilities
- **Network requests**: HTTPS request handling, certificate validation

### Out of Scope

The following are **not** considered security vulnerabilities:

- **Third-party AI provider issues**: Report these to the respective provider (Anthropic, OpenAI, Google, xAI)
- **Third-party npm modules**: Report to the module maintainer or use [npm's vulnerability reporting](https://www.npmjs.com/advisories/report)
- **Social engineering attacks**: User education issues, not software vulnerabilities
- **Issues requiring physical access**: Local machine access is assumed
- **Denial of Service (DoS)**: As a CLI tool, DoS attacks are out of scope
- **Issues in user-provided URLs**: We cannot control the security of websites you analyze
- **Local Ollama vulnerabilities**: Report to the [Ollama project](https://github.com/ollama/ollama/security)

## Security Best Practices for Users

To use uxlint securely:

1. **Keep uxlint updated**: Run `npm update -g @gyeonghokim/uxlint` regularly
2. **Use strong API keys**: Rotate keys periodically, use keys with minimal required permissions
3. **Review .env files**: Never commit `.env` to version control
4. **Audit dependencies**: Run `npm audit` to check for known vulnerabilities
5. **Verify URLs**: Only analyze URLs you trust
6. **Secure log files**: Treat log files as sensitive data
7. **Use HTTPS**: Ensure your AI provider and cloud endpoints use HTTPS
8. **Review generated reports**: Sanitize reports before sharing publicly

## Security Contacts

- **Primary contact**: gyeongho.dev@proton.me
- **GitHub Security**: https://github.com/GyeongHoKim/uxlint/security/advisories

## Escalation

If you do not receive acknowledgment within **6 business days**, or if you feel your report is not being handled appropriately:

1. Send a follow-up email to the primary contact
2. If still no response, you may escalate to GitHub Support
3. For critical vulnerabilities, consider reaching out via alternative channels (GitHub issue with minimal details, social media DM)

**Please do not publicly disclose the vulnerability details during escalation.**

## Bug Bounty Program

uxlint does not currently offer a bug bounty program. However, we deeply appreciate security research and will publicly acknowledge your contribution (with your permission) in:

- Security advisory credits
- CHANGELOG.md recognition
- Social media acknowledgments
- Potential CONTRIBUTORS file (if created)

## Responsible Disclosure Guidelines

When testing for vulnerabilities:

- **Do not** test on production systems or services you don't own
- **Do not** access or modify data that doesn't belong to you
- **Do not** cause damage to systems or disrupt services
- **Do not** perform testing that could impact other users
- **Respect** user privacy and data protection laws
- **Comply** with our [Code of Conduct](CODE_OF_CONDUCT.md)

## Known Security Limitations

uxlint users should be aware of these inherent limitations:

1. **AI provider trust**: uxlint sends screenshots and data to third-party AI providers. Review their privacy policies.
2. **URL content**: uxlint analyzes web pages you specify. Malicious websites could exploit browser vulnerabilities.
3. **Local execution**: As a CLI tool, uxlint runs with your user's permissions. Be cautious about running untrusted code.
4. **Configuration trust**: `.uxlintrc` files execute code during parsing. Only use trusted configuration files.

## Security Updates

Subscribe to security updates:

- **GitHub Watch**: Watch this repository and enable "Security alerts" notifications
- **GitHub Releases**: Follow [GitHub Releases](https://github.com/GyeongHoKim/uxlint/releases) for security patches
- **npm advisories**: Security issues are published to the npm registry

## Additional Resources

- [Code of Conduct](CODE_OF_CONDUCT.md)
- [Contributing Guidelines](CONTRIBUTING.md)
- [GitHub Security Best Practices](https://docs.github.com/en/code-security)
- [npm Security Best Practices](https://docs.npmjs.com/packages-and-modules/securing-your-code)

---

Thank you for helping keep uxlint and its users secure!
