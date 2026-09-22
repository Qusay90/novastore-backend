import {classicRuntimeSource} from './theme-kit-runtime-source.mjs';
import {atelierRuntimeSource} from './atelier-runtime-source.mjs';
// Executable build adaptation only. Original workshop files stay byte-identical.
// The override is mandatory for customer cart/account routes: the v1 template
// calculates parent-product prices and cannot represent variant tuples.
export function customerRuntimeSource(original,presentationId){
 let source=presentationId==='nova-classic'?classicRuntimeSource(original):presentationId==='nova-atelier'?atelierRuntimeSource(original):null;
 if(!source)throw Error('Customer presentation not supported');
 const changes=[
  ["  function classicCartSubtotal() {", "  function classicCartSubtotal() { if(hostBridge)return totals().subtotal;"],
  ["money(state.cart.reduce((n,l)=>n+(products.get(l.productId)?.price||0)*l.qty,0))", "money(classicCartSubtotal())"],
  ["  function totals() {", "  function totals() { if(hostBridge){const subtotal=state.cart.reduce((sum,line)=>sum+(Number.isSafeInteger(line.unitPrice)?line.unitPrice:0)*line.qty,0);return {subtotal,discount:0,shipping:0,total:subtotal,net:subtotal};}"],
  ["snapshot.cartSync==='pending');", "(snapshot.cartSync==='pending'&&snapshot.session.status==='authenticated'));"],
  ["    main.innerHTML=(renderers[route.name]||notFound)();", "    if(hostBridge&&window.NovaThemeKitPorts?.renderCustomerPage){for(const name of ['product','cart','checkout','account','orders','order','success','support','contact','about','help','legal'])renderers[name]=()=>window.NovaThemeKitPorts.renderCustomerPage(name,route.id);}\n    main.innerHTML=(renderers[route.name]||notFound)();"],
  ['window.NovaThemeKitRuntime=Object.freeze({navigate,refresh:()=>renderKeepingPosition()});', 'window.NovaThemeKitRuntime=Object.freeze({navigate,refresh:()=>renderKeepingPosition(),productTemplate:id=>hostedDetail(id),finishProduct:()=>{if(currentRoute().name!=="product")return;enhanceInteractions();decorateHostedPage();enhanceSectorNext();enhanceSectorCategoryHover();updateBadges();if(T.style==="classic")enhanceClassic();const heading=document.querySelector("#main-content h1");if(heading)document.title=heading.textContent+" · "+T.name;}});'],
  ["if(route.name==='support')initializeSupportCenter();", "if(route.name==='support'&&!window.NovaThemeKitPorts?.renderCustomerPage)initializeSupportCenter();"],
  ['function hostedCart() {','function hostedCart() { if(window.NovaThemeKitPorts?.renderCustomerPage)return window.NovaThemeKitPorts.renderCustomerPage("cart");'],
  ["function hostedCustomerPage(route) {",'function hostedCustomerPage(route) {if(window.NovaThemeKitPorts?.renderCustomerPage)return window.NovaThemeKitPorts.renderCustomerPage(route);'],
  ["if(link&&/^#\\/(checkout|success)(?:[/?]|$)/.test(link.getAttribute('href')))","if(link&&/^#\\/(success)(?:[/?]|$)/.test(link.getAttribute('href')))"],
 ];
 for(const [before,after]of changes){if(source.split(before).length!==2)throw Error('Customer renderer hook drift: '+before);source=source.replace(before,after);}
 if(presentationId==='nova-atelier'){const before='for(const p of T.products)products.set(p.id,p);';if(source.split(before).length!==2)throw Error('Customer Atelier catalog hook drift');source=source.replace(before,'for(const p of T.products)products.set(p.id,{...p,details:(p.features||[]).map((value,index)=>["Özellik "+(index+1),value])});');}
 return source;
}
// Expose only the existing pure catalog projection; its legacy write adapter is
// never instantiated by a public customer entry.
export function customerProjectorSource(original){
 const before='amountToKurus: amount });',after='amountToKurus: amount, projectCatalog:(raw,origins=[])=>catalogOf(raw,new Set(origins),true) });';
 if(original.split(before).length!==2)throw Error('Customer catalog projector source drift');return original.replace(before,after);
}
