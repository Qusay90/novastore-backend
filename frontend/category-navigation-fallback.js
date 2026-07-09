(function () {
    const node = (name, children = [], extra = {}) => ({ name, children, ...extra });

    const MARKETPLACE_FALLBACK_TREE = Object.freeze([
        node('Anne, Bebek & Oyuncak', [
            node('Bebek Bakım'),
            node('Bebek Arabası & Oto Koltuğu'),
            node('Oyuncak')
        ]),
        node('Beyaz Eşya & Elektrikli Ev Aletleri', [
            node('Beyaz Eşya'),
            node('Elektrikli Mutfak Aletleri'),
            node('Süpürge & Temizlik Cihazları')
        ]),
        node('Elektronik', [
            node('Telefon & Aksesuar'),
            node('Bilgisayar & Tablet'),
            node('TV, Görüntü & Ses')
        ]),
        node('Ev & Yaşam', [
            node('Mobilya'),
            node('Ev Tekstili'),
            node('Ev Dekorasyon'),
            node('Mutfak')
        ]),
        node('Kitap, Kırtasiye & Hobi', [
            node('Kitap'),
            node('Kırtasiye'),
            node('Ofis Ürünleri'),
            node('Hobi & Oyun')
        ]),
        node('Kozmetik & Kişisel Bakım', [
            node('Parfüm & Deodorant'),
            node('Cilt Bakımı'),
            node('Saç Bakımı'),
            node('Makyaj')
        ]),
        node('Moda & Giyim', [
            node('Kadın', [
                node('Giyim', [
                    node('Üst Giyim', [
                        node('Tişört'), node('Gömlek'), node('Bluz'), node('Sweatshirt'),
                        node('Kazak'), node('Hırka'), node('Body')
                    ]),
                    node('Alt Giyim', [
                        node('Pantolon'), node('Jean'), node('Etek'), node('Şort'),
                        node('Tayt'), node('Eşofman Altı')
                    ]),
                    node('Elbise & Tulum', [
                        node('Elbise'), node('Gömlek Elbise'), node('Tulum')
                    ]),
                    node('Takım', [
                        node('İkili Takım'), node('Eşofman Takımı'), node('Ceketli Takım')
                    ]),
                    node('Dış Giyim', [
                        node('Ceket'), node('Mont'), node('Kaban'), node('Trençkot'), node('Yelek')
                    ])
                ]),
                node('İç Giyim & Ev Giyim', [
                    node('Sütyen'), node('Külot'), node('Atlet'), node('Pijama'),
                    node('Gecelik'), node('Çorap'), node('Termal İçlik')
                ]),
                node('Ayakkabı'),
                node('Aksesuar')
            ]),
            node('Erkek', [
                node('Giyim', [
                    node('Üst Giyim', [
                        node('Tişört'), node('Polo Yaka'), node('Gömlek'),
                        node('Sweatshirt'), node('Kazak'), node('Hırka')
                    ]),
                    node('Alt Giyim', [
                        node('Pantolon'), node('Jean'), node('Şort'), node('Eşofman Altı')
                    ]),
                    node('Takım', [
                        node('Eşofman Takımı'), node('Alt-Üst Takım'), node('Takım Elbise')
                    ]),
                    node('Dış Giyim', [
                        node('Ceket'), node('Mont'), node('Kaban'), node('Yelek')
                    ])
                ]),
                node('İç Giyim & Ev Giyim', [
                    node('Boxer'), node('Slip'), node('Atlet'), node('Pijama'),
                    node('Çorap'), node('Termal İçlik')
                ]),
                node('Ayakkabı'),
                node('Aksesuar')
            ]),
            node('Çocuk', [
                node('Kız Çocuk', [
                    node('Üst Giyim'), node('Alt Giyim'), node('Elbise'), node('Takım'),
                    node('Dış Giyim'), node('İç Giyim & Pijama'), node('Çorap')
                ]),
                node('Erkek Çocuk', [
                    node('Üst Giyim'), node('Alt Giyim'), node('Takım'),
                    node('Dış Giyim'), node('İç Giyim & Pijama'), node('Çorap')
                ]),
                node('Çocuk Ayakkabı'),
                node('Çocuk Aksesuar')
            ]),
            node('Bebek', [
                node('Kız Bebek', [
                    node('Zıbın & Body'), node('Tulum'), node('Takım'), node('Üst Giyim'),
                    node('Alt Giyim'), node('Dış Giyim'), node('Pijama'), node('Çorap')
                ]),
                node('Erkek Bebek', [
                    node('Zıbın & Body'), node('Tulum'), node('Takım'), node('Üst Giyim'),
                    node('Alt Giyim'), node('Dış Giyim'), node('Pijama'), node('Çorap')
                ]),
                node('Yenidoğan')
            ])
        ]),
        node('Oto, Bahçe & Yapı Market', [
            node('Oto Aksesuar'),
            node('Bahçe'),
            node('Yapı Market'),
            node('Hırdavat')
        ]),
        node('Spor & Outdoor', [
            node('Spor Giyim'),
            node('Spor Ayakkabı'),
            node('Fitness & Kondisyon'),
            node('Kamp & Outdoor')
        ]),
        node('Süpermarket & Petshop', [
            node('Temizlik Ürünleri'),
            node('Gıda'),
            node('İçecek'),
            node('Petshop')
        ])
    ]);

    let activeTree = [];
    let activeLiveTree = [];
    let activeNavigationUsesLiveTree = false;
    const fallbackNameCounts = countNames(MARKETPLACE_FALLBACK_TREE);

    function normalizeName(value) {
        return String(value || '')
            .trim()
            .replace(/[.\s]+$/g, '')
            .toLocaleLowerCase('tr-TR');
    }

    function categoryId(category) {
        return category?.id ?? category?.category_id ?? category?.categoryId ?? null;
    }

    function parentId(category) {
        return category?.parent_id ?? category?.parentId ?? null;
    }

    function categoryPath(category) {
        return String(
            category?.path
            || category?.fullSlugPath
            || category?.full_slug_path
            || category?.slug
            || ''
        ).trim();
    }

    function isVisibleCategory(category) {
        return Boolean(category?.name)
            && category.is_active !== false
            && category.is_customer_visible !== false
            && category.show_in_menu !== false
            && category.deleted_at == null;
    }

    function compareCategories(a, b) {
        const aOrder = Number.isFinite(Number(a.sort_order)) ? Number(a.sort_order) : 0;
        const bOrder = Number.isFinite(Number(b.sort_order)) ? Number(b.sort_order) : 0;
        if (aOrder !== bOrder) return aOrder - bOrder;
        return String(a.name || '').localeCompare(String(b.name || ''), 'tr');
    }

    function cloneTree(tree, { presentationOnly = false } = {}) {
        return tree.map((item) => node(item.name, cloneTree(item.children || [], { presentationOnly }), {
            id: item.id,
            slug: item.slug,
            path: item.path,
            pathLabel: item.pathLabel,
            presentationOnly: presentationOnly || item.presentationOnly === true
        }));
    }

    function collectNames(item, target = []) {
        if (!item?.name) return target;
        target.push(item.name);
        (item.children || []).forEach((child) => collectNames(child, target));
        return target;
    }

    function countNames(tree, counts = new Map()) {
        (tree || []).forEach((item) => {
            const normalized = normalizeName(item.name);
            if (normalized) counts.set(normalized, (counts.get(normalized) || 0) + 1);
            countNames(item.children, counts);
        });
        return counts;
    }

    function collectSpecificFallbackNames(item, target = []) {
        if (!item?.name) return target;
        const normalized = normalizeName(item.name);
        if (normalized && (!target.some((name) => normalizeName(name) === normalized))) {
            target.push(item.name);
        }
        (item.children || []).forEach((child) => {
            const childNormalized = normalizeName(child.name);
            if (fallbackNameCounts.get(childNormalized) === 1) {
                collectSpecificFallbackNames(child, target);
            }
        });
        return target;
    }

    function buildTreeFromRecords(categories) {
        const usable = Array.isArray(categories) ? categories.filter(isVisibleCategory) : [];
        const byParent = new Map();
        usable.forEach((category) => {
            const key = parentId(category) == null ? 'root' : String(parentId(category));
            if (!byParent.has(key)) byParent.set(key, []);
            byParent.get(key).push(category);
        });
        byParent.forEach((items) => items.sort(compareCategories));

        const buildNode = (category, parentNames = []) => {
            const childRecords = Array.isArray(category.children) && category.children.length
                ? category.children
                : (byParent.get(String(categoryId(category))) || []);
            const pathNames = [...parentNames, category.name].filter(Boolean);
            return node(
                category.name,
                childRecords.map((child) => buildNode(child, pathNames)),
                {
                    id: categoryId(category),
                    parent_id: parentId(category),
                    slug: category.slug,
                    path: categoryPath(category),
                    pathLabel: pathNames.join(' > ')
                }
            );
        };

        return (byParent.get('root') || []).map((category) => buildNode(category));
    }

    function buildNavigationTree(categories) {
        const liveTree = buildTreeFromRecords(categories);
        activeNavigationUsesLiveTree = liveTree.length > 0;
        activeLiveTree = liveTree;
        activeTree = liveTree;
        return liveTree;
    }

    function buildFallbackNavigationTree() {
        return cloneTree(MARKETPLACE_FALLBACK_TREE, { presentationOnly: true });
    }

    function findNodeByName(items, categoryName) {
        const normalized = normalizeName(categoryName);
        if (!normalized) return null;

        for (const item of items || []) {
            if (normalizeName(item.name) === normalized) return item;
            const childMatch = findNodeByName(item.children, categoryName);
            if (childMatch) return childMatch;
        }
        return null;
    }

    function getFilterNames(categoryName) {
        const names = [];
        const addName = (name) => {
            const normalized = normalizeName(name);
            if (!normalized || names.some((current) => normalizeName(current) === normalized)) return;
            names.push(name);
        };

        const liveMatch = findNodeByName(activeLiveTree, categoryName);
        if (liveMatch) {
            collectNames(liveMatch).forEach(addName);
        }

        const navigationMatch = findNodeByName(activeTree, categoryName);
        if (navigationMatch && activeNavigationUsesLiveTree) {
            collectNames(navigationMatch).forEach(addName);
        }

        const fallbackMatch = findNodeByName(MARKETPLACE_FALLBACK_TREE, categoryName);
        if (fallbackMatch) {
            collectSpecificFallbackNames(fallbackMatch).forEach(addName);
        }

        if (!names.length) addName(categoryName);
        return names;
    }

    function encodeCategoryPath(value) {
        return String(value || '')
            .trim()
            .replace(/^\/+|\/+$/g, '')
            .split('/')
            .map((segment) => segment.trim())
            .filter(Boolean)
            .map(encodeURIComponent)
            .join('/');
    }

    function categoryUrl(category) {
        if (!category || typeof category !== 'object' || category.presentationOnly === true) return null;
        const encodedPath = encodeCategoryPath(categoryPath(category));
        return encodedPath ? `/kategori/${encodedPath}` : null;
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function renderCategoryTarget(category, className, content) {
        const url = categoryUrl(category);
        if (!url) {
            return `<span class="${className} is-presentation-only" aria-disabled="true">${content}</span>`;
        }
        return `<a class="${className}" href="${escapeHtml(url)}">${content}</a>`;
    }

    function renderSubcategoryNodes(categories, depth = 1) {
        if (!Array.isArray(categories) || categories.length === 0) return '';
        const listClass = depth === 1 ? 'subcategory-menu' : 'subcategory-children';
        return `<ul class="${listClass}" data-category-depth="${depth}">${categories.map((category) => {
            const children = Array.isArray(category.children) ? category.children : [];
            const target = renderCategoryTarget(
                category,
                'subcategory-item',
                escapeHtml(category.name)
            );
            return `<li class="subcategory-node${children.length ? ' has-children' : ''}" data-category-depth="${depth}">
                ${target}
                ${renderSubcategoryNodes(children, depth + 1)}
            </li>`;
        }).join('')}</ul>`;
    }

    function renderStorefrontMenu(categories, themeColors = []) {
        if (!Array.isArray(categories)) return '';
        return categories.map((category, index) => {
            const children = Array.isArray(category.children) ? category.children : [];
            const hasChildren = children.length > 0;
            const color = themeColors.length ? themeColors[index % themeColors.length] : '#F7941D';
            const target = renderCategoryTarget(
                category,
                'category-trigger',
                `<span>${escapeHtml(category.name)}</span>`
            );
            const toggle = hasChildren
                ? `<button type="button" class="category-toggle" aria-expanded="false" aria-label="${escapeHtml(category.name)} alt kategorilerini aç"><span class="category-caret" aria-hidden="true">&#9662;</span></button>`
                : '';
            return `<li class="category-item${hasChildren ? ' has-children' : ''}" style="border-bottom-color:${escapeHtml(color)}">
                <div class="category-trigger-row">${target}${toggle}</div>
                ${renderSubcategoryNodes(children)}
            </li>`;
        }).join('');
    }

    function renderDirectoryTree(categories, depth = 1) {
        if (!Array.isArray(categories) || categories.length === 0) return '';
        return `<ul class="native-subcategory-tree" data-category-depth="${depth}">${categories.map((category) => {
            const children = Array.isArray(category.children) ? category.children : [];
            const target = renderCategoryTarget(
                category,
                'native-subcategory-link',
                escapeHtml(category.name)
            );
            return `<li class="native-subcategory-node" data-category-depth="${depth}">
                ${target}
                ${renderDirectoryTree(children, depth + 1)}
            </li>`;
        }).join('')}</ul>`;
    }

    window.NovaStoreCategoryNavigation = {
        buildFallbackNavigationTree,
        buildNavigationTree,
        categoryUrl,
        getFilterNames,
        normalizeName,
        renderDirectoryTree,
        renderStorefrontMenu
    };
})();
