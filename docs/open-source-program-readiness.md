# Open-source program readiness evidence

- **Snapshot date:** 2026-10-06
- **Repository:** [Qusay90/novastore-backend](https://github.com/Qusay90/novastore-backend)
- **Basis:** repository files on main at f25385bd and read-only GitHub metadata on the snapshot date. Recheck volatile counts and program requirements before submitting.

This is a maintainer evidence sheet, not a marketing claim. It separates repository facts from adoption evidence that is not available.

## Project identity

- **Purpose:** an MIT-licensed commerce codebase spanning a Node.js API, web storefront, React/Vite administration foundation, native Android client, and PostgreSQL-compatible data layer.
- **License:** MIT, confirmed in LICENSE and GitHub repository metadata.
- **Primary maintainer:** the repository README identifies Qusay90 as the primary maintainer. The GitHub account authored all 26 pull requests currently recorded in the repository. The applicant must confirm that this is their identity and role before using first-person application answers.
- **Repository:** public GitHub repository at Qusay90/novastore-backend.

## Public open-source signals

| Signal | Evidence on 2026-10-06 |
| --- | --- |
| Public repository and license | Public repository; MIT |
| README and setup | README contains project surfaces, demo reference, local setup, test commands, and safety notes |
| Contribution and security guidance | CONTRIBUTING.md and SECURITY.md are present |
| Roadmap and changelog | ROADMAP.md and CHANGELOG.md are present on this preparation branch; confirm merge before citing them as public |
| Code of Conduct and templates | Added on this preparation branch; not yet merged to main |
| CI | GitHub Actions workflow covers backend/storefront smoke checks, Commerce Pro admin build and checks, and Android unit tests |
| Latest main CI observed | Successful run for f25385bd on 2026-08-20; no result for this local preparation branch |
| Releases | No GitHub release and no versioned semantic release tag |
| Homepage | novastore.tr; HTTP HEAD returned 200 on 2026-10-06. This confirms reachability, not feature acceptance or production readiness. |
| Repository description | Open-source commerce platform with a Node.js API, web storefront, React admin foundation, Android app, and PostgreSQL-compatible data layer |
| Topics | android, commerce-platform, ecommerce, express, kotlin, nodejs, open-source, postgresql, react, storefront, supabase |

## Active maintenance evidence

- Main has 164 commits in the visible GitHub history. The latest commit on main is f25385bd, dated 2026-08-20.
- GitHub lists 26 pull requests; all 26 are merged and all are authored by Qusay90. The latest is PR #26, merged 2026-08-20.
- PR #23 established the public documentation and CI baseline.
- PR #25 added release-provenance and runtime database-safety hardening.
- PR #26 added a fail-closed public-table access-hardening migration. Its merge is not evidence that the migration was applied to production.
- GitHub's contributors endpoint returned two account identities, Qusay90 and codex. This should not be represented as two independent human contributors without confirming the second identity.
- The issue history contains no user-authored issues in the queried snapshot.

These facts show owner-led repository work and a configured test workflow. They do not show a large contributor community or recent merged activity after 2026-08-20.

## Technical and ecosystem relevance

The repository brings customer web, administration, Android, commerce APIs, persistence, and migrations together so developers can inspect cross-surface commerce contracts in one MIT-licensed codebase. Its public history includes database access hardening and runtime safety work alongside product development. Seller-owned operations and a reusable theme-authoring platform remain incomplete and are described as roadmap work.

The Codex for Open Source program currently says it considers meaningful usage, ecosystem importance, and active maintenance evidence. NovaStore can document technical scope and maintainer-authored engineering history, but the current public adoption evidence is limited. See the [official program overview](https://developers.openai.com/community/codex-for-oss/).

## Adoption evidence

### Verified evidence available

- GitHub stars: 0.
- GitHub forks: 0.
- Merged pull requests: 26 of 26 recorded pull requests.
- Contributor-account endpoint: 2 identities, Qusay90 and codex; this is not a verified count of human contributors.
- Public demo reference: the README links to [novastore.tr](https://novastore.tr); HTTP HEAD returned 200 on 2026-10-06. This does not verify user flows or production readiness.
- GitHub releases: 0.
- Semantic-version release tags: 0.

### Evidence unavailable or not established

- Downloads: no GitHub release assets or release-download count are available.
- External users, active installations, customer organizations, revenue, and production transaction volume: no verifiable public figures were supplied or found in repository metadata.
- Testimonials, independent project usage, and ecosystem integrations: none verified for this application.
- Feature-level demo acceptance and usage: not established by an HTTP reachability check; recheck before submission.

## Remaining weakness

Zero stars, forks, or downloads do not prove that software has no value or use, but they are weak public adoption signals. The 26 merged PRs show activity by the repository owner; they are not evidence of broad community contribution. The latest main commit and successful main CI run are both dated 2026-08-20, so a claim of current active maintenance would be stronger after new reviewed work lands on main.

Before submitting, refresh repository metrics and the demo's feature-level status, confirm the applicant's maintainer role, and add any genuine evidence of usage or external ecosystem relevance. Do not substitute local branch activity for merged public maintenance evidence.
