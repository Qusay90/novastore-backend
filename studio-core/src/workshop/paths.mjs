// Build-only relocation of the original authoring application's known static
// roots. API paths and the independently hosted /theme-studio module stay intact.
export function relocateWorkshopPaths(source){
  return source.replace(/(["'`(])\/(media\/|calibration-assets\/|theme-library\/|assets\/|android-app\.html|\?)/g,(_,prefix,part)=>`${prefix}/studio-pro/${part}`)
    .replaceAll(String.raw`/^\/media\/`,String.raw`/^\/(?:studio-pro\/)?media\/`);
}
export function relocateWorkshopModule(source,id){
  let output=relocateWorkshopPaths(source);
  // The isolated authoring datastore may contain an original JSON backup.
  // Convert only its already-allowlisted local media root in this build.
  const media="value=>typeof value==='string'&&value.startsWith('/media/')?'/studio-pro'+value:value";
  if(id.endsWith('/documentModel.js'))output=`const relocateOriginalMedia=${media};\n`+output.replace("function image(value, path) {","function image(value, path) { value=relocateOriginalMedia(value);");
  if(id.endsWith('/campaignCanvas.js'))output=`const relocateOriginalMedia=${media};\n`+output.replace('export function safeCanvasImage(src){','export function safeCanvasImage(src){ src=relocateOriginalMedia(src);');
  if(id.endsWith('/visualDesign.js'))output=`const relocateOriginalMedia=${media};\n`+output.replace('result[key]=setting;',"result[key]=key==='imageUrl'?relocateOriginalMedia(setting):setting;");
  return output;
}
