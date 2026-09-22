// Build-time allowlist: these exact original raster bytes have recorded SHA-256 provenance.
const modules=import.meta.glob('../bundled-assets/media/**/*.webp',{eager:true,query:'?url',import:'default'});
export const bundledCampaignAssets=Object.freeze(Object.fromEntries(Object.entries(modules).map(([path,url])=>[path.replace('../bundled-assets',''),url])));
