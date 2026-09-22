import {CAMPAIGN_COPY} from './campaignCopy.js';
import {EXPANSION_CAMPAIGN_PACKS} from './campaignExpansion.js';
import {getCampaignArtDirection} from './campaignArtDirection.js';
import { SEASON_PACKS, cloneSectionBlocks } from './designLibrary.js';
import { defaultCampaign, campaignSchedule } from './campaignModel.js';
import {campaignCanvasVariants} from './campaignCanvasPresets.js';
export const SECTOR_LABELS={all:'Tüm sektörler',electronics:'Teknoloji',fashion:'Moda',home:'Ev & yaşam',beauty:'Bakım & güzellik',sports:'Spor & açık hava',kids:'Çocuk & oyuncak',grocery:'Market & mutfak',pets:'Evcil dostlar',books:'Kitap & hobi',garden:'Bahçe'};
export const SEASON_LABELS={all:'Her dönem',spring:'İlkbahar',summer:'Yaz',autumn:'Sonbahar',winter:'Kış',special:'Özel günler',commerce:'Mağaza kampanyaları'};
const manual=label=>({kind:'manual',label}),fixed=(month,day,days=1)=>({kind:'fixed',month,day,days,label:'Seçilen yılda sabit takvim günü; yayın aralığını gözden geçir.'}),nth=(month,weekday,nth,offsetDays=0)=>({kind:'nth-weekday',month,weekday,nth,offsetDays,days:1,label:'Türkiye takvimindeki hafta kuralından öneri; kapsamı sen belirlersin.'});
const sectors={electronics:['/media/hero-editorial.webp','#edf0f8','#253759','electronics'],fashion:['/media/product-fashion.webp','#faeee9','#623d36','fashion'],home:['/media/category-home.webp','#f1ede3','#3c4735','home-living'],beauty:['/media/category-cosmetics.webp','#f7edf1','#634357','beauty'],sports:['/media/category-sports.webp','#e7f2ed','#235548','sports-outdoor'],kids:['/media/category-toys.webp','#fff1de','#765129','kids-toys'],grocery:['/media/category-home.webp','#edf3e4','#40532c',''],pets:['/media/category-home.webp','#f6eee3','#6b4f33',''],books:['/media/hero-editorial.webp','#efede8','#44443c',''],garden:['/media/category-home.webp','#eaf3e7','#355333',''],all:['/media/product-watch.webp','#eef1f6','#35455f','']};
// Authored campaign ideas, not generated holidays or automatic price rules.
const rows=[
 ['spring-refresh','İlkbahar · Evi yenile','spring','home','Evinin yeni mevsimi.','Hafif dokular, düzenleme ve yaşam alanı için taze fikirler.','editorial',fixed(3,1,14)],
 ['spring-garden','İlkbahar · Balkon ve bahçe','spring','garden','Küçük bir yeşil alan aç.','Saksı, bakım araçları ve açık hava köşelerini birlikte sun.','guide',manual('İklim ve yerel hazırlık dönemine göre tarih seç.')],
 ['spring-walk','İlkbahar · Açık havaya çık','spring','sports','Yolun açık havaya çıksın.','Yürüyüş ve hafif antrenman için seçilmiş ekipmanlar.','collection',manual('Mağazanın ilkbahar koleksiyon tarihlerini seç.')],
 ['spring-wardrobe','İlkbahar · Hafif gardırop','spring','fashion','Kat kat, hafif hafif.','Geçiş mevsimi kombinlerini ürün gruplarıyla anlat.','editorial',manual('Koleksiyonun hazır olduğu aralığı seç.')],
 ['summer-travel','Yaz · Yolculuk hazırlığı','summer','sports','Yeni rotalara hazırlan.','Valiz, seyahat aksesuarı ve yol arkadaşlarını bir araya getir.','guide',manual('Tatil veya teslimat dönemini sen belirle.')],
 ['summer-beach','Yaz · Sahil çantası','summer','fashion','Sahil günlerine küçük bir seçki.','Plaj giyimi ve günlük aksesuarları uyumlu bir vitrinde sun.','collection',manual('Bölgesel yaz sezonuna göre tarih seç.')],
 ['summer-care','Yaz · Bakım rutini','summer','beauty','Yaz rutinini yeniden düşün.','Kişisel bakım ürünlerini kullanım bilgileriyle birlikte öne çıkar.','guide',manual('Ürün etiketlerindeki bilgileri doğrula; sağlık iddiası ekleme.')],
 ['summer-table','Yaz · Açık hava sofrası','summer','grocery','Güzel buluşmalar dışarı taşınsın.','Piknik, sunum ve sofra hazırlığı için bir seçki kur.','editorial',manual('Yerel yaz ve etkinlik tarihlerine göre planla.')],
 ['autumn-home','Sonbahar · Sıcak dokular','autumn','home','Evinin yavaşlayan ritmi.','Örtü, aydınlatma ve ev aksesuarlarına mevsimsel alan aç.','editorial',fixed(9,1,14)],
 ['autumn-rain','Sonbahar · Yağmura hazır','autumn','fashion','Hava değişir, hazırlığın kalır.','Dış giyim ve günlük aksesuarları birlikte göster.','collection',manual('İklim ve stok durumuna göre tarih seç.')],
 ['autumn-reading','Sonbahar · Okuma köşesi','autumn','books','Bir sayfa daha.','Kitap, masa lambası ve hobi araçlarını ilham veren bir köşede topla.','editorial',manual('Okuma seçkinin yayın aralığını belirle.')],
 ['autumn-coffee','Sonbahar · Kahve molası','autumn','grocery','Kendi molanı hazırla.','Kahve, demleme ve kupa seçkisini bir arada keşfettir.','guide',manual('Mağazanın kahve seçkisine uygun tarih seç.')],
 ['winter-prep','Kış · Mevsime hazırlan','winter','home','Soğuk günler için düşünülmüş.','Ev tekstili ve günlük hazırlık ürünlerini öne çıkar.','guide',manual('Yerel hava ve teslimat takvimine göre aralık seç.')],
 ['winter-outdoor','Kış · Dışarıda hareket','winter','sports','Mevsim değişse de hareket sürsün.','Kış yürüyüşü ve açık hava ekipmanlarını karşılaştırmalı sun.','collection',manual('Bölgesel kış dönemi ve ürün uygunluğunu kontrol et.')],
 ['winter-gaming','Kış · Oyun ve eğlence','winter','electronics','Akşamın yeni oyunu.','Oyun aksesuarı, ses ve ekran seçkilerini ayrı raflarda sun.','launch',manual('Ürünlerin satışa hazır olduğu tarihleri seç.')],
 ['winter-hobbies','Kış · Evde üret','winter','books','Bir şeyler üretmeye zaman ayır.','Hobi malzemeleri ve başlangıç setleriyle keşfi kolaylaştır.','guide',manual('Atölye veya hobi kampanyasının tarihini seç.')],
 ['school-bag','Okul · Çantayı hazırla','autumn','kids','Yeni dönemin küçük hazırlıkları.','Çanta, kırtasiye ve günlük okul ihtiyaçlarını seç.','guide',manual('Eğitim yılı takvimini doğrulayıp tarihleri elle seç.')],
 ['school-desk','Okul · Çalışma alanı','autumn','home','Odaklanmak için bir köşe.','Masa, sandalye ve düzenleyicileri işlevlerine göre grupla.','editorial',manual('Eğitim yılının yerel takvimini kullan.')],
 ['university-tech','Üniversite · Teknoloji seçkisi','autumn','electronics','Yeni hedeflerine eşlik etsin.','Taşınabilir bilgisayar ve çalışma aksesuarlarını ihtiyaca göre göster.','guide',manual('Üniversite ve mağaza takvimine göre tarih seç.')],
 ['semester-break','Sömestr · Birlikte keşfet','winter','kids','Tatilde küçük keşifler.','Oyun, kitap ve yaratıcı etkinlik ürünlerini bir araya getir.','collection',manual('Seçilen eğitim yılının resmi tatil tarihlerini elle doğrula.')],
 ['ramadan-table','Ramazan · Sofra hazırlığı','special','grocery','Sofrana özen kat.','Mutfak ve sunum seçkisi; ürünleri mağazanın stoğundan belirle.','guide',manual('Hicri takvim değişir. Seçilen yılın Ramazan aralığını doğrula.')],
 ['ramadan-home','Ramazan · Evde buluşma','special','home','Bir araya gelmenin güzel hali.','Ev, aydınlatma ve misafir hazırlığı için sıcak bir vitrin.','editorial',manual('Seçilen yılın Ramazan tarihlerini doğrulayıp gir.')],
 ['eid-gifts','Bayram · Hediye fikirleri','special','all','Sevdiklerine düşünülmüş bir hediye.','Yaşa, ihtiyaca ve ilgiye göre kendi hediye seçkini kur.','gift',manual('Ramazan veya Kurban Bayramı tarihini seçilen yıl için doğrula.')],
 ['eid-style','Bayram · Yeni kombinler','special','fashion','Kutlamaya kendi stilinle katıl.','Giyim ve aksesuarları kombin odaklı bölümlerde sun.','editorial',manual('Bayram tarihini ve kargo son kabul gününü kendin belirle.')],
 ['sacrifice-feast','Kurban Bayramı · Buluşmalar','special','home','Birlikte geçirilen zamana.','Sofra, ev ve ziyaret hazırlıklarını aynı seçkide birleştir.','gift',manual('Kurban Bayramı tarihi yıldan yıla değişir; elle doğrula.')],
 ['mothers-day','Anneler Günü · Özenli seçimler','special','all','Bir teşekkürün pek çok yolu var.','İlgi alanlarına uygun hediyeleri kişiselleştir.','gift',nth(5,0,2)],
 ['fathers-day','Babalar Günü · Birlikte daha güzel','special','all','Birlikte güzel zamanlara.','Hobi, teknoloji ve günlük kullanım seçeneklerini bir araya getir.','gift',nth(6,0,3)],
 ['valentines','Sevgililer Günü · Küçük jestler','special','all','Sana özel bir düşünce.','Çift ürünler ve kişisel hediye fikirleri için bir başlangıç.','gift',fixed(2,14)],
 ['womens-day','8 Mart · Üreten kadınlar','special','all','Emeğe ve üretime alan aç.','Gerçek üretici hikâyeleri ve doğrulanmış seçkilerle içerik oluştur.','editorial',fixed(3,8)],
 ['childrens-day','23 Nisan · Çocukların dünyası','special','kids','Hayal etmeye yer aç.','Oyun, kitap ve üretim araçlarını yaş uygunluğuna göre sun.','collection',fixed(4,23)],
 ['youth-day','19 Mayıs · Gençlik ve hareket','special','sports','Yeni yollar, yeni hedefler.','Spor ve açık hava seçkisini günlük kullanıma göre düzenle.','collection',fixed(5,19)],
 ['teachers-day','24 Kasım · Emek için teşekkür','special','books','Bir teşekkür, yeni bir hikâye.','Kitap, masa aksesuarı ve düşünülmüş hediyeleri öne çıkar.','gift',fixed(11,24)],
 ['republic-day','29 Ekim · Birlikte geleceğe','special','all','Birlikte geleceğe.','Mağazanın kutlama mesajı ve ürün seçkisi için sade bir alan.','event',fixed(10,29)],
 ['family-time','Aile · Birlikte zaman','special','kids','Birlikte oynayalım.','Aile oyunları ve ortak aktiviteler için seçki hazırla.','guide',manual('Ailenin veya mağazanın etkinlik aralığını seç.')],
 ['pet-care','Evcil dostlar · Günlük ihtiyaçlar','all','pets','Küçük dostların günlük dünyası.','Bakım, oyun ve yaşam alanı ürünlerini kullanımına göre grupla.','guide',manual('Kampanya tarihini ve ürün uygunluğunu sen doğrula.')],
 ['new-home','Yeni ev · İlk ihtiyaçlar','all','home','Yeni başlangıcın ilk parçaları.','Temel yaşam alanları için ürün grupları ve seçme rehberi.','guide',manual('Taşınma veya ev kampanyasının tarihlerini seç.')],
 ['wedding-season','Düğün · Birlikte bir ev','summer','home','Yeni bir hayatın küçük detayları.','Ev hazırlığı ve hediye seçkisini kategorilerle düzenle.','gift',manual('Bölgesel düğün sezonu değişebilir; aralığı seç.')],
 ['baby-arrival','Bebek · İlk hazırlıklar','all','kids','Yeni bir dünyaya merhaba.','İhtiyaç listesi ve yaşa uygun ürün seçimiyle rehber hazırla.','guide',manual('Ürün yaş ve kullanım uyarılarını doğrula; tarihi sen seç.')],
 ['black-friday','Kasım · Black Friday seçkisi','commerce','all','Kasım seçkini keşfet.','Yalnız onaylı fiyat ve kampanya kurallarına bağlı ürünleri göster.','launch',nth(11,4,4,1)],
 ['cyber-monday','Kasım · Cyber Monday','commerce','electronics','Dijital hayatına yeni seçimler.','Teknoloji ürünlerini ihtiyaca ve doğrulanmış güncel fiyatlara göre sun.','launch',nth(11,4,4,4)],
 ['november-eleven','11.11 · Kasım buluşması','commerce','all','Seçim zamanı.','Kendi doğrulanmış tekliflerini ve seçili ürünlerini aynı vitrinde buluştur.','event',fixed(11,11)],
 ['year-end','Yıl sonu · Son seçkiler','winter','all','Yılı güzel seçimlerle tamamla.','Hediye ve günlük ihtiyaçları ayrı bölümlerde sun.','gift',fixed(12,15,16)],
 ['new-collection','Yeni koleksiyon · İlk bakış','commerce','fashion','Yeni koleksiyonla tanış.','Koleksiyon hikâyesi, ürün rafı ve stil notlarını bir araya getir.','launch',manual('Gerçek koleksiyon çıkış tarihini gir.')],
 ['product-launch','Ürün lansmanı · Yakından keşfet','commerce','electronics','Yeni ürüne yakından bak.','Doğrulanmış özellikler, ürün seçkisi ve soru yanıtları için bir paket.','launch',manual('Ürünün satış veya önizleme tarihini yetkili kaynaktan seç.')],
 ['store-anniversary','Mağaza yıldönümü · Birlikte büyüdük','commerce','all','Birlikte yeni bir yıl.','Gerçek mağaza hikâyeni ve özel seçkini paylaş.','event',manual('Mağazanın gerçek kuruluş tarihini seç; yıl sayısını kendin doğrula.')],
 ['weekend-discovery','Hafta sonu · Yeni keşifler','commerce','all','Bu hafta sonu ne keşfedeceksin?','Kısa süreli ürün keşfi için esnek bir vitrin.','collection',manual('Belirli hafta sonunun başlangıç ve bitişini seç.')],
 ['last-chance','Son seçki · Stoktakileri keşfet','commerce','all','Seçkideki son parçalar.','Yalnız güncel stoğu doğrulanmış ürünleri görünür yap.','collection',manual('Stok ve bitiş zamanını backend verisiyle doğrula; sayaç tahmin etmez.')],
 ['gift-guide','Hediye rehberi · İlgiye göre seç','all','all','Doğru hediye, iyi bir düşünceyle başlar.','Hobi, yaşam tarzı ve ihtiyaçlara göre kendi hediye rehberini düzenle.','gift',manual('Yıl boyu kullan veya kendi tarih aralığını seç.')],
];
const layoutTypes={editorial:['editorial','products','text'],guide:['banner','products','faq'],collection:['banner','products','categories'],gift:['hero','products','text','faq'],launch:['hero','text','products','faq'],event:['announcement','banner','products','text']};
const baseCampaignPacks=[...SEASON_PACKS.map(p=>({...p,sector:({electronics:'electronics',fashion:'fashion','home-living':'home',beauty:'beauty','sports-outdoor':'sports'}[p.categoryId]||'all'),season:({summer:'summer',winter:'winter',school:'autumn',weekend:'all'}[p.id]||'special'),channels:['web','android'],layout:'editorial',rule:manual('Takvim yılına göre tarihi doğrulayıp elle seç.'),types:['banner','products','text']})),...rows.map(([id,name,season,sector,title,description,layout,rule])=>{const [image,background,text,categoryId]=sectors[sector];return{id,name,occasion:name.split(' · ')[0],season,sector,title,description,layout,rule,categoryId,image,colors:{background,text,accent:text},channels:['web','android'],types:layoutTypes[layout],blockCount:layoutTypes[layout].length};})];
export const CAMPAIGN_PACKS=[...baseCampaignPacks,...EXPANSION_CAMPAIGN_PACKS].map(pack=>{
  const art=getCampaignArtDirection(pack),copy=CAMPAIGN_COPY[pack.id];
  return {...pack,image:art.image,colors:{background:art.palette.background,text:art.palette.text,accent:art.palette.accent},description:copy?.[0]||pack.description,editorialText:copy?.[0]||pack.description,productsTitle:copy?.[1]||pack.productsTitle};
});
export function createCampaignBlocks(packId,channel='web',{catalog={products:[],categories:[]},campaign,theme={},variant=0,canvas}={}) {
  const pack=CAMPAIGN_PACKS.find(p=>p.id===packId);if(!pack)throw Error('Hazır kampanya bulunamadı.');
  const category=catalog.categories?.find(c=>String(c.id)===pack.categoryId),source=category?{mode:'category',categoryId:String(category.id),productIds:[]}:{mode:'selected',categoryId:'',productIds:[]};
  const schedule=campaignSchedule(campaign||defaultCampaign(pack,channel)),target=category?`category:${category.id}`:'categories';
  const base={enabled:true,...schedule,showCopy:true,showTitle:true,visibility:{desktop:true,mobile:true},items:[],productLimit:6,productSource:source,style:{background:'',textColor:'',padding:channel==='android'?16:40,align:'left',imagePosition:'right'},buttonText:'Seçkiyi keşfet',target};
  const composition=canvas||campaignCanvasVariants(pack,theme,channel)[variant%3].canvas;let canvasPlaced=false;
  return cloneSectionBlocks(pack.types.map((type,index)=>{
    const block={...base,type,title:pack.title,kicker:pack.occasion.toLocaleUpperCase('tr-TR'),description:pack.description};
    if(['hero','banner','editorial'].includes(type)){Object.assign(block,{image:pack.image,mobileImage:pack.image,alt:pack.name,style:{...base.style,background:pack.colors.background,textColor:pack.colors.text}});if(!canvasPlaced){block.campaignCanvas=composition;canvasPlaced=true;}}
    if(type==='products')Object.assign(block,{title:pack.productsTitle||`${pack.occasion} seçkisi`,kicker:'ÜRÜNLERİNİ SEÇ',description:'Seçkini ihtiyaçlarına göre incele.'});
    if(type==='text')Object.assign(block,{title:pack.productsTitle||'Kendi seçimini bul.',description:pack.editorialText||pack.description,style:{...base.style,align:'center'}});
    if(type==='faq')Object.assign(block,{title:'Seçerken aklında olsun',buttonText:'Yardım merkezi',target:'support',description:'',items:[{id:'choose',title:'Ürün ayrıntılarını nerede görebilirim?',body:'Ürüne tıklayarak özelliklerini ve mevcut seçeneklerini inceleyebilirsin.'},{id:'support',title:'Seçimim için nasıl destek alabilirim?',body:'Yardım merkezinden mağazaya ulaşabilirsin.'}]});
    if(type==='categories')Object.assign(block,{title:'Kategorilerle keşfet',description:'Aradığın gruba geç.',buttonText:'Tüm kategoriler'});
    if(type==='announcement')Object.assign(block,{title:pack.occasion,description:pack.title});
    return block;
  }));
}
