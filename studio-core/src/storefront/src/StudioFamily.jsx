import { createContext, useContext } from "react";
import { STORE_FAMILIES } from "../../sandbox/storeDemos.js";

export const STUDIO_FAMILIES = STORE_FAMILIES;
export const resolveStudioFamily = value => STUDIO_FAMILIES.includes(value) ? value : "nova-commerce";
export const StudioFamilyContext = createContext("nova-commerce");
export const useStudioFamily = () => useContext(StudioFamilyContext);
