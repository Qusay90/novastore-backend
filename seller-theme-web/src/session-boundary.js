// Responses belong to one login generation and, where supplied, one selected service.
export function createSessionBoundary(){
  let generation=0;
  return Object.freeze({advance:()=>++generation,capture:()=>generation,current:value=>value===generation,
    apply(value,callback){if(value!==generation)return false;callback();return true;}});
}
