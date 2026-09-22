import React from 'react';
import {authorizeWorkshop,showWorkshopFailure} from './workshop/auth.js';

async function start(){
  const {http,fetchImpl}=await authorizeWorkshop();
  const [{default:ThemePlatform},{mountWorkshop}]=await Promise.all([import('../../admin-commerce-pro/src/theme-platform/ThemePlatform.jsx'),import('./main.jsx')]);
  function SellerOffersPanel({onNavigationGuard,initialSourceThemeId,initialChannel}){return <ThemePlatform embedded http={http} fetchImpl={fetchImpl} onNavigationGuard={onNavigationGuard} initialSourceThemeId={initialSourceThemeId} initialChannel={initialChannel}/>;}
  mountWorkshop({SellerOffersPanel});
}
start().catch(showWorkshopFailure);
