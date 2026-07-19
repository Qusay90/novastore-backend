# Contributing to NovaStore

Thank you for helping improve NovaStore. The project spans a backend API, customer storefront, administration interface, PostgreSQL migrations, and a native Android application. Changes should remain narrow, testable, and safe across those boundaries.

## Before you start

- Search existing issues and pull requests before creating a duplicate.
- Open an issue before beginning a large feature, architecture change, schema change, payment change, or breaking API change.
- Do not use production credentials, production databases, or real customer data in development or tests.
- Do not include secrets, private keys, payment credentials, signing files, database dumps, browser profiles, or personal data in commits.
- Report security vulnerabilities privately as described in [SECURITY.md](SECURITY.md).

## Development setup

Follow the setup instructions in [README.md](README.md).

Backend and storefront dependencies:

```bash
npm ci
```

Commerce Pro admin dependencies:

```bash
npm --prefix admin-commerce-pro ci
```

Android verification requires JDK 21 and an Android SDK compatible with the repository's configured compile SDK.

## Branch naming

Use a short, descriptive branch name:

```text
feat/catalog-offer-contract
fix/storefront-cart-race
docs/local-development
refactor/payment-provider-boundary
test/admin-permission-contract
```

Avoid working directly on `main`.

## Making a change

1. Reproduce or describe the current behavior.
2. Identify the smallest project surface that should change.
3. Add or update a test that protects the intended behavior.
4. Implement the change without mixing unrelated cleanup.
5. Run the relevant verification commands.
6. Update documentation when behavior, configuration, architecture, or operator steps change.
7. Review the diff for secrets, generated files, debug artifacts, and accidental formatting churn.

## Verification

Run the curated backend and storefront smoke suite:

```bash
npm test
```

For Commerce Pro administration changes:

```bash
npm --prefix admin-commerce-pro run build
npm --prefix admin-commerce-pro run test:model
npm --prefix admin-commerce-pro run test:preview
npm --prefix admin-commerce-pro run test:mutations
```

For Android changes on macOS/Linux:

```bash
./gradlew :app:testDebugUnitTest
./gradlew :app:assembleDebug
```

For Android changes on Windows:

```powershell
.\gradlew.bat :app:testDebugUnitTest
.\gradlew.bat :app:assembleDebug
```

Before opening a pull request:

```bash
git diff --check
```

Some specialized tests require a disposable local database or controlled environment. State clearly in the pull request which tests were run, which were not run, and why.

## Database and migration rules

Database work is treated as a release-sensitive change.

- Prefer additive, backward-compatible migrations.
- Never point a development or test command at production.
- Do not rely on `.env` fallbacks for production rollout tools.
- Make target environment selection explicit and fail closed when configuration is incomplete.
- Provide a verification query or test for every migration.
- Describe rollback or forward-recovery behavior.
- Preserve existing data unless the change explicitly includes reviewed data migration steps.
- Use synthetic data in tests and examples.

## Generated and canonical files

Some administration and storefront artifacts are generated from canonical source files.

- Modify canonical source files, not generated standalone output, unless repository documentation explicitly identifies the output as the source of truth.
- Use the provided build or synchronization scripts.
- Include generated output only when the relevant integration contract requires it.
- Avoid mass line-ending or formatting changes unrelated to the task.

## Commit messages

Use concise Conventional Commit-style messages when practical:

```text
feat(catalog): add seller offer contract
fix(storefront): preserve cart during auth transition
test(payments): cover callback idempotency
docs: clarify local database setup
chore(ci): add Android unit-test job
```

## Pull requests

A good pull request includes:

- The problem and user impact.
- The chosen approach and important trade-offs.
- The affected surfaces: backend, storefront, admin, Android, database, or operations.
- Test commands and actual outcomes.
- Screenshots for visible UI changes.
- Migration, rollout, and rollback notes when applicable.
- Known limitations or follow-up work.

Keep pull requests reviewable. Split unrelated work into separate changes.

### Pull-request checklist

- [ ] The change is scoped to one coherent outcome.
- [ ] Tests were added or updated where behavior changed.
- [ ] Relevant local checks pass.
- [ ] `git diff --check` passes.
- [ ] No secret, credential, personal data, or production artifact is included.
- [ ] Documentation and examples match the new behavior.
- [ ] UI changes include screenshots or a reproducible preview path.
- [ ] Database changes include verification and recovery notes.
- [ ] Backward compatibility was preserved or the breaking change is clearly documented.

## Review expectations

Reviewers may request changes for security, data safety, authorization, migration reliability, accessibility, test coverage, documentation, or cross-client compatibility even when the immediate feature appears to work.

The maintainer may close changes that introduce unrelated scope, expose secrets, depend on production data, bypass safety guards, or cannot be maintained within the project's direction.

## Getting help

Open a GitHub issue with a minimal reproduction, relevant logs with secrets removed, operating system, runtime versions, and the exact command that failed.
