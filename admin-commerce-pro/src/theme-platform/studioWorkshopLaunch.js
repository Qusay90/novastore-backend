// The authenticated server owns launch configuration. Never infer a demo URL
// from a prior browser session or put credentials in the navigation target.
export function readStudioWorkshopLaunch(value) {
  if (!value || value.mode !== 'AUTHORING_WITH_SCOPED_OFFERS' || value.liveData !== false || value.uiPreserved !== true || value.sellerOffers !== 'SERVER_SCOPED') throw new Error('Özgün Studio atölyesi bu ortamda yapılandırılmamış.');
  if(value.url !== '/studio-pro/?surface=admin') throw new Error('Studio atölyesi yalnız onaylı aynı-origin adresinde açılabilir.');
  return Object.freeze({url:value.url,sellerOffersURL:value.url+'&panel=seller-offers',mode:value.mode,liveData:false,uiPreserved:true,sellerOffers:'SERVER_SCOPED'});
}
