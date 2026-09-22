import useSandbox from "../../sandbox/useSandbox.js";
import { StudioBlocks } from "./StudioBlocks.jsx";
import { isDraftPreview } from "./StudioChrome.jsx";
export { SandboxPage, SandboxTheme, SandboxCategoriesPage, SandboxFooter, SandboxTemplate, SandboxSeo, isDraftPreview } from "./StudioChrome.jsx";

export function SandboxHome({ favorites, onFavorite, onAdd, BenefitStrip }) {
  const document=useSandbox('web',isDraftPreview());
  return <main id="main-content" className="page page-home"><StudioBlocks blocks={document.blocks||[]} primaryHeading {...{document,favorites,onFavorite,onAdd,BenefitStrip}} /></main>;
}
