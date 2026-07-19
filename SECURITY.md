# Security Policy

NovaStore includes authentication, administration, payments, customer state, messaging, database migrations, and production-operation code. Security reports are taken seriously.

## Supported versions

NovaStore is currently in active pre-release development. Security fixes are applied to the latest maintained `main` branch and, when stable tagged releases begin, to versions explicitly listed here.

| Version | Supported |
| --- | --- |
| Latest `main` | Yes |
| Older commits and unmaintained branches | No |

## Reporting a vulnerability

Please do **not** open a public issue containing exploit instructions, secrets, personal data, production identifiers, or enough detail to make active exploitation easier.

Preferred reporting path:

1. Use GitHub's private vulnerability reporting feature for this repository when it is available.
2. Include a clear description, affected component, reproduction steps, impact, prerequisites, and a suggested mitigation when possible.
3. Use synthetic accounts and data. Do not access, modify, or download data that does not belong to you.
4. Stop testing when continued activity could disrupt service, affect real users, or alter production data.

When private vulnerability reporting is not available, contact the maintainer through the repository owner's GitHub profile and request a private reporting channel without publishing the vulnerability details.

## What to include

A useful report contains:

- Affected route, module, screen, migration, or workflow.
- The commit or deployed version tested.
- Preconditions and required privileges.
- Minimal reproduction steps or a proof of concept that avoids destructive behavior.
- Expected and observed behavior.
- Security impact and likely affected users or data.
- Relevant logs with tokens, credentials, personal data, and internal identifiers removed.
- Suggested remediation or compensating control, when known.

## Response process

The maintainer will aim to:

- Acknowledge a complete report within 7 days.
- Validate severity and scope before publishing details.
- Coordinate a fix, tests, rollout, and disclosure timing.
- Credit the reporter when requested and appropriate.

Response times are targets rather than service-level guarantees because the project is currently maintained primarily by one person.

## Safe-harbor expectations

Good-faith research should:

- Stay within accounts, systems, and data you own or have explicit permission to test.
- Avoid denial of service, automated high-volume traffic, social engineering, spam, persistence, and destructive actions.
- Avoid accessing, retaining, or sharing other users' data.
- Give the maintainer reasonable time to investigate and fix the issue before disclosure.
- Comply with applicable law and platform terms.

This policy does not authorize testing against third-party providers such as payment, email, cloud storage, database, hosting, or AI services.

## Out of scope

The following normally do not qualify as vulnerabilities by themselves:

- Missing security headers without a demonstrated impact.
- Self-XSS requiring a user to paste code into developer tools.
- Findings that require compromised administrator or infrastructure credentials.
- Rate-limit observations without a practical abuse scenario.
- Vulnerabilities only in unsupported dependencies with no reachable NovaStore impact.
- Reports generated solely by automated scanners without validation.
- Social engineering, physical attacks, and denial-of-service testing.

## Secrets found in the repository

Do not reuse or test a suspected credential. Report its location privately. The maintainer will verify exposure, revoke or rotate affected material, and review history and logs as appropriate.
