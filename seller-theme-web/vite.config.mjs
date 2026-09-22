import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({plugins:[react()],base:'/seller-theme/',build:{outDir:'dist',emptyOutDir:true}});
