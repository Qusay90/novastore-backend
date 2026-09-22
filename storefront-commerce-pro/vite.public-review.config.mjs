import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {viteSingleFile} from 'vite-plugin-singlefile';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {reviewPresentation} from './src/integration/reviewPresentation.js';
const root=path.dirname(fileURLToPath(import.meta.url));
export default defineConfig({root,mode:'public-review',base:'/',define:{__NOVASTORE_LOCAL_REVIEW_RUNTIME__:'false'},
  build:{assetsInlineLimit:30000000,cssCodeSplit:false,commonjsOptions:{include:[/node_modules/,/shared/]},emptyOutDir:false,
    outDir:path.join(root,'../frontend/public-review'),modulePreload:false,sourcemap:false,target:'es2022',
    rollupOptions:{input:path.join(root,'public-review.html')}},
  plugins:[{name:'public-review-copy',enforce:'pre',transform(code,id){
    return /\/(?:IntegratedApp|CanonicalRuntimePresentation)\.jsx$/.test(id.replaceAll('\\','/'))
      ? {code:reviewPresentation(code),map:null} : null;
  }},react(),viteSingleFile()]});
