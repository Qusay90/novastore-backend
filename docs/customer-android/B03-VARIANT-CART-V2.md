# B03 Android Variant Cart V2

This work is based exclusively on owner-selected R26 commit
`070ffed2f22962ef500e34df04e452cf7da22eed`, tree
`997a751b3a6cb077b614f38f8b3ee41a1a4a615c`. The reference worktree is read-only.
Implementation is isolated on `codex/customer-android-variant-cart-v2`.

## Contract

The signed-in v4.13 application uses the existing native authenticated request
bridge. Only `/api/shared-state/cart`, `/api/shared-state/checkout` and
`/api/shared-state/cart/finalize` were added to its exact route allowlist. These
requests send `X-Cart-Schema-Version: 2`, `X-Cart-Variant-Line-Identity: true`
and `X-Cart-CAS: true`. Browser transport sends the same capabilities. No generic
HTTP bridge, arbitrary header forwarding, cookie authority or token cache was added.

Server responses must have `cartSchemaVersion: 2` and a nonnegative revision.
Each row retains canonical store, product, nullable variant and quantity. The
device key is presentation-only. Mutations transmit identity/quantity, the
expected revision and explicitly acknowledged legacy product IDs; client prices,
images and labels do not become commerce authority. Unknown schema versions,
malformed rows and duplicated identities fail closed.

Shared storage accepts up to 200 lines and 999 units per line, independently of
the existing 20-line / 20-units / 50-total purchase limits. Larger valid saved
carts remain visible and can be reduced or removed without truncation. Cart
images resolve through the native-validated API origin and the existing approved
media policy, so relative backend images do not resolve inside the APK assets.

The guest cart remains device-local and separate from the authenticated account.
Account changes clear the authenticated projection immediately; late replies are
bound to account, request generation and the accepted native session. App restart,
cart entry and the “Sepeti eşitle” control load server state. A 409 refetches the
current cart and asks the customer to repeat their action; the old replacement
request is never retried automatically. Failed/offline writes are not presented
as synchronized success. Existing guest cache is not silently uploaded over an
account's server cart or copied from one account to another.

Ambiguous legacy items have a visible recovery list. Customers can open the
product to select its current variant, or explicitly remove that legacy record.
Checkout cannot initialize while the cart is unverified or needs legacy review.

Checkout saves a separate V2 snapshot with its own revision before requesting
canonical agreements/quote. Purchase bodies retain the selected variants. After
an owned payment is fully finalized, the app submits `orderId` and cart revision
to the server finalization endpoint. The server owns paid-order row resolution
and its durable receipt; the client never deletes all rows for a product. A cart
sync failure leaves payment truth visible and exposes a safe receipt retry.

The real account-switch test uncovered a pre-existing no-Firebase logout crash:
the push plugin's Java unregister call cannot reject safely without a configured
provider. Cleanup now consults the existing native `providerConfigured` capability
before invoking that plugin. Configured devices retain the original unregister
call. A missing or failed capability never counts as successful provider revocation;
the existing server-revocation and current-session guards still govern logout.
The native browser-storage test also now explicitly permits R26's existing public
variant-selection cache, validates its exact two-field ID schema, and retains the
credential/session/cookie absence assertions.

## Local verification

Evidence lives outside the repository under
`gp/outputs/variant-cart-v2-20260919/android/`. It distinguishes source contracts,
real disposable backend tests, native emulator behavior and coordinated Web ↔
Android acceptance. The final evidence report records executed counts and limits.

The opt-in Gradle property `-PnovaB03Isolated=true` adds `.b03cartuat` to the UAT
application ID only. This permits a local debug-signed acceptance installation
alongside the owner's real app. Standard debug, UAT and release identities are
unchanged. The isolated target must be verified from APK metadata before install.
No production provider, physical-device release, signing, migration or deployment
acceptance follows from these local tests.

Commands from `v413-ui`:

```text
npm ci --ignore-scripts
npm run check:runtime
node --test tests/b03-cart-v2.test.mjs tests/r25-device-cart.test.mjs
npm run build
npm run android:sync:uat
```

From `v413-ui/android`, with the local Android SDK and JBR configured:

```text
gradlew.bat -PnovaB03Isolated=true testUatUnitTest lintUat assembleUat assembleUatAndroidTest
```

Native `B03VariantCartInstrumentedTest` methods are intentionally run individually
to interleave actual Web actions on the same disposable account. Synthetic login
credentials are copied only to the isolated app's private `files/b03-login.json`
using `adb run-as`, never inserted into browser storage or printed. The tests use
ordinary login form submission and the application's existing product/cart UI.
They save native screenshots and public cart identity/revision receipts. The
fixture server and its controlled paid-order path are exclusively local test
infrastructure, not production code.
