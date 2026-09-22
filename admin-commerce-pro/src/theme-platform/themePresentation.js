// These identities come only from the authenticated package catalog. The server
// resolves the immutable build registry; names, thumbnails and local demo IDs
// never confer renderer authority.
export function themePresentation(theme) {
  const value=theme?.presentation;
  if(theme?.document?.schemaVersion!==2||!value||typeof value!=='object'||
    !/^[a-z0-9][a-z0-9-]{0,79}$/.test(value.id||'')||
    !/^\d+\.\d+\.\d+$/.test(value.version||'')||
    !/^[a-f0-9]{64}$/.test(value.digest||'')||
    !/^[a-z0-9][a-z0-9-]{0,79}$/.test(theme.sourceThemeId||'')||
    !Array.isArray(theme.supportedChannels)||!theme.supportedChannels.length||
    theme.supportedChannels.some(channel=>!['web','app'].includes(channel)))return null;
  return value;
}

export function readyThemeChannels(theme) {
  const presentation=themePresentation(theme);
  return presentation?theme.supportedChannels.filter(channel=>theme.presentationReadiness?.some(item=>item.channel===channel&&
    item.status==='READY'&&item.presentationReady===true&&item.runtimeReady===true&&item.assignmentEligible===true&&
    ['presentation','customerRuntime','singleStoreRuntime','publication'].every(gate=>item.acceptance?.[gate]==='PASS'))):[];
}

export const isReadyTheme=(theme,channel)=>channel?readyThemeChannels(theme).includes(channel):readyThemeChannels(theme).length>0;
export const canPreviewTheme=(theme,channel)=>!!themePresentation(theme)&&(!channel||theme.supportedChannels.includes(channel));
export const unverifiedThemeMessage='Bu sürümün tasarım, müşteri işlemleri ve yayın kontrolleri henüz tamamlanmadı. Yeni mağaza atamasına kapalı.';
export const themeReadinessMessage=theme=>canPreviewTheme(theme)
  ?(isReadyTheme(theme)?'Kullanıma hazır · tasarım ve mağaza işlemleri doğrulandı.':theme.presentationReadiness?.find(item=>!item.assignmentEligible)?.reason||unverifiedThemeMessage)
  :'Özgün tasarım eşleşmesi doğrulanmadı. Başka bir tema görünümüyle açılmaz.';

export function resolveThemeIntent(themes,sourceThemeId,channel='web') {
  const normalizedChannel=channel==='android'?'app':channel;
  if(!sourceThemeId)return {status:'none',themes:[]};
  const matches=themes.filter(theme=>themePresentation(theme)&&theme.sourceThemeId===sourceThemeId&&isReadyTheme(theme,normalizedChannel));
  if(!matches.length)return {status:'unavailable',themes:[],message:'Seçtiğin tasarımın bu kanal için doğrulanmış sunucu paketi henüz yok. Başka bir tema seçilmedi.'};
  if(matches.length>1)return {status:'choose-version',themes:matches,message:'Bu tasarımın birden fazla doğrulanmış sürümü var. Sunmak istediğin sürümü seç.'};
  return {status:'ready',themes:matches,themeId:matches[0].id,channel:normalizedChannel};
}
