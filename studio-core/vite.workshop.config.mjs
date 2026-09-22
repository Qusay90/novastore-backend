import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {relocateWorkshopModule} from './src/workshop/paths.mjs';
export default defineConfig({
  plugins:[{name:'studio-workshop-static-roots',enforce:'pre',transform(source,id){if(id.replaceAll('\\','/').includes('/studio-core/src/')&&/\.(?:jsx?|tsx?|css|json)$/.test(id))return {code:relocateWorkshopModule(source,id.replaceAll('\\','/')),map:null};}},react()],
  base:'/studio-pro/',publicDir:'workshop-public',resolve:{dedupe:['react','react-dom']},
  define:{__NOVASTORE_LOCAL_REVIEW_RUNTIME__:'true',__NOVASTORE_NATIVE__:'false'},
  build:{outDir:'dist-workshop',emptyOutDir:true,assetsInlineLimit:0,rollupOptions:{input:{main:'index.html',android:'android-app.html'}},commonjsOptions:{include:[/node_modules/,/shared/,/vendor/]}}
});
