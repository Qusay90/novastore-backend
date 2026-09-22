import React from 'react';
import {isStudioHost,capabilityVisible,capabilityWritable} from './context.js';
export default function Capability({code,children}) {
  if (!isStudioHost() || !code) return children;
  if (!capabilityVisible(code)) return null;
  return <fieldset className="nsi-capability" data-capability={code} disabled={!capabilityWritable(code)}>{!capabilityWritable(code)&&<legend>Salt okunur</legend>}{children}</fieldset>;
}
