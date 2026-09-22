// Build-owned adaptation of reviewed Classic code. No package text is executed.
export function classicRuntimeSource(original){
 const changes=[
  ["function classicImages(p){return hostBridge?(p.imageUrl?[p.imageUrl]:[]):","function classicImages(p){return hostBridge?(window.NovaThemeKitPorts?.productImages?.(p.id)||(p.imageUrl?[p.imageUrl]:[])):"],
  ["if(T.style==='classic')enhanceClassic();","if(T.style==='classic')enhanceClassic();window.NovaThemeKitPorts?.onRendered?.({name:route.name,id:route.id,params:String(route.params||'')});"],
  ["if(classicHeroLifecycle)return classicHeroLifecycle.change(commit);\n    commit();","const finish=()=>{commit();window.NovaThemeKitPorts?.onDocumentApplied?.();};if(classicHeroLifecycle)return classicHeroLifecycle.change(finish);\n    finish();"],
  ["if(classicHeroLifecycle)return classicHeroLifecycle.change(commit);\r\n    commit();","const finish=()=>{commit();window.NovaThemeKitPorts?.onDocumentApplied?.();};if(classicHeroLifecycle)return classicHeroLifecycle.change(finish);\r\n    finish();"],
  ["  render();\n  initializeNovaBot();","  window.NovaThemeKitRuntime=Object.freeze({navigate,refresh:()=>renderKeepingPosition()});\n  render();\n  initializeNovaBot();"],
  ["  render();\r\n  initializeNovaBot();","  window.NovaThemeKitRuntime=Object.freeze({navigate,refresh:()=>renderKeepingPosition()});\r\n  render();\r\n  initializeNovaBot();"],
 ];
 let result=original;
 for(const [from,to]of changes)if(result.includes(from))result=result.replace(from,to);
 if(!result.includes('window.NovaThemeKitRuntime=Object.freeze')||!result.includes('window.NovaThemeKitPorts?.onRendered'))throw Error('Reviewed Classic renderer hook changed');
 return result;
}
