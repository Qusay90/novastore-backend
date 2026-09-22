import {useEffect} from 'react';
export function useFormGuard(onState,{dirty,pending}) {
  useEffect(()=>{onState?.({dirty,pending});},[onState,dirty,pending]);
  useEffect(()=>()=>onState?.(null),[onState]);
}
