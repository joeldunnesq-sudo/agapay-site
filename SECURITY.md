# Security Policy

## Reporting a vulnerability

Please report suspected vulnerabilities privately to
[support@agapay.app](mailto:support@agapay.app). Include the affected URL or
feature, steps to reproduce, potential impact, and any supporting evidence.
Do not open a public GitHub issue or disclose the vulnerability publicly before
AGAPAY has had a reasonable opportunity to investigate and remediate it.

We will acknowledge a report within two business days and aim to provide an
initial assessment or status update within seven business days. Remediation
timing depends on severity and complexity, but we will continue to share
meaningful status updates with the reporter.

## Scope

In scope:

- The production AGAPAY platform at `agapay.app` and AGAPAY-controlled APIs.
- Vulnerabilities in this repository that could affect the confidentiality,
  integrity, or availability of the production platform or its users.

Out of scope:

- Third-party services that AGAPAY integrates with but does not control,
  including Stripe, Resend, Cloudflare, and their infrastructure.
- Social engineering, physical attacks, denial-of-service testing, automated
  traffic that degrades service, or access to data beyond what is necessary to
  demonstrate the issue.

Please test in good faith, avoid privacy violations and service disruption, and
delete any sensitive data obtained during testing after the report is resolved.
