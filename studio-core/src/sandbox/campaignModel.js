/** Presentation planning only. No discount, checkout or publication authority. */
export const MAX_CAMPAIGN_PACKAGES = 80;
export const MAX_PACKAGE_BLOCKS = 20;
export const CAMPAIGN_SECTORS = ['all','electronics','fashion','home','beauty','sports','kids','grocery','pets','books','garden'];
export const CAMPAIGN_SEASONS = ['all','spring','summer','autumn','winter','special','commerce'];
const copy = value => JSON.parse(JSON.stringify(value));
const idPattern = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/;
const formatters = new Map();
function formatter(zone) {
  if (typeof zone !== 'string' || zone.length > 80) throw Error('Geçerli bir IANA saat dilimi seç.');
  try { if (!formatters.has(zone)) formatters.set(zone,new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'})); return formatters.get(zone); }
  catch { throw Error('Saat dilimi tanınmıyor. Örn. Europe/Istanbul.'); }
}
function parts(date,zone) { return Object.fromEntries(formatter(zone).formatToParts(date).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)])); }
function wallParts(value) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw Error('Tarihi yıl, ay, gün ve saat olarak seç.');
  const [year,month,day,hour,minute]=value.split(/[-T:]/).map(Number),stamp=Date.UTC(year,month-1,day,hour,minute),d=new Date(stamp);
  if (year<2000||year>2101||d.getUTCFullYear()!==year||d.getUTCMonth()+1!==month||d.getUTCDate()!==day||hour>23||minute>59) throw Error('Geçerli bir tarih ve saat seç.');
  return {year,month,day,hour,minute,stamp};
}
export function toZonedInput(value,timeZone='Europe/Istanbul') {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) { wallParts(value); return value; }
  const date=new Date(value); if(!Number.isFinite(date.getTime())) throw Error('Tarih okunamadı.');
  const p=parts(date,timeZone),pad=n=>String(n).padStart(2,'0');return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}
export const toLocalInput = toZonedInput;
export function zonedLocalToISO(value,timeZone='Europe/Istanbul') {
  if (!value) return '';
  const p=wallParts(value),offsets=new Set(); formatter(timeZone);
  for(let hour=-48;hour<=48;hour+=12){const stamp=p.stamp+hour*3600000,q=parts(new Date(stamp),timeZone);offsets.add(Date.UTC(q.year,q.month-1,q.day,q.hour,q.minute,q.second)-stamp);}
  const candidates=[...offsets].map(offset=>p.stamp-offset).filter(stamp=>toZonedInput(new Date(stamp).toISOString(),timeZone)===value);
  if(candidates.length!==1) throw Error(candidates.length?'Bu saat yaz/kış saati geçişinde iki kez oluşuyor. Tek anlamlı başka bir saat seç.':'Bu yerel saat yaz/kış saati geçişinde oluşmuyor. Başka bir saat seç.');
  return new Date(candidates[0]).toISOString();
}
function safeTree(value,depth=0){if(depth>24)throw Error('Paket çok derin.');if(value&&typeof value==='object')for(const key of Object.keys(value)){if(['__proto__','prototype','constructor'].includes(key))throw Error('Paket güvenli olmayan alan içeriyor.');safeTree(value[key],depth+1);}}
export function normalizeCampaign(value) {
  if(value===undefined)return undefined;
  safeTree(value);if(!value||Array.isArray(value)||typeof value!=='object')throw Error('Kampanya ayarları nesne olmalı.');
  const allowed=['version','sourceId','sector','season','channels','year','timeZone','scheduleMode','startsLocal','endsLocal','targetPage','placement','afterBlockId','note'];
  for(const key of Object.keys(value))if(!allowed.includes(key))throw Error(`Tanınmayan kampanya alanı: ${key}`);
  const str=(key,fallback,max)=>{const v=value[key]??fallback;if(typeof v!=='string'||v.length>max)throw Error(`${key}: metin sınırı aşıldı.`);return v;};
  const enumValue=(key,fallback,choices)=>{const v=value[key]??fallback;if(!choices.includes(v))throw Error(`${key}: desteklenmeyen seçenek.`);return v;};
  if(value.version!==undefined&&value.version!==1)throw Error('Kampanya sürümü desteklenmiyor.');
  const sourceId=str('sourceId','',100),afterBlockId=str('afterBlockId','',100),targetPage=str('targetPage','home',110);
  if(sourceId&&!idPattern.test(sourceId)||afterBlockId&&!idPattern.test(afterBlockId)||!(/^(?:(?:template|page):)?[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/.test(targetPage)))throw Error('Paket kaynak veya hedef kimliği geçersiz.');
  const year=value.year??new Date().getFullYear();if(!Number.isInteger(year)||year<2000||year>2100)throw Error('Yıl 2000–2100 arasında olmalı.');
  const channels=value.channels??['web','android'];if(!Array.isArray(channels)||!channels.length||channels.length>2||new Set(channels).size!==channels.length||channels.some(c=>!['web','android'].includes(c)))throw Error('Paket kanallarını kontrol et.');
  const result={version:1,sourceId,sector:enumValue('sector','all',CAMPAIGN_SECTORS),season:enumValue('season','all',CAMPAIGN_SEASONS),channels:[...channels],year,timeZone:str('timeZone','Europe/Istanbul',80),scheduleMode:enumValue('scheduleMode','none',['none','manual','suggested']),startsLocal:str('startsLocal','',16),endsLocal:str('endsLocal','',16),targetPage,placement:enumValue('placement','append',['append','prepend','after']),afterBlockId,note:str('note','',1200)};
  formatter(result.timeZone);
  if(result.scheduleMode==='none'){result.startsLocal='';result.endsLocal='';}
  campaignSchedule(result);return result;
}
export function campaignSchedule(campaign) {
  if(!campaign||campaign.scheduleMode==='none')return {startsAt:'',endsAt:''};
  const startsAt=zonedLocalToISO(campaign.startsLocal,campaign.timeZone),endsAt=zonedLocalToISO(campaign.endsLocal,campaign.timeZone);
  if(startsAt&&endsAt&&Date.parse(endsAt)<=Date.parse(startsAt))throw Error('Bitiş başlangıçtan sonra olmalı.');
  return {startsAt,endsAt};
}
export function defaultCampaign(source={},channel='web',page='home') {return normalizeCampaign({version:1,sourceId:source.id||'',sector:source.sector||'all',season:source.season||'all',channels:source.channels||['web','android'],year:new Date().getFullYear(),timeZone:'Europe/Istanbul',scheduleMode:'none',startsLocal:'',endsLocal:'',targetPage:page,placement:'append',afterBlockId:'',note:''});}
export function prepareCampaignBlocks(blocks,campaign) { const normalized=normalizeCampaign(campaign);if(!normalized||normalized.scheduleMode==='none')return copy(blocks);const schedule=campaignSchedule(normalized);return copy(blocks).map(block=>({...block,...schedule})); }
export function insertCampaignBlocks(existing,blocks,campaign,capacity=80) {
  const c=normalizeCampaign(campaign);if(existing.length+blocks.length>capacity)throw Error('Sayfanın bölüm sınırı aşılıyor.');
  const next=[...existing],at=c.placement==='prepend'?0:c.placement==='after'?next.findIndex(b=>b.id===c.afterBlockId)+1:next.length;
  if(c.placement==='after'&&at===0)throw Error('Arkasına eklenecek bölüm artık bulunamıyor.');next.splice(at,0,...blocks);return next;
}
export function suggestCampaignDates(rule,year) {
  if(!Number.isInteger(year)||year<2000||year>2100)throw Error('Önce geçerli bir yıl seç.');
  if(!rule||rule.kind==='manual')return null;
  let start;
  if(rule.kind==='fixed')start=new Date(Date.UTC(year,rule.month-1,rule.day));
  else if(rule.kind==='nth-weekday'){const first=new Date(Date.UTC(year,rule.month-1,1));start=new Date(Date.UTC(year,rule.month-1,1+(rule.weekday-first.getUTCDay()+7)%7+(rule.nth-1)*7+(rule.offsetDays||0)));}
  else throw Error('Takvim önerisi desteklenmiyor.');
  const end=new Date(start.getTime()+(rule.days||1)*86400000),day=d=>d.toISOString().slice(0,10)+'T00:00';return {startsLocal:day(start),endsLocal:day(end)};
}
export function exportCampaignPackage(pack,channel) {return JSON.stringify({kind:'novastore-campaign-package',version:1,channel,package:{name:pack.name,blocks:copy(pack.blocks),...(pack.campaign?{campaign:normalizeCampaign(pack.campaign)}:{})}},null,2);}
export function parseCampaignPackage(raw) {
  if(typeof raw!=='string'||new TextEncoder().encode(raw).length>8_000_000)throw Error('Paket JSON dosyası en fazla 8 MB olabilir.');
  const data=JSON.parse(raw);safeTree(data);
  if(data.kind!=='novastore-campaign-package'||data.version!==1||!['web','android'].includes(data.channel)||Object.keys(data).some(k=>!['kind','version','channel','package'].includes(k)))throw Error('Desteklenen Nova Store kampanya paketi seç.');
  const p=data.package;if(!p||Array.isArray(p)||typeof p.name!=='string'||!p.name.trim()||p.name.length>100||!Array.isArray(p.blocks)||!p.blocks.length||p.blocks.length>MAX_PACKAGE_BLOCKS||Object.keys(p).some(k=>!['name','blocks','campaign'].includes(k)))throw Error('Paket adı veya bölüm listesi geçersiz.');
  return {channel:data.channel,package:{name:p.name,blocks:copy(p.blocks),...(p.campaign?{campaign:normalizeCampaign(p.campaign)}:{})}};
}
