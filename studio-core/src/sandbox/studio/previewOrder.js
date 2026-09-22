// A drag preview is a temporary view. It never writes a document or history entry.
export function validOrder(items, order) {
  return Array.isArray(order) && order.length <= 80 && order.length === items.length &&
    order.every(id => typeof id === 'string') && new Set(order).size === order.length &&
    items.every(item => order.includes(item.id));
}

export function moveOrder(items, draggedId, targetId, after = false) {
  const original = items.map(item => item.id);
  if (!original.includes(draggedId) || !original.includes(targetId) || draggedId === targetId) return original;
  const order = original.filter(id => id !== draggedId);
  order.splice(order.indexOf(targetId) + (after ? 1 : 0), 0, draggedId);
  return order;
}

export function withPreviewOrder(doc, preview) {
  if (!preview || typeof preview.pageKey !== 'string') return doc;
  const key = preview.pageKey;
  const reorder = items => {
    if (!validOrder(items, preview.order)) return items;
    const byId = new Map(items.map(item => [item.id, item]));
    return preview.order.map(id => byId.get(id));
  };
  if (key === 'home') { const blocks = reorder(doc.blocks); return blocks === doc.blocks ? doc : {...doc, blocks}; }
  if (key.startsWith('template:')) {
    const id = key.slice(9);
    if (!Object.hasOwn(doc.templates || {}, id)) return doc;
    const source = doc.templates[id], blocks = reorder(source.blocks);
    return blocks === source.blocks ? doc : {...doc, templates:{...doc.templates, [id]:{...source, blocks}}};
  }
  if (key.startsWith('page:')) {
    const id = key.slice(5), source = doc.pages?.find(page => page.id === id);
    if (!source) return doc;
    const blocks = reorder(source.blocks);
    return blocks === source.blocks ? doc : {...doc, pages:doc.pages.map(page => page === source ? {...page, blocks} : page)};
  }
  return doc;
}
