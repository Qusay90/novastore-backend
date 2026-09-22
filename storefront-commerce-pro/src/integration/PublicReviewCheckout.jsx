import {useState} from 'react';
const money = new Intl.NumberFormat('tr-TR',{style:'currency',currency:'TRY'});
export function PublicReviewCheckout({items=[]}) {
  const [step,setStep]=useState(0);
  const stages=['Sepet özeti','Teslimat','Alışveriş koşulları'];
  return <main id="main-content" className="page commerce-page"><div className="shell"><section className="legal-document-card">
    <span className="section-kicker">Alışverişe hazırlık</span><h1>Alışveriş koşullarını inceleyin</h1>
    <p role="status">NovaStore yayına hazırlanıyor. Gerçek sipariş ve ödeme henüz kullanılamıyor; kart bilgisi istenmiyor.</p>
    <nav aria-label="Alışveriş inceleme adımları" className="public-review-steps">{stages.map((label,index)=><button type="button" key={label} className={index===step?'primary-button':'secondary-button'} aria-current={step===index?'step':undefined} onClick={()=>setStep(index)}>{index+1}. {label}</button>)}</nav>
    <h2>{stages[step]}</h2>
    {step===0 && <>{items.length ? <><ul className="public-review-items">{items.map(({product,quantity,cartKey})=><li key={cartKey||product.id}><a href={`#/urun/${product.slug}`}>{product.name}</a><span>{quantity} adet · {product.pricePending?'Doğrulanıyor':money.format(product.price*quantity)}</span></li>)}</ul><p><strong>Ürün toplamı: {items.some(item=>item.product.pricePending)?'Doğrulanıyor':money.format(items.reduce((total,item)=>total+item.product.price*item.quantity,0))}</strong></p><p>Bu tutar katalog ürün toplamıdır. Kargo ve diğer koşullar gerçek satış açıldığında ödeme öncesinde bildirilecektir.</p></> : <p>Sepetiniz henüz boş. <a href="/">Ürünleri inceleyebilirsiniz.</a></p>}</>}
    {step===1 && <><p>Satış başladığında teslimat adresi bu aşamada seçilecek; kargo ücreti ve teslimat koşulları onaydan önce sunulacaktır.</p><p>Yayına hazırlık süresince adres veya alıcı bilgisi toplamıyoruz.</p><a href="/teslimat-ve-kargo-kosullari">Teslimat ve kargo koşulları</a></>}
    {step===2 && <><nav aria-label="Ödeme öncesi bilgilendirme"><p><a href="/on-bilgilendirme-formu">Ön bilgilendirme formu</a></p><p><a href="/mesafeli-satis-sozlesmesi">Mesafeli satış sözleşmesi</a></p><p><a href="/iptal-iade-cayma-politikasi">İptal, iade ve cayma</a></p></nav><p>Bu hazırlık metinlerini okumak bir sözleşme kabulü veya sipariş oluşturmaz.</p><p role="status"><strong>Ödeme henüz kullanılamıyor.</strong> Satış ve ödeme hizmetimiz gerekli hazırlıklar tamamlandığında açılacaktır.</p><button type="button" className="primary-button" disabled>Ödeme yakında</button></>}
    <div className="checkout-navigation"><a href="#/sepet">Sepeti düzenle</a>{step<2&&<button type="button" className="primary-button" onClick={()=>setStep(step+1)}>Devam et</button>}{step>0&&<button type="button" onClick={()=>setStep(step-1)}>Geri</button>}</div>
  </section></div></main>;
}
