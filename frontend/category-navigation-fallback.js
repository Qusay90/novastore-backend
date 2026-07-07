(function () {
    const node = (name, children = []) => ({ name, children });

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

    const MARKETPLACE_ROOT_MARKERS = new Set([
        'anne, bebek & oyuncak',
        'beyaz eşya & elektrikli ev aletleri',
        'elektronik',
        'ev & yaşam',
        'kitap, kırtasiye & hobi',
        'kozmetik & kişisel bakım',
        'moda & giyim',
        'oto, bahçe & yapı market',
        'spor & outdoor',
        'süpermarket & petshop'
    ]);

    let activeTree = cloneTree(MARKETPLACE_FALLBACK_TREE);

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

    function cloneTree(tree) {
        return tree.map((item) => node(item.name, cloneTree(item.children || [])));
    }

    function collectNames(item, target = []) {
        if (!item?.name) return target;
        target.push(item.name);
        (item.children || []).forEach((child) => collectNames(child, target));
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

        const buildNode = (category) => node(
            category.name,
            (byParent.get(String(categoryId(category))) || []).map(buildNode)
        );

        return (byParent.get('root') || []).map(buildNode);
    }

    function hasMarketplaceRoots(tree) {
        const rootNames = new Set(tree.map((item) => normalizeName(item.name)));
        return Array.from(MARKETPLACE_ROOT_MARKERS).some((marker) => rootNames.has(marker));
    }

    function buildNavigationTree(categories) {
        const liveTree = buildTreeFromRecords(categories);
        const tree = liveTree.length >= 4 && hasMarketplaceRoots(liveTree)
            ? liveTree
            : cloneTree(MARKETPLACE_FALLBACK_TREE);

        activeTree = tree;
        return tree;
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
        const match = findNodeByName(activeTree, categoryName) || findNodeByName(MARKETPLACE_FALLBACK_TREE, categoryName);
        return match ? collectNames(match) : [categoryName];
    }

    window.NovaStoreCategoryNavigation = {
        buildNavigationTree,
        getFilterNames,
        normalizeName
    };
})();
