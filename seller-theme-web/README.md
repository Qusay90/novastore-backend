# Seller Theme web shell

Build with `npm ci --ignore-scripts` and `npm run build`. The opt-in backend serves `dist/` at `/seller-theme/`.

This thin shell uses the existing NovaStore Seller login, refresh and logout endpoints. Credentials are retained in memory only and are not placed in URLs, Studio documents or browser storage. A page reload requires login. Assigned services come from authenticated server responses; no organization, role or store scope is supplied as client authority.

Async responses are guarded by a login generation and selected service identity. Logout clears history, notices, assignments and the mounted editor immediately; a late refresh, login or history response cannot restore the old account. Unauthorized responses carry the token identity that issued the request so an older request cannot clear a newly authenticated session. Refreshing assignments also refreshes the mounted editor context; policy refresh callbacks update the visible profile and policy revision as well as editor controls.

The actual editor and preview renderer are the single shared `studio-core` module. Assignment acceptance is explicit and is not publication. History is readonly. Publication requests, deployed publication, and Stocky delivery receipts are separate states. No Stocky session bridge, production deployment or native app package is implemented by this shell.
