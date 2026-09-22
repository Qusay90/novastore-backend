import {classicRuntimeSource} from './theme-kit-runtime-source.mjs';

// Preserve the original editorial templates, including its complete PDP and
// footer. Only the existing hosted-mode shortcuts are adapted in this build.
export function atelierRuntimeSource(original) {
  let source = classicRuntimeSource(original);
  const changes = [
    ['const products = new Map(T.products.map(p => [p.id, p]));', 'const products = new Map(T.products.map(p => [p.id, hostBridge ? {...p, details:(p.features||[]).map((value,index)=>["Özellik "+(index+1),value])} : p]));'],
    ['return legacyClassicHostedDetail(id);', 'return legacyClassicDetail(id);'],
    ["if(T.style==='classic')return classicFooter();if(hostBridge)return hostedFooter();", "if(T.style==='classic')return classicFooter();"]
  ];
  for (const [before, after] of changes) {
    if (source.split(before).length !== 2) throw Error('Reviewed Atelier host boundary changed');
    source = source.replace(before, after);
  }
  return source;
}
