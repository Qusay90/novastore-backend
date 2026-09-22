import React from 'react';
import {createRoot} from 'react-dom/client';
import StoreSupportInbox from '../../../admin-commerce-pro/src/theme-platform/StoreSupportInbox.jsx';

export function mountStockySupport(container,{client,serviceId,onFormState}){
  const root=createRoot(container);
  root.render(<StoreSupportInbox client={client} serviceId={serviceId} kind="seller" onFormState={onFormState}/>);
  return {unmount(){root.unmount();}};
}
