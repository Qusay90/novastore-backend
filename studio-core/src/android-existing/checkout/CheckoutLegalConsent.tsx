import { CaretRightIcon, LockClosedIcon } from "@radix-ui/react-icons";

import type { CustomerCheckoutAgreement } from "./customerCheckoutApi";
import "./checkoutLegalConsent.css";

type CheckoutLegalConsentProps = Readonly<{
  documents: readonly CustomerCheckoutAgreement[];
  acceptedSlugs: ReadonlySet<string>;
  onConsentChange: (slug: string, accepted: boolean) => void;
}>;

export function CheckoutLegalConsent({
  documents,
  acceptedSlugs,
  onConsentChange,
}: CheckoutLegalConsentProps) {
  return (
    <section
      className="checkout-legal-consent"
      data-testid="checkout-legal-consent"
      aria-labelledby="checkout-legal-consent-title"
    >
      <header className="checkout-legal-consent-heading">
        <span aria-hidden="true"><LockClosedIcon /></span>
        <div>
          <h2 id="checkout-legal-consent-title">Sözleşmeler ve Onaylar</h2>
          <p>Her belgeyi inceleyip onayını ayrı ayrı işaretle.</p>
        </div>
      </header>
      <div className="checkout-legal-consent-list">
        {documents.map((document) => {
          const accepted = acceptedSlugs.has(document.slug);
          return (
            <article
              className="checkout-legal-document"
              data-testid={`checkout-legal-document-${document.slug}`}
              data-accepted={accepted ? "true" : "false"}
              data-document-version={document.version}
              data-document-content-sha256={document.contentSha256}
              key={document.slug}
            >
              <label className="checkout-legal-checkbox">
                <input
                  type="checkbox"
                  checked={accepted}
                  aria-label={`${document.title} sözleşmesini kabul et`}
                  data-testid={`checkout-legal-checkbox-${document.slug}`}
                  onChange={(event) => onConsentChange(document.slug, event.target.checked)}
                />
                <span>
                  <strong>{document.title}</strong>
                  <small>Metni görüntüleyip onayını işaretle.</small>
                </span>
              </label>
              <details className="checkout-legal-disclosure">
                <summary
                  aria-label={`${document.title} metnini görüntüle`}
                  data-testid={`checkout-legal-action-${document.slug}`}
                >
                  <span>Metni Oku</span>
                  <CaretRightIcon aria-hidden="true" />
                </summary>
                <div
                  className="checkout-legal-document-body"
                  role="region"
                  aria-label={`${document.title} metni`}
                  tabIndex={0}
                  data-scroll-drag="ignore"
                  data-testid={`checkout-legal-text-${document.slug}`}
                >
                  <pre>{document.text}</pre>
                </div>
              </details>
            </article>
          );
        })}
      </div>
    </section>
  );
}
