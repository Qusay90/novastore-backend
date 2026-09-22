import ThemeWorkspaceBoundary from './sandbox/ThemeWorkspaceBoundary.jsx';
import React from 'react';
import {createRoot} from 'react-dom/client';
import {CommerceProRuntimeApp} from './storefront/src/IntegratedApp.jsx';
import {createCanonicalFixtureRuntime} from './storefront/src/integration/createCanonicalFixtureRuntime.js';
import Admin from './sandbox/studio/Studio.jsx';
import AndroidPreview from './sandbox/ExistingAndroidPreview.jsx';
import {DESIGN_PRESETS} from './sandbox/designLibrary.js';
import {getSectorCatalog} from './sandbox/sectorCatalog.js';
import {useSandbox} from './sandbox/useSandbox.js';
import {configureRuntimeCatalog} from './storefront/src/integration/runtimeCatalog.js';
import './storefront/src/canonical.css';
import './storefront/src/integrated.css';
import './storefront/src/demo-overrides.css';
import './shell.css';
import './storefront/src/store-demos.css';
import './storefront/src/store-demo-flows.css';
import './storefront/src/original-showcase.css';
import './sandbox/sector-showcase-v6.css';
import './storefront/src/pocket-web-v6.css';
import './sandbox/cart-feedback.css';
import {getCurrentMerchant,isUnknownMerchant,withMerchantScope} from './sandbox/merchantWorkspaces.js';
import {resolveVisualCategory} from './sandbox/visualDesign.js';
import {resolveCatalogFamily} from './sandbox/merchantDesign.js';

// The trial never instantiates the production runtime or any remote adapter.
// Reject programmatic requests as a second boundary behind CSP and the local API gate.
window.fetch = async () => {throw new Error('Bu bağımsız denemede sunucu bağlantısı kapalı.');};
window.XMLHttpRequest = class {constructor(){throw new Error('Denemede API bağlantısı kapalı.');}};
globalThis.__NOVASTORE_INTEGRATED_RUNTIME_OWNS_CART_HYDRATION__ = true;
const params = new URLSearchParams(location.search);
const surface = params.get('surface') || 'storefront';
const embedded = params.get('embed')==='1';
const draft = params.get('preview')==='draft';
const previewDesign = draft && DESIGN_PRESETS.find(item=>item.id===params.get('designPreview'));
const runtimeRegistry = new Map();
const previewDate = draft && params.get('previewAt') && Number.isFinite(Date.parse(params.get('previewAt'))) ? new Date(params.get('previewAt')) : null;

function TrialStorefront() {
  const document = useSandbox('web',draft);
  const sector = getSectorCatalog(resolveCatalogFamily(document));
  const merchant=getCurrentMerchant();
  const key = `${merchant?.id || 'main'}:${sector?.family || 'canonical'}`;
  const runtime = React.useMemo(() => {
    let selected = runtimeRegistry.get(key);
    if (!selected) {
      selected = createCanonicalFixtureRuntime({previewCustomer:!!previewDesign,catalog:sector,merchant});
      runtimeRegistry.set(key,selected);
    }
    // Activate a cached demo's catalog before its children read the shared projections.
    configureRuntimeCatalog(selected.catalog);
    return selected;
  },[key]);
  configureRuntimeCatalog({...runtime.catalog,categories:runtime.catalog.categories.map(category=>resolveVisualCategory(document.design,category))});
  return <CommerceProRuntimeApp key={key} runtime={runtime}/>;
}

function TrialShell({SellerOffersPanel}){if(isUnknownMerchant())return <main className="shell" style={{padding:"80px 24px"}}><h1>Mağaza bulunamadı</h1><p>Bu bağlantıya ait bir deneme mağazası yok.</p><a href="/?surface=admin&panel=merchants">Mağaza çalışma alanlarına dön</a></main>;return <>
  {!embedded && surface!=='admin' && (previewDesign || previewDate) && <aside className="trial-preview-banner"><strong>{previewDesign?`${previewDesign.name} · Tasarım önizlemesi`:''}{previewDesign&&previewDate?' · ':''}{previewDate?`${previewDate.toLocaleString('tr-TR')} görünümü`:''}</strong><span>Bu önizleme kayıtlı tasarımı değiştirmez.</span><a href={withMerchantScope("/?surface=admin")}>Stüdyoya dön</a></aside>}
  {!embedded && <aside className="trial-toolbar" aria-label="Deneme gezinmesi"><div><b>{getCurrentMerchant()?.name || "NovaStore Deneme"}</b><span>Bağımsız kopya · Örnek veriler</span></div><nav><a className={surface==='storefront'?'selected':''} href={withMerchantScope("/?surface=storefront")}>Müşteri sitesi</a><a className={surface==='admin'?'selected':''} href={withMerchantScope("/?surface=admin")}>Yönetim paneli</a><a className={surface==='android'?'selected':''} href={withMerchantScope("/?surface=android")}>Android önizleme</a></nav><span className="trial-status">{draft?'Taslak önizleme':'Yalnız bu denemeyi etkiler'}</span></aside>}
  {surface==='admin'?<Admin SellerOffersPanel={SellerOffersPanel}/>:surface==='android'?<AndroidPreview/>:<TrialStorefront/>}
</>}
export function mountWorkshop({SellerOffersPanel}={}){createRoot(document.getElementById('root')).render(<React.StrictMode><ThemeWorkspaceBoundary><TrialShell SellerOffersPanel={SellerOffersPanel}/></ThemeWorkspaceBoundary></React.StrictMode>);}
