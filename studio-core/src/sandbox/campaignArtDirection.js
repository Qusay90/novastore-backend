import {createExpansionArtDirections} from './campaignExpansion.js';
/** Each campaign has an authored palette and image/copy geometry. These are
 * editable presentation scenes, independent of commerce data and shop themes. */
export const CAMPAIGN_DESIGN_FAMILIES=[['arch','Fenerli kemer'],['parcel','Hediye kurdelesi'],['coast','Ufuk çizgisi'],['window','Işıklı pencere'],['notebook','Çalışma defteri'],['confetti','Kutlama sahnesi'],['letter','Özenli mektup'],['record','Dairesel seçki'],['editorial','Dergi sayfası'],['botanical','Botanik albüm'],['trail','Rota ve hareket'],['postcard','Fotoğraf kartı'],['ritual','Günlük ritüel'],['table','Sofra hikâyesi'],['studio','Ürün stüdyosu'],['ticket','Seçki bileti']].map(([id,label])=>({id,label}));
const palettes={
 lantern:['#143d35','#fff8e8','#d6b976','#274c41'],evening:['#243c37','#faf4e4','#cfa96a','#35564b'],sage:['#f3f2e9','#34493f','#697956','#e2e8d9'],blush:['#f8eeea','#5b3d43','#a96e77','#eedcd6'],coast:['#f3eee3','#234c4c','#438b88','#ddecea'],sand:['#faf3e8','#674b32','#ba7d43','#eadcc4'],linen:['#f4eee5','#534436','#99784f','#e4d8c8'],frost:['#edf2f3','#344c58','#6c8c98','#d7e3e7'],school:['#f6f2e6','#334960','#577494','#e6d8b0'],plum:['#f4edf0','#563e4e','#916375','#e7d6dd'],forest:['#eef2e9','#3b513e','#6b8658','#dfe8d7'],clay:['#f8eee5','#6a4837','#ab7652','#ead9c8'],paper:['#f7f3eb','#44453d','#7d8366','#e9e5d7'],indigo:['#202b3a','#f0f3f6','#acbbc9','#35465a'],cherry:['#f8eeeb','#693e43','#a95e62','#efdbd7'],charcoal:['#282c2b','#f6f2e8','#c8bca0','#414945'],
};
// id, family, palette, photo [x,y,w,h], copy [x,y,w,h], title size,
// separate editable motif, small caption, alternative family, web aspect.
const directions=[
 ['ramadan','arch','lantern',[55,8,38,85],[8,20,41,65],54,'moon-star','Bir sofranın etrafında.','table',2.12],
 ['eid','parcel','blush',[7,13,39,70],[53,16,40,70],50,'gift','Bayramı paylaşarak güzelleştir.','letter',2.15],
 ['summer','coast','coast',[48,0,52,78],[6,17,36,70],53,'sun','Uzun günler, hafif seçimler.','postcard',2.18],
 ['winter','window','linen',[55,11,36,77],[7,18,40,70],51,'snowflake','İçeride güzel bir mevsim.','ritual',2.08],
 ['school','notebook','school',[56,15,37,70],[8,20,41,66],49,'notebook-pen','Yeni sayfalara yer aç.','editorial',2.15],
 ['new-year','confetti','cherry',[51,17,42,71],[8,18,38,66],50,'sparkles','Güzel başlangıçlar için.','parcel',2.05],
 ['special-day','letter','plum',[61,12,31,72],[9,18,42,68],50,'heart','Düşünüldüğünü hissettiren detaylar.','ritual',2.2],
 ['weekend','record','paper',[55,15,35,70],[7,17,40,70],51,'headphones','Kendine ayırdığın zaman.','postcard',2.0],
 ['spring-refresh','editorial','linen',[55,4,40,84],[7,15,41,75],51,'flower-2','Yeni ışık, yeni bir yaşam alanı.','window',2.2],
 ['spring-garden','botanical','forest',[8,12,39,78],[54,15,39,72],51,'sprout','Bir köşeden başlayan yeşillik.','postcard',2.06],
 ['spring-walk','trail','sage',[57,9,36,77],[7,17,42,71],49,'footprints','Adım adım, açık havaya.','coast',2.15],
 ['spring-wardrobe','editorial','blush',[5,8,42,84],[55,18,38,71],54,'shirt','Mevsimin hafif katmanları.','parcel',2.12],
 ['summer-travel','postcard','sand',[54,13,37,69],[7,18,40,70],54,'plane','Yola çıkmadan önce.','trail',2.18],
 ['summer-beach','coast','sand',[53,0,47,85],[7,14,39,75],49,'sunset','Sahil çantana küçük bir not.','record',2.1],
 ['summer-care','ritual','coast',[58,10,33,78],[8,19,42,71],50,'droplets','Güne eşlik eden küçük ritüeller.','window',2.08],
 ['summer-table','table','sage',[7,10,46,78],[61,18,32,74],48,'utensils','Sofranın yeri bu kez dışarısı.','postcard',2.16],
 ['autumn-home','window','clay',[7,11,40,78],[55,18,39,70],52,'lamp','Yavaşla. Evine kulak ver.','editorial',2.1],
 ['autumn-rain','trail','frost',[52,14,41,70],[6,18,39,70],48,'umbrella','Günlük rotana hazır ol.','notebook',2.16],
 ['autumn-reading','editorial','paper',[58,8,35,76],[8,15,44,74],61,'book-open','Sessiz bir köşe, yeni bir hikâye.','letter',2.18],
 ['autumn-coffee','record','clay',[8,16,35,70],[52,17,41,73],54,'coffee','Molanın sana ait hali.','table',2.0],
 ['winter-prep','window','frost',[57,9,35,79],[8,19,41,70],49,'snowflake','Mevsimin küçük hazırlıkları.','notebook',2.12],
 ['winter-outdoor','trail','frost',[51,5,44,88],[6,17,37,72],48,'mountain','Dışarıda keşfedilecek çok şey var.','postcard',2.12],
 ['winter-gaming','studio','indigo',[55,12,38,78],[7,19,40,70],56,'gamepad-2','Akşam için yeni bir plan.','record',2.14],
 ['winter-hobbies','notebook','paper',[6,15,42,74],[55,17,38,72],48,'palette','Kendi ellerinle yeni bir şey.','postcard',2.1],
 ['school-bag','notebook','school',[54,10,38,80],[8,16,39,74],49,'backpack','Çantaya sığan yeni başlangıçlar.','parcel',2.1],
 ['school-desk','editorial','sage',[53,5,43,84],[7,17,39,73],53,'pencil-ruler','Her şeyin kendine ait bir yeri var.','window',2.18],
 ['university-tech','studio','school',[56,16,36,73],[7,17,42,70],51,'laptop','Fikirlerine eşlik edecek parçalar.','notebook',2.12],
 ['semester-break','postcard','sand',[8,15,39,69],[54,18,39,70],55,'puzzle','Birlikte öğren, birlikte keşfet.','confetti',2.12],
 ['ramadan-table','table','sand',[49,6,45,87],[7,18,35,71],59,'nova-ramadan-lantern','Sofrada özen, buluşmada sıcaklık.','arch',2.12],
 ['ramadan-home','arch','evening',[7,9,37,81],[54,19,39,69],50,'moon-star','Misafirliğin en sıcak hali.','window',2.1],
 ['eid-gifts','parcel','sage',[55,13,37,72],[7,19,41,70],48,'gift','Küçük bir paket, güzel bir düşünce.','confetti',2.16],
 ['eid-style','editorial','blush',[7,5,41,85],[55,17,38,73],49,'flower-2','Kutlamanın kendine özgü hali.','letter',2.12],
 ['sacrifice-feast','table','linen',[8,13,42,74],[58,18,35,72],54,'moon-star','Güzel buluşmaların etrafında.','arch',2.08],
 ['mothers-day','letter','blush',[57,12,35,74],[8,16,42,73],49,'flower','Özenle seçilmiş bir teşekkür.','botanical',2.12],
 ['fathers-day','postcard','sage',[7,11,42,74],[56,19,38,70],52,'watch','Birlikte güzel anılar biriktir.','record',2.1],
 ['valentines','letter','cherry',[60,14,31,69],[9,17,43,72],55,'heart','Küçük jestlerin büyük anlamı.','parcel',2.16],
 ['womens-day','editorial','clay',[8,7,40,83],[55,17,39,73],53,'flower-2','Hikâyeye, emeğe, üretime.','notebook',2.14],
 ['childrens-day','confetti','school',[57,16,35,72],[8,16,41,73],56,'kite','Dünyaya hayallerinle bak.','postcard',2.1],
 ['youth-day','trail','sage',[6,8,44,82],[58,18,35,71],52,'flag','Birlikte yeni yollara.','studio',2.12],
 ['teachers-day','notebook','paper',[57,14,34,74],[8,18,41,71],49,'graduation-cap','Bir iz bırakanlara teşekkür.','letter',2.14],
 ['republic-day','confetti','cherry',[55,11,37,77],[8,19,40,68],60,'flag','Ortak umutlarla yarına.','editorial',2.14],
 ['family-time','table','sand',[5,8,46,83],[58,18,35,71],60,'puzzle','Aynı masada, aynı oyunda.','postcard',2.08],
 ['pet-care','botanical','sage',[55,12,37,76],[7,17,41,72],48,'paw-print','Onların küçük mutlulukları.','window',2.12],
 ['new-home','window','linen',[6,9,42,82],[56,17,38,73],49,'house','İlk köşeden, bütün bir eve.','editorial',2.14],
 ['wedding-season','parcel','paper',[58,12,33,76],[8,18,42,72],49,'heart-handshake','Birlikte kurulan yeni bir hikâye.','letter',2.16],
 ['baby-arrival','window','blush',[57,13,35,74],[8,18,42,71],53,'baby','En küçük detaylar, en büyük özen.','parcel',2.08],
 ['black-friday','ticket','charcoal',[62,10,31,80],[8,19,45,72],54,'shopping-bag','İhtiyacına göre, düşünerek seç.','studio',2.25],
 ['cyber-monday','studio','indigo',[7,11,43,80],[58,18,35,71],49,'mouse','Dijital hayatının yeni parçaları.','record',2.18],
 ['november-eleven','ticket','linen',[57,8,37,83],[8,19,41,70],60,'calendar-days','Kasımın seçilmiş buluşması.','confetti',2.24],
 ['year-end','confetti','forest',[7,13,43,75],[57,18,36,71],49,'sparkles','Güzel anıları yanında götür.','parcel',2.1],
 ['new-collection','editorial','paper',[53,0,47,87],[7,18,39,73],55,'shirt','Koleksiyonun ilk sayfası.','postcard',2.18],
 ['product-launch','studio','frost',[56,9,36,83],[7,18,41,72],56,'sparkles','Tasarımdan ayrıntıya, yakından.','record',2.12],
 ['store-anniversary','confetti','sand',[58,17,34,70],[8,18,42,70],56,'party-popper','Hikâyemizin bir parçasısın.','ticket',2.1],
 ['weekend-discovery','postcard','forest',[54,11,39,73],[7,17,40,73],49,'compass','Küçük keşifler için bir hafta sonu.','botanical',2.14],
 ['last-chance','ticket','paper',[7,10,39,79],[55,17,37,72],52,'package','Seçkinin kalan parçalarına bir bak.','editorial',2.2],
 ['gift-guide','parcel','plum',[54,15,38,69],[7,16,40,74],47,'gift','Önce onu düşün. Sonra hediyeni seç.','letter',2.12],
];
// Phone editions have their own photo/copy proportions. The values are
// intentionally authored per story, not calculated from the desktop viewport.
const mobileDirections={
 ramadan:[[13,50,74,46],[12,9,76,36],.79],eid:[[11,56,78,34],[12,10,76,40],.8],summer:[[0,0,100,50],[10,58,80,37],.85],winter:[[11,5,78,46],[10,58,80,36],.79],school:[[14,54,75,39],[14,9,75,40],.82],
 'new-year':[[10,53,80,39],[12,9,76,39],.8],'special-day':[[17,60,67,31],[13,10,74,45],.82],weekend:[[17,4,66,48],[10,59,80,36],.76],
 'spring-refresh':[[8,48,84,46],[8,9,84,34],.8],'spring-garden':[[11,53,78,41],[11,10,78,38],.81],'spring-walk':[[11,54,78,39],[9,9,82,40],.84],'spring-wardrobe':[[10,51,80,43],[10,10,80,36],.78],
 'summer-travel':[[12,6,76,42],[10,57,80,38],.83],'summer-beach':[[0,0,100,46],[10,55,80,41],.82],'summer-care':[[15,5,70,46],[11,58,78,37],.8],'summer-table':[[6,5,88,48],[11,60,78,35],.84],
 'autumn-home':[[10,6,80,44],[11,58,78,37],.83],'autumn-rain':[[13,52,74,42],[10,9,80,38],.8],'autumn-reading':[[9,50,82,44],[9,10,82,34],.82],'autumn-coffee':[[15,4,70,49],[11,59,78,36],.78],
 'winter-prep':[[13,7,74,43],[10,58,80,36],.8],'winter-outdoor':[[9,52,82,42],[10,9,80,38],.82],'winter-gaming':[[8,52,84,42],[10,9,80,38],.8],'winter-hobbies':[[14,55,75,38],[14,10,75,39],.84],
 'school-bag':[[14,54,76,39],[14,10,75,39],.8],'school-desk':[[7,49,86,45],[9,9,82,35],.82],'university-tech':[[11,53,78,40],[10,9,80,39],.81],'semester-break':[[11,7,78,40],[10,56,80,39],.81],
 'ramadan-table':[[7,4,86,49],[11,60,78,35],.8],'ramadan-home':[[17,51,66,43],[11,9,78,36],.83],'eid-gifts':[[12,55,76,36],[11,10,78,39],.82],'eid-style':[[11,50,78,44],[10,10,80,35],.8],
 'sacrifice-feast':[[8,6,84,45],[10,58,80,36],.83],'mothers-day':[[14,59,72,32],[12,10,76,44],.81],'fathers-day':[[10,6,80,41],[10,56,80,39],.84],valentines:[[19,59,62,32],[12,10,76,44],.8],
 'womens-day':[[7,48,86,46],[9,9,82,34],.81],'childrens-day':[[11,54,78,39],[10,10,80,39],.81],'youth-day':[[10,53,80,40],[10,9,80,39],.83],'teachers-day':[[15,55,74,38],[14,10,75,39],.82],
 'republic-day':[[10,52,80,41],[10,10,80,37],.8],'family-time':[[5,5,90,47],[10,59,80,36],.85],'pet-care':[[10,52,80,42],[10,9,80,38],.8],'new-home':[[9,6,82,45],[10,59,80,36],.81],
 'wedding-season':[[16,56,68,35],[11,9,78,41],.79],'baby-arrival':[[14,6,72,43],[11,57,78,38],.81],'black-friday':[[10,55,80,36],[11,10,78,38],.82],'cyber-monday':[[10,54,80,39],[11,10,78,39],.82],
 'november-eleven':[[11,54,78,37],[11,10,78,38],.8],'year-end':[[13,54,74,39],[11,10,78,39],.83],'new-collection':[[6,50,88,44],[9,9,82,36],.8],'product-launch':[[7,53,86,40],[10,9,80,39],.83],
 'store-anniversary':[[12,53,76,39],[11,10,78,38],.82],'weekend-discovery':[[10,6,80,43],[10,58,80,37],.8],'last-chance':[[12,53,76,38],[11,10,78,37],.81],'gift-guide':[[13,57,74,34],[11,9,78,43],.82],
};
const layoutFor={arch:'poster',parcel:'collage',coast:'split',window:'showcase',notebook:'split',confetti:'poster',letter:'editorial',record:'showcase',editorial:'editorial',botanical:'collage',trail:'split',postcard:'collage',ritual:'showcase',table:'editorial',studio:'showcase',ticket:'ribbon'};
export const CAMPAIGN_ART_DIRECTIONS=Object.fromEntries(directions.map(([id,family,palette,photo,copy,fontSize,motif,note,secondary,aspectRatio],index)=>{const[background,text,accent,surface]=palettes[palette],[mobilePhoto,mobileCopy,mobileAspect]=mobileDirections[id];return[id,{id,family,familyLabel:CAMPAIGN_DESIGN_FAMILIES.find(f=>f.id===family).label,layout:layoutFor[family],secondary,photo,copy,fontSize,motif,note,aspectRatio,mobile:{photo:mobilePhoto,copy:mobileCopy,aspectRatio:mobileAspect},palette:{background,text,accent,surface},index,image:`/media/campaigns-20260915/${id}.webp`}];}));
Object.assign(CAMPAIGN_ART_DIRECTIONS,createExpansionArtDirections(CAMPAIGN_DESIGN_FAMILIES));
export const CAMPAIGN_ART_DIRECTION_COUNT=Object.keys(CAMPAIGN_ART_DIRECTIONS).length;
export const CAMPAIGN_ART_DIRECTION_REVISION='2026-09-15-authored';
export function getCampaignArtDirection(pack){const id=typeof pack==='string'?pack:pack?.id;return CAMPAIGN_ART_DIRECTIONS[id]||{...CAMPAIGN_ART_DIRECTIONS['gift-guide'],id:id||'custom',image:pack?.image||CAMPAIGN_ART_DIRECTIONS['gift-guide'].image};}
