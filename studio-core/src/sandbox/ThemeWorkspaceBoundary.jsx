import React from 'react';
import {withMerchantScope} from './merchantWorkspaces.js';
export default class ThemeWorkspaceBoundary extends React.Component{
 state={error:null};
 static getDerivedStateFromError(error){return{error};}
 render(){return this.state.error?<main style={{padding:'64px 24px',maxWidth:760,margin:'auto'}}><h1>Tema çalışma alanı açılamadı</h1><p>Bu tema kaydı bulunamıyor veya tarayıcıdaki kayıt okunamıyor. Mevcut sitenin kayıtları değiştirilmedi.</p><a href={withMerchantScope('/?surface=admin&panel=edited-themes')}>Düzenlenmiş temalara dön</a></main>:this.props.children;}
}
