import {createStudioLeaveGuard} from './studioNavigationGuard.js';

const ordered=value=>Array.isArray(value)?value.map(ordered):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,ordered(value[key])])):value;
export const formSnapshot=value=>JSON.stringify(ordered(value));
export function createFormGuardTracker({confirm,notify}) {
  const forms=new Map();
  const state=()=>({host:{dirty:Object.fromEntries([...forms].map(([key,value])=>[key,value.dirty===true])),pending:Object.fromEntries([...forms].map(([key,value])=>[key,value.pending===true]))}});
  const leave=createStudioLeaveGuard({readState:state,confirm,notify});
  return {update:(key,value)=>value?forms.set(key,{dirty:value.dirty===true,pending:value.pending===true}):forms.delete(key),state,leave};
}
