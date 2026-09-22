import React,{useMemo} from 'react';
import {renderCampaignCanvas} from './campaignCanvas.js';
import {visualAssets} from './visual/visualAssets.js';
export default function CampaignScene({canvas,theme}){
 const html=useMemo(()=>renderCampaignCanvas(canvas,{theme,visualAssets}),[canvas,theme]);
 return <div className="studio-campaign-scene" dangerouslySetInnerHTML={{__html:html}}/>;
}
