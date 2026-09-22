import {fail,normalizeTheme} from './model.js';

/** A mounted host supplies its own approved catalog. Demo props never fill gaps. */
export function resolveOfferThemeCatalog(localThemes,configuration) {
 if(configuration&&configuration.mode!=='host')fail('CONFIG','Satıcı teklif bağlantısı host modunda olmalı.');
 const source=configuration?configuration.themes:localThemes;
 if(!Array.isArray(source)||!source.length||source.length>200)fail('THEME',configuration?'Adminin onaylı tema kataloğu eksik veya geçersiz. Yerel temalar kullanılmadı.':'Tema koleksiyonu gerekli.');
 const themes=source.map(normalizeTheme);
 if(new Set(themes.map(theme=>theme.id)).size!==themes.length)fail('THEME','Tema kimliği tekrarlanıyor.');
 return themes;
}

/** Gallery hints may name demo-only themes; select only an approved catalog member. */
export function selectOfferThemeId(themes,requestedId) {
 return themes.some(theme=>theme.id===requestedId)?requestedId:themes[0]?.id||'';
}
