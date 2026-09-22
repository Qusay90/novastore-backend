# Studio Pro entry and seller offer integration

The owner's final navigation decision supersedes earlier Admin menu experiments:

- Admin has one **Studio Pro** entry, opening the original complete workshop in a new tab.
- **Satıcıya tema sun** exists inside that workshop's original sidebar. The offer composer, service profiles, feature decisions and seller-as-seen preview are all in this section.
- The legacy Admin `#/themePlatform` bookmark displays a Studio launch card, not another seller management UI.

## Routes and build

- `/studio-pro/?surface=admin`: the original full authoring application, using the same copied `Studio.jsx` editor as the scoped module.
- `/studio-pro/?surface=admin&panel=seller-offers`: the existing offer section with the shared authenticated `ThemePlatform` component.
- `/theme-studio/studio-module.html`: the shared store-scoped Admin/Seller editor module; its readonly preview uses `/theme-studio/preview.html`.
- `/seller-theme/`: actual Seller authentication and policy-scoped access. It is not a Stocky delivery receipt.
- `npm run build:theme-platform` builds the shared module, full workshop, Seller shell and integrated Admin entry. The normal Admin standalone artifact has its separate existing build command.

The full workshop lives in `studio-core/dist-workshop`; it is not a new preview server or a replacement storefront. Its protected original source remains unchanged. The dedicated opt-in server route serves its resources below `/studio-pro/` to avoid collisions with existing Admin assets.

## Authority and honest state

### Selected theme appearance

The first native Classic sample was a schema example with a generic header and two blocks. Its reference thumbnail was not a faithful representation of the running template. The owner reported this mismatch during browser acceptance; it is not an acceptable ready-theme experience.

Original theme presentation is therefore an immutable, reviewed package identity, separate from the editable document and canonical commerce data. The runtime selects the original trusted presentation code and styles by that identity. Products, categories, prices, stock, variants and legal information come from the scoped backend. Missing server records are never filled with the theme's sample catalog. Unverified schema examples must not be offered as an exact ready-made design, and an unsupported original gallery selection must not silently select a different package.

The Classic correction uses a new package version; previously imported versions and assignments are not silently rewritten. Local acceptance imports the corrected version into its own fresh disposable database. The reference theme sources remain unchanged.

The initial workshop launch validates the normal Admin session through `/api/admin/theme-platform/workshop-launch`. The server supplies only the fixed same-origin entry. No access token or impersonation token is placed in navigation URLs. Expired sessions return to the existing root Admin login.

The original design gallery, campaign canvas, authoring history and local design experiments retain their local behavior. Their local publish operation does not publish a live customer site. The workshop's offer section uses real authenticated server records, scoped assets, immutable theme packages, policy checks and draft revisions. These two authorities are deliberately stated in the UI.

Admin and Seller use the same editor/schema/renderer. Seller-as-seen is a readonly projection of an actual authorized Seller principal. The backend independently checks every mutation; hiding an editor control is never the authorization boundary.

## Seller corrections

- Refresh the outer profile summary with the same current policy as the mounted editor.
- Clone trusted cross-frame documents into the receiving JavaScript realm before strict validation; do not weaken the shared validator.
- Preserve the sidebar's layout space so it cannot cover the heading or layer panel.
- Protect unsaved work on store switching, editor reopening and sign-out; reject stale history responses after policy closure or scope changes.
- Resolve category previews using the scoped canonical catalog, including child categories.
- App previews use touch navigation and configured bottom tabs, without the desktop footer.

## Separate delivery gates

Real Stocky delivery, live publication, domain ownership/DNS/TLS, customer account/cart/order/payment flows, production migrations and native Android delivery are separate work. The preview can inspect canonical products, variants, stock, public reviews/questions and server-calculated quote totals; it does not create an order, reserve stock or take payment. Unsupported collection preview targets remain explicitly unavailable instead of inventing catalog membership.

Test execution and browser evidence are recorded in the Wave 2 delivery report. Source/build inspection alone must not be reported as production or native Android acceptance.
