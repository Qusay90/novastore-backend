import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {trustedThemeKit} from './scripts/theme-kit-plugin.mjs';
export default defineConfig({
  resolve:{dedupe:['react','react-dom']},
  plugins:[react(),trustedThemeKit()],base:'/theme-studio/',publicDir:false,
  define:{__NOVASTORE_LOCAL_REVIEW_RUNTIME__:'false',__NOVASTORE_NATIVE__:'false'},
  build:{outDir:'dist',emptyOutDir:true,assetsInlineLimit:0,manifest:true,rollupOptions:{preserveEntrySignatures:'strict',input:{preview:'preview.html',studio:'studio-module.html',host:'src/studio-integration/host-mount.js',customer:'customer.html',stocky:'stocky-studio.html'},output:{entryFileNames:'assets/[name].js'}},commonjsOptions:{include:[/node_modules/,/shared/,/vendor/]}}
});
