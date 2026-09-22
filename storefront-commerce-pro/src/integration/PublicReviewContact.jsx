export function PublicReviewContact({ contact }) {
  if (!contact) return null;
  return <section className="public-review-contact" aria-label="NovaStore iletişim ve kuruluş bilgileri">
    <p><strong>Yayına hazırlık / inceleme sürümü</strong><br />Gerçek ödeme kapalıdır.</p>
    <address><strong>{contact.brandName}</strong><p style={{ whiteSpace: "pre-line" }}>{contact.address}</p>
      <a href={contact.telephoneUri}>{contact.phone}</a><br /><a href={`mailto:${contact.email}`}>{contact.email}</a></address>
    {contact.pendingFields.map((text,index)=><p key={index}>{text}</p>)}
  </section>;
}
