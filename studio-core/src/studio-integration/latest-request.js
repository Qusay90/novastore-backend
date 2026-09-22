// A displayed calculation belongs to the exact inputs and product that requested it.
export function createLatestRequest(){
  let generation=0;
  return {invalidate:()=>++generation,begin:()=>++generation,current:value=>value===generation};
}
