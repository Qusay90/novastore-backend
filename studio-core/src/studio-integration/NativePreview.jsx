import React from 'react';
import {getStudioHost} from './context.js';
import ThemeKitPreview from './ThemeKitPreview.jsx';
export default function NativePreview(){
 const host=getStudioHost(),channel=host.availableChannels[0],presentation=host.presentations?.[channel]||host.presentation;
 if(presentation)return <ThemeKitPreview/>;
 return <p role="alert">Bu eski tema sürümünde doğrulanmış mağaza sunumu bulunmuyor. Yönetici, desteklenen özgün tema sürümünü seçmelidir.</p>;
}
