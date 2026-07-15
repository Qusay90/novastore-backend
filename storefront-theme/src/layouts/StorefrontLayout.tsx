import type { PropsWithChildren } from "react";
import { Footer } from "../components/Footer";
import { Navbar } from "../components/Navbar";

export function StorefrontLayout({ children }: PropsWithChildren) { return <div className="storefront"><Navbar /><main>{children}</main><Footer /></div>; }
