// Customer-only layout bindings; original theme and read-only preview bytes stay intact.
export function bottomNavigationClearance(navigation, view) {
 if (!navigation || !view) return 0;
 const style = view.getComputedStyle(navigation), box = navigation.getBoundingClientRect();
 if (style.display === 'none' || style.visibility === 'hidden' || style.position !== 'fixed' || box.width <= 0 || box.height <= 0 || box.top >= view.innerHeight || box.bottom <= 0) return 0;
 return Math.ceil(view.innerHeight - box.top) + 16;
}

export function createCommerceLayout(root, view) {
 const property = '--floating-bottom', previous = root.body.style.getPropertyValue(property);
 let observed, disposed = false;
 const observer = view.ResizeObserver ? new view.ResizeObserver(() => refresh()) : null;
 function refresh() {
  if (disposed) return;
  const navigation = root.querySelector('.bottom-nav');
  if (navigation !== observed) { observer?.disconnect(); if (navigation) observer?.observe(navigation); observed = navigation; }
  const offset = bottomNavigationClearance(navigation, view);
  if (offset) root.body.style.setProperty(property, `${offset}px`);
  else if (previous) root.body.style.setProperty(property, previous);
  else root.body.style.removeProperty(property);
 }
 view.addEventListener('resize', refresh);
 return {refresh, dispose() { disposed = true; observer?.disconnect(); view.removeEventListener('resize', refresh); if (previous) root.body.style.setProperty(property, previous); else root.body.style.removeProperty(property); }};
}

export function renderProductGallery({root, main, thumbnails, urls, name, isCurrent}) {
 if (!main || !thumbnails) return;
 thumbnails.classList.add('commerce-gallery-thumbnails');
 thumbnails.setAttribute('aria-label', 'Ürün görselleri');
 thumbnails.replaceChildren();
 const buttons = [];
 function select(index) {
  if (!isCurrent()) return;
  main.src = urls[index]; main.alt = name;
  buttons.forEach((button, i) => button.setAttribute('aria-pressed', String(i === index)));
 }
 for (const [index, url] of urls.entries()) {
  const button = root.createElement('button'), thumbnail = root.createElement('img');
  button.type = 'button'; button.setAttribute('aria-label', `${index + 1}. ürün görseli`);
  button.setAttribute('aria-pressed', String(index === 0));
  thumbnail.src = url; thumbnail.alt = ''; thumbnail.width = 64; thumbnail.height = 64;
  button.append(thumbnail); button.onclick = () => select(index); buttons.push(button); thumbnails.append(button);
 }
 if (urls.length) select(0);
}
