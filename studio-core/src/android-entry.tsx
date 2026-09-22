import React from 'react';
import ReactDOM from 'react-dom/client';
import NativeRuntime from './android-existing/native/NativeRuntime';
import Prototype from './android-existing/Prototype';
import './android-existing/native/native-base.css';
import './android-existing/prototype.css';
import './android-existing/native/native.css';
import './android-existing/trial.css';
import {isUnknownMerchant} from './sandbox/merchantWorkspaces.js';

// The copied V4.13 app runs exclusively on its local demonstration fixtures.
// The live account / payment / notification runtimes are deliberately not mounted.
window.fetch = async () => { throw new Error('Bu bağımsız denemede sunucu bağlantısı kapalı.'); };
XMLHttpRequest.prototype.open = function () { throw new Error('Bu bağımsız denemede sunucu bağlantısı kapalı.'); };
document.documentElement.dataset.novastoreRuntime = 'native';
document.documentElement.dataset.novastoreTrial = 'existing-android';
ReactDOM.createRoot(document.getElementById('root')!).render(isUnknownMerchant()?<main style={{padding:32}}><h1>Mağaza bulunamadı</h1><p>Bu deneme mağazası mevcut değil.</p><a href="/?surface=admin&panel=merchants">Mağazalara dön</a></main>:<React.StrictMode><NativeRuntime><Prototype /></NativeRuntime></React.StrictMode>);
