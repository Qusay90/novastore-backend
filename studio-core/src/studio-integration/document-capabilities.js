const plain = value => !!value && typeof value === 'object' && !Array.isArray(value);
const canonical = value => Array.isArray(value) ? '['+value.map(canonical).join(',')+']' : plain(value) ? '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}' : JSON.stringify(value);
const equal=(a,b)=>canonical(a)===canonical(b);
const blockList=studio=>[...studio.blocks,...studio.pages.flatMap(p=>p.blocks),...Object.values(studio.templates).flatMap(t=>t.blocks),...studio.savedSections.flatMap(s=>s.blocks)];
const assetRefs=value=>{const out=new Set();const walk=x=>{if(typeof x==='string'&&x.startsWith('asset:'))out.add(x);else if(x&&typeof x==='object')Object.values(x).forEach(walk);};walk(value);return [...out].sort();};
export const writable=state=>['EDITABLE','MANAGE','PUBLISH'].includes(state);
export function documentCapabilities(before, after) {
    const codes = new Set();
    const add = (...values) => values.forEach(value => codes.add(`theme.${value}`));
    const changed = (a, b) => !equal(a, b);
    const blockCapability = type => ({ products: 'product_grid', categories: 'category_grid', hero: 'banner', banner: 'banner', text: 'text', announcement: 'text' })[type] || 'advanced_blocks';
    if (changed(before, after)) add('save_draft');
    for (const key of Object.keys(after.theme)) if (changed(before.theme[key], after.theme[key])) {
        add(['accent', 'navy', 'background', 'surface', 'text', 'muted', 'border'].includes(key) ? 'colors' : ['fontFamily', 'fontScale', 'headingScale'].includes(key) ? 'typography' : 'advanced_blocks');
    }
    const oldHeader = { ...before.chrome.header }, newHeader = { ...after.chrome.header };
    if (oldHeader.logoText !== newHeader.logoText) add('logo');
    delete oldHeader.logoText; delete newHeader.logoText;
    if (changed(oldHeader, newHeader)) add('header');
    if (changed(before.chrome.footer, after.chrome.footer)) add('footer');
    if (changed(before.menus, after.menus)) add('navigation');
    if (changed(before.app, after.app)) add('mobile_editor');
    if (changed(before.commerce, after.commerce)) add('product_grid');
    if (changed(before.pages, after.pages) || changed(before.templates, after.templates) || changed(before.savedSections, after.savedSections)) add('advanced_blocks');
    const oldBlocks = new Map(blockList(before).map(block => [block.id, block]));
    const nextBlockIds = new Set(blockList(after).map(block => block.id));
    for (const block of oldBlocks.values()) if (!nextBlockIds.has(block.id)) {
        add(({ products: 'product_grid', categories: 'category_grid', hero: 'banner', banner: 'banner', text: 'text', announcement: 'text' })[block.type] || 'advanced_blocks');
        if (block.campaignCanvas) add('campaign_canvas');
        if (block.buttonText || block.secondaryText || !['home','categories'].includes(block.target)) add('navigation');
        if (block.startsAt || block.endsAt) add('scheduling');
    }
    if (changed(before.blocks.map(block => block.id), after.blocks.map(block => block.id))) add('homepage_blocks');
    for (const block of blockList(after)) {
        const previous = oldBlocks.get(block.id);
        if (!changed(previous, block)) continue;
        if (previous && previous.type !== block.type) add(blockCapability(previous.type), 'homepage_blocks');
        add(({ products: 'product_grid', categories: 'category_grid', hero: 'banner', banner: 'banner', text: 'text', announcement: 'text' })[block.type] || 'advanced_blocks');
        if (changed(previous?.campaignCanvas, block.campaignCanvas)) add('campaign_canvas');
        if (previous ? (changed(previous.target, block.target) || changed(previous.secondaryTarget, block.secondaryTarget)) : (block.buttonText || block.secondaryText || !['home','categories'].includes(block.target) || block.secondaryTarget !== 'categories')) add('navigation');
        if (changed(previous?.startsAt||'', block.startsAt) || changed(previous?.endsAt||'', block.endsAt)) add('scheduling');
    }
    if (changed(before.design, after.design)) {
        const previous = new Map(before.design.elements.map(item => [item.id, item]));
        const nextElements = new Map(after.design.elements.map(item => [item.id, item]));
        for (const id of new Set([...previous.keys(), ...nextElements.keys()])) {
            if (!changed(previous.get(id), nextElements.get(id))) continue;
            add(['logo', 'logoImage'].includes(id) ? 'logo' : id === 'header' ? 'header' : id === 'footer' ? 'footer' : ['nav', 'allCategories'].includes(id) ? 'navigation' : id.startsWith('category:') ? 'category_grid' : id.startsWith('product') || id === 'addButton' ? 'product_grid' : 'advanced_blocks');
        }
        if (['name', 'blank', 'header', 'footer', 'navigation'].some(key => changed(before.design[key], after.design[key]))) add('advanced_blocks');
        for (const key of ['header', 'footer', 'navigation']) if (changed(before.design[key], after.design[key])) add(key);
    }
    if (changed(assetRefs(before), assetRefs(after))) add('assets');
    return [...codes].sort();
}
