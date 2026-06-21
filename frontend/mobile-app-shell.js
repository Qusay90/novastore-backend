(function () {
    if (!window.NOVASTORE_USE_NATIVE_THEME) return;

    var pageName = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();
    var pageClass = 'native-page-' + pageName.replace(/\.html?$/, '').replace(/[^a-z0-9]+/g, '-');

    function isHomePage() {
        return !pageName || pageName === 'index.html';
    }

    function isAdminPage() {
        return pageName.indexOf('admin') === 0;
    }

    function isAuthPage() {
        return pageName === 'login.html' || pageName === 'forgot-password.html' || pageName === 'reset-password.html';
    }

    function getUserInfo() {
        try {
            return JSON.parse(localStorage.getItem('nova_user_info') || 'null');
        } catch (_) {
            return null;
        }
    }

    function getCartCount() {
        var existingBadge = document.getElementById('cart-count');
        if (existingBadge && existingBadge.textContent.trim()) {
            return existingBadge.textContent.trim();
        }

        var user = getUserInfo();
        var userId = user && (user.id || user.userId);
        var cartKey = 'novastore_cart_' + (userId || 'guest');

        try {
            var cart = JSON.parse(localStorage.getItem(cartKey) || '[]');
            return String(cart.reduce(function (total, item) {
                return total + (Number(item.quantity) || 1);
            }, 0));
        } catch (_) {
            return '0';
        }
    }

    function appUrl(rawUrl) {
        if (!rawUrl || typeof rawUrl !== 'string') return rawUrl;
        if (/^(https?:|mailto:|tel:|sms:|whatsapp:|#)/i.test(rawUrl)) return rawUrl;
        if (!window.NOVASTORE_USE_NATIVE_THEME || window.NOVASTORE_IS_NATIVE_APP) return rawUrl;

        try {
            var url = new URL(rawUrl, window.location.href);
            if (url.origin !== window.location.origin) return rawUrl;
            url.searchParams.set('nativeTheme', '1');
            return url.pathname.replace(/^\//, '') + url.search + url.hash;
        } catch (_) {
            return rawUrl;
        }
    }

    function goApp(rawUrl) {
        window.location.href = appUrl(rawUrl);
    }

    window.NovaAppUrl = appUrl;
    window.NovaGoApp = goApp;

    function normalizeProfileTab(rawValue) {
        var key = String(rawValue || '').replace(/^#/, '').trim().toLowerCase();
        var tabMap = {
            orders: 'orders',
            order: 'orders',
            siparislerim: 'orders',
            reviews: 'reviews',
            review: 'reviews',
            degerlendirmelerim: 'reviews',
            favorites: 'favorites',
            favorite: 'favorites',
            listelerim: 'favorites',
            questions: 'questions',
            question: 'questions',
            sorularim: 'questions',
            address: 'address',
            addresses: 'address',
            adreslerim: 'address',
            about: 'about',
            hakkimizda: 'about',
            site: 'about',
            sitehakkinda: 'about'
        };
        return tabMap[key] || '';
    }

    function getProfileViewParam() {
        if (pageName !== 'profile.html') return '';

        try {
            var params = new URLSearchParams(window.location.search);
            var view = normalizeProfileTab(params.get('view'));
            if (view) return view;
        } catch (_) { }

        return normalizeProfileTab(window.location.hash || '');
    }

    function profileViewUrl(tabId) {
        return appUrl('profile.html?view=' + encodeURIComponent(tabId));
    }

    function profileViewTitle(tabId) {
        var labels = {
            orders: 'Sipari\u015flerim',
            reviews: 'De\u011ferlendirmelerim',
            favorites: 'Listelerim',
            questions: 'Soru ve Taleplerim',
            address: 'Adreslerim',
            about: 'Site Hakk\u0131nda'
        };
        return labels[tabId] || 'Hesab\u0131m';
    }

    function icon(name) {
        var icons = {
            home: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10.8 12 3l9 7.8V21h-6v-6H9v6H3V10.8Z"/></svg>',
            heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.5-4.4-9.4-9.1C1.1 8.3 3.3 5 6.8 5c2 0 3.5 1.1 4.2 2.3C11.7 6.1 13.2 5 15.2 5c3.5 0 5.7 3.3 4.2 6.9C19.5 16.6 12 21 12 21Z"/></svg>',
            cart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.2 6h15l-1.8 8.6a2 2 0 0 1-2 1.6H9.1a2 2 0 0 1-2-1.7L5.7 4H3V2h4.3l.4 4Zm3.1 16a1.8 1.8 0 1 1 0-3.6 1.8 1.8 0 0 1 0 3.6Zm8 0a1.8 1.8 0 1 1 0-3.6 1.8 1.8 0 0 1 0 3.6Z"/></svg>',
            user: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm-9 9a9 9 0 0 1 18 0v1H3v-1Z"/></svg>',
            grid: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3h7v7H3V3Zm11 0h7v7h-7V3ZM3 14h7v7H3v-7Zm11 0h7v7h-7v-7Z"/></svg>'
        };
        return icons[name] || '';
    }

    function cleanAlertText(message) {
        return String(message || '')
            .replace(/^[\u2705\u274c\uD83C\uDF89]\s*/u, '')
            .replace(/^Hata:\s*/i, '')
            .trim();
    }

    function inferAlertType(message) {
        var text = String(message || '').toLowerCase();
        if (text.indexOf('hata') >= 0 || text.indexOf('bağlanılamadı') >= 0 || text.indexOf('baglanilamadi') >= 0) {
            return 'error';
        }
        return 'success';
    }

    function showNativeAlert(message, options) {
        options = options || {};

        return new Promise(function (resolve) {
            var type = options.type || inferAlertType(message);
            var title = options.title || (type === 'error' ? 'Bir sorun oluştu' : 'İşlem başarılı');
            var text = cleanAlertText(message);
            var previous = document.querySelector('.native-alert-overlay');
            if (previous) previous.remove();

            var overlay = document.createElement('div');
            overlay.className = 'native-alert-overlay native-alert-' + type;
            overlay.innerHTML = [
                '<div class="native-alert-card" role="dialog" aria-live="polite">',
                '<div class="native-alert-icon">' + (type === 'error' ? '!' : '✓') + '</div>',
                '<div class="native-alert-copy"><strong>' + title + '</strong><p>' + text + '</p></div>',
                '<button type="button" class="native-alert-ok">Tamam</button>',
                '</div>'
            ].join('');

            function close() {
                overlay.classList.remove('is-visible');
                window.setTimeout(function () {
                    overlay.remove();
                    resolve();
                }, 180);
            }

            overlay.querySelector('.native-alert-ok').addEventListener('click', close);
            overlay.addEventListener('click', function (event) {
                if (event.target === overlay) close();
            });

            document.body.appendChild(overlay);
            window.setTimeout(function () { overlay.classList.add('is-visible'); }, 20);

            if (options.duration) {
                window.setTimeout(close, options.duration);
            }
        });
    }

    function setupNativeAlerts() {
        if (window.NovaNativeAlert) return;

        var nativeAlert = window.alert ? window.alert.bind(window) : null;
        window.NovaNativeAlert = showNativeAlert;
        window.alert = function (message) {
            if (!window.NOVASTORE_USE_NATIVE_THEME || !document.body) {
                if (nativeAlert) nativeAlert(message);
                return;
            }
            showNativeAlert(message);
        };
    }

    function setActiveNav(nav) {
        var active = 'home';
        var profileView = getProfileViewParam();
        if (pageName === 'profile.html') active = profileView === 'favorites' ? 'heart' : 'user';
        if (pageName === 'checkout.html') active = 'cart';
        if (pageName === 'categories.html') active = 'grid';
        if (pageName === 'product.html') active = 'home';

        nav.querySelectorAll('.native-tab-item').forEach(function (item) {
            item.classList.toggle('active', item.dataset.tab === active);
        });
    }

    function createBottomNav() {
        if (isAdminPage() || isAuthPage() || document.querySelector('.native-bottom-nav')) return;

        var nav = document.createElement('nav');
        nav.className = 'native-bottom-nav';
        nav.setAttribute('aria-label', 'Uygulama menusu');
        var userTarget = getUserInfo() ? 'profile.html' : 'login.html';
        nav.innerHTML = [
            '<a class="native-tab-item" data-tab="home" href="' + appUrl('index.html') + '">' + icon('home') + '<span>Ana Sayfam</span></a>',
            '<a class="native-tab-item" data-tab="heart" href="' + profileViewUrl('favorites') + '">' + icon('heart') + '<span>Listelerim</span></a>',
            '<button class="native-tab-item native-tab-cart" data-tab="cart" type="button">' + icon('cart') + '<span>Sepetim</span><em class="native-tab-badge">' + getCartCount() + '</em></button>',
            '<a class="native-tab-item" data-tab="user" href="' + appUrl(userTarget) + '">' + icon('user') + '<span>Hesabım</span></a>',
            '<a class="native-tab-item native-tab-categories" data-tab="grid" href="' + appUrl('categories.html') + '">' + icon('grid') + '<span>Kategoriler</span></a>'
        ].join('');

        nav.querySelector('.native-tab-cart').addEventListener('click', function () {
            if (typeof window.openCart === 'function') {
                window.openCart();
                return;
            }
            goApp('index.html#cart');
        });

        document.body.appendChild(nav);
        setActiveNav(nav);

        var badgeSource = document.getElementById('cart-count');
        if (badgeSource && window.MutationObserver) {
            new MutationObserver(function () {
                var badge = nav.querySelector('.native-tab-badge');
                if (badge) badge.textContent = getCartCount();
            }).observe(badgeSource, { childList: true, subtree: true, characterData: true });
        }
    }

    function setupNativeNavigationMotion() {
        if (isAdminPage() || document.body.dataset.nativeNavigationMotion === 'true') return;

        document.body.dataset.nativeNavigationMotion = 'true';

        document.addEventListener('pointerdown', function (event) {
            var item = event.target && event.target.closest ? event.target.closest('.native-tab-item, .category-trigger, .native-subcategory-link, .btn-add, .btn-primary, .btn-hero') : null;
            if (!item) return;
            item.classList.add('is-pressing');
        }, { passive: true });

        document.addEventListener('pointerup', function () {
            document.querySelectorAll('.is-pressing').forEach(function (item) {
                item.classList.remove('is-pressing');
            });
        }, { passive: true });

        document.addEventListener('pointercancel', function () {
            document.querySelectorAll('.is-pressing').forEach(function (item) {
                item.classList.remove('is-pressing');
            });
        }, { passive: true });
    }

    function makeHeaderAppLike() {
        var header = document.querySelector('header');
        if (header) {
            header.classList.add('native-app-header');
        }

        var logo = document.querySelector('header .logo');
        if (logo) {
            logo.style.setProperty('order', '0', 'important');
            logo.style.setProperty('grid-column', '1', 'important');
        }

        var searchWrap = document.querySelector('header > div:nth-child(2)');
        if (searchWrap) {
            searchWrap.style.setProperty('order', '2', 'important');
            searchWrap.style.setProperty('grid-column', '1 / -1', 'important');
            searchWrap.style.setProperty('grid-row', '2', 'important');
            searchWrap.style.setProperty('margin', '0', 'important');
            searchWrap.style.setProperty('width', '100%', 'important');
            searchWrap.style.setProperty('min-width', '0', 'important');
        }

        var navRight = document.querySelector('header .nav-right');
        if (navRight) {
            navRight.style.setProperty('order', '0', 'important');
            navRight.style.setProperty('grid-column', '2', 'important');
            navRight.style.setProperty('grid-row', '1', 'important');
            navRight.style.setProperty('justify-self', 'end', 'important');
            ensureNativeLocationPill(navRight);
        }

        var searchInput = document.querySelector('header input[name="search"], header input[type="text"]');
        if (searchInput) {
            searchInput.placeholder = 'Ürün, kategori veya marka ara';
        }
    }

    function getPrimaryAddressLabel() {
        var user = getUserInfo();
        var userId = user && (user.id || user.userId);
        var addressKeys = ['novastore_addresses_' + (userId || 'guest'), 'novastore_user_addresses'];

        for (var index = 0; index < addressKeys.length; index += 1) {
            try {
                var addresses = JSON.parse(localStorage.getItem(addressKeys[index]) || '[]');
                if (Array.isArray(addresses) && addresses.length) {
                    var address = addresses[0];
                    return address.title || address.city || address.district || 'Adresim';
                }
            } catch (_) { }
        }

        return 'Adres seç';
    }

    function ensureNativeLocationPill(navRight) {
        if (!navRight || navRight.querySelector('.native-location-pill')) return;

        var pill = document.createElement('button');
        pill.type = 'button';
        pill.className = 'native-location-pill';
        pill.innerHTML = [
            '<span class="native-location-pin" aria-hidden="true">⌖</span>',
            '<span class="native-location-text"><strong>Teslimat</strong><em>' + getPrimaryAddressLabel() + '</em></span>'
        ].join('');
        pill.addEventListener('click', function () {
            goApp(getUserInfo() ? profileViewUrl('address') : 'login.html');
        });

        navRight.appendChild(pill);
    }

    function profileRowIcon(tabId) {
        var icons = {
            orders: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7.5 12 4l7 3.5v9L12 20l-7-3.5v-9Zm7 3.4 6.3-3.2M12 10.9 5.7 7.7M12 11v8"/></svg>',
            reviews: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.8 4.5H16l2.5 2.5v6.2M16 4.5V7h2.5M8.5 9.3h5.2M8.5 12h4M11 20.2a6 6 0 1 1 0-12 6 6 0 0 1 0 12Zm4.2-1.2 4.3 4.3"/></svg>',
            favorites: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.5-4.4-9.4-9.1C1.1 8.3 3.3 5 6.8 5c2 0 3.5 1.1 4.2 2.3C11.7 6.1 13.2 5 15.2 5c3.5 0 5.7 3.3 4.2 6.9C19.5 16.6 12 21 12 21Z"/></svg>',
            questions: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H8l-4 4V5Zm7.8 8.8h.1M9.8 9.1a2.4 2.4 0 0 1 4.7.7c0 1.6-1.6 2-2.3 2.8"/></svg>',
            address: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22s7-5.5 7-12A7 7 0 1 0 5 10c0 6.5 7 12 7 12Zm0-9a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/></svg>',
            about: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 10v6M12 7h.01"/></svg>'
        };
        return icons[tabId] || icons.orders;
    }

    function profileRowLabel(tabId) {
        var labels = {
            orders: 'Siparişlerim',
            reviews: 'Değerlendirmelerim',
            favorites: 'Listelerim',
            questions: 'Soru ve Taleplerim',
            address: 'Adreslerim',
            about: 'Site Hakk\u0131nda'
        };
        return labels[tabId] || 'Hesabım';
    }

    function getProfileTabFromElement(item) {
        if (item && item.dataset && item.dataset.nativeProfileTab) {
            return item.dataset.nativeProfileTab;
        }

        var onclick = item && item.getAttribute('onclick');
        var match = onclick && onclick.match(/switchTab\('([^']+)'/);
        return match && match[1] ? match[1] : '';
    }

    function ensureNativeProfileAbout() {
        if (pageName !== 'profile.html') return;

        var nav = document.querySelector('.profile-nav');
        var content = document.querySelector('.content-card');

        if (nav && !nav.querySelector('[data-native-profile-tab="about"]')) {
            var item = document.createElement('li');
            item.dataset.nativeProfileTab = 'about';
            nav.appendChild(item);
        }

        if (content && !document.getElementById('tab-about')) {
            var about = document.createElement('div');
            about.id = 'tab-about';
            about.className = 'tab-content native-about-tab';
            about.innerHTML = [
                '<h2 class="section-title">Site Hakk\u0131nda</h2>',
                '<div class="native-about-hero">',
                '<img src="novastore-logo.png" alt="NovaStore Logo">',
                '<div><strong>NovaStore</strong><p>G\u00fcvenli \u00f6deme, h\u0131zl\u0131 teslimat ve kategori bazl\u0131 d\u00fczenli al\u0131\u015fveri\u015f deneyimi sunan modern bir e-ticaret vitrini.</p></div>',
                '</div>',
                '<div class="native-about-list">',
                '<a href="mailto:destek@novastore.tr"><span>@</span><div><strong>E-Posta</strong><em>destek@novastore.tr</em></div></a>',
                '<a href="tel:+905314642430"><span>TR</span><div><strong>Telefon</strong><em>0531 464 24 30</em></div></a>',
                '<a href="https://www.instagram.com/novastore.tr/" target="_blank" rel="noopener noreferrer"><span>IG</span><div><strong>Instagram</strong><em>@novastore.tr</em></div></a>',
                '<a href="https://www.youtube.com/@novastoretr" target="_blank" rel="noopener noreferrer"><span>YT</span><div><strong>YouTube</strong><em>@novastoretr</em></div></a>',
                '</div>'
            ].join('');
            content.appendChild(about);
        }
    }

    function ensureProfileBackButton(header, activeView) {
        if (!header) return;

        var existing = header.querySelector('.native-profile-back');
        if (!activeView) {
            header.setAttribute('data-native-title', profileViewTitle(''));
            if (existing) existing.remove();
            return;
        }

        header.setAttribute('data-native-title', profileViewTitle(activeView));

        if (!existing) {
            existing = document.createElement('button');
            existing.type = 'button';
            existing.className = 'native-profile-back';
            existing.setAttribute('aria-label', 'Hesabima don');
            existing.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5 8 12l7 7"/></svg>';
            header.insertBefore(existing, header.firstChild);
        }

        existing.onclick = function () {
            goApp('profile.html');
        };
    }

    function enhanceProfileScreen() {
        if (pageName !== 'profile.html') return;

        document.body.classList.add('native-profile-screen');
        var activeView = getProfileViewParam();
        document.body.classList.toggle('native-profile-detail-screen', Boolean(activeView));
        document.body.classList.toggle('native-profile-home-screen', !activeView);
        ensureProfileBackButton(document.querySelector('header'), activeView);
        ensureNativeProfileAbout();

        var nav = document.querySelector('.profile-nav');
        if (nav && !nav.dataset.nativeEnhanced) {
            nav.dataset.nativeEnhanced = 'true';
            nav.querySelectorAll('li').forEach(function (item) {
                var tabId = getProfileTabFromElement(item);
                if (!tabId) return;

                item.dataset.nativeProfileTab = tabId;
                item.removeAttribute('onclick');
                item.innerHTML = [
                    '<span class="native-profile-row-icon">' + profileRowIcon(tabId) + '</span>',
                    '<span class="native-profile-row-label">' + profileRowLabel(tabId) + '</span>',
                    '<span class="native-profile-row-chevron" aria-hidden="true">›</span>'
                ].join('');

                item.addEventListener('click', function (event) {
                    event.preventDefault();
                    goApp(profileViewUrl(tabId));
                });
            });
        }

        if (!activeView && nav) {
            nav.querySelectorAll('li').forEach(function (item) {
                item.classList.remove('active');
            });
        }

        var logout = document.querySelector('.profile-sidebar .btn-logout');
        if (logout && !logout.dataset.nativeEnhanced) {
            logout.dataset.nativeEnhanced = 'true';
            logout.innerHTML = '<span>Çıkış yap</span>';
        }

        if (activeView) {
            activateProfileView(activeView, false);
        }

        window.addEventListener('hashchange', function () {
            var hashView = normalizeProfileTab(window.location.hash || '');
            if (hashView) {
                goApp(profileViewUrl(hashView));
            }
        });

        if (typeof window.navigateProfileNotif === 'function') {
            var originalNavigateProfileNotif = window.navigateProfileNotif;
            window.navigateProfileNotif = function (type) {
                var tabMap = {
                    order_update: 'orders',
                    new_review: 'reviews',
                    welcome: 'orders'
                };
                var tabId = tabMap[type];
                if (tabId) {
                    goApp(profileViewUrl(tabId));
                    return;
                }
                originalNavigateProfileNotif(type);
            };
        }
    }

    function activateProfileHash(shouldScroll) {
        if (pageName !== 'profile.html') return;

        var tabId = getProfileViewParam();
        activateProfileView(tabId, shouldScroll);
    }

    function activateProfileView(tabId, shouldScroll) {
        if (!tabId || typeof window.switchTab !== 'function') return;

        var row = document.querySelector('.profile-nav li[data-native-profile-tab="' + tabId + '"]');
        if (!row) return;

        window.switchTab(tabId, row);
        document.body.classList.add('native-profile-tab-open');

        if (shouldScroll) {
            window.setTimeout(function () {
                var content = document.querySelector('.content-card');
                if (content) content.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 80);
        }
    }

    function ensurePageAppBar() {
        if (isAdminPage() || isAuthPage() || document.querySelector('header') || document.querySelector('.native-page-appbar')) return;

        var titles = {
            'categories.html': 'Kategoriler',
            'checkout.html': 'Ödeme',
            'payment-result.html': 'Sipariş',
            'profile.html': 'Hesabım',
            'product.html': 'Ürün detayı'
        };

        var appbar = document.createElement('div');
        appbar.className = 'native-page-appbar';
        appbar.innerHTML = [
            '<a href="' + appUrl('index.html') + '" class="native-appbar-logo" aria-label="Ana sayfa">Nova<span>Store</span></a>',
            '<strong>' + (titles[pageName] || 'NovaStore') + '</strong>',
            '<button type="button" class="native-appbar-home" aria-label="Ana sayfaya dön">' + icon('home') + '</button>'
        ].join('');

        appbar.querySelector('.native-appbar-home').addEventListener('click', function () {
            goApp('index.html');
        });

        document.body.insertBefore(appbar, document.body.firstChild);
    }

    function setupHomeScreen() {
        if (!isHomePage()) return;

        var params = new URLSearchParams(window.location.search);
        if (params.has('category') || params.has('search')) {
            document.body.classList.add('native-filtered-list');
        }

        var hero = document.querySelector('.hero-section');
        var categoryNav = document.getElementById('category-nav');

        if (hero && false && !document.querySelector('.native-promo-strip')) {
            var promo = document.createElement('section');
            promo.className = 'native-promo-strip';
            promo.innerHTML = [
                '<a href="' + appUrl('index.html?search=kampanya') + '" class="native-promo-card premium"><strong>PREMIUM</strong><span>%10 NovaPuan kazan</span></a>',
                '<a href="' + appUrl('index.html?category=Telefon') + '" class="native-promo-card"><strong>Hızlı keşif</strong><span>Telefon ve aksesuarlar</span></a>'
            ].join('');
            hero.parentNode.insertBefore(promo, hero);
        }

        if (hero && categoryNav && categoryNav.previousElementSibling !== hero) {
            hero.insertAdjacentElement('afterend', categoryNav);
        }

        var title = document.getElementById('urunler-title');
        if (title && !document.body.classList.contains('native-filtered-list')) {
            title.textContent = 'Öne çıkan ürünler';
        }
    }

    function closeOpenSurfaces() {
        var cartSidebar = document.getElementById('cart-sidebar');
        var cartOverlay = document.getElementById('cart-overlay');
        var checkoutAddressModal = document.getElementById('checkout-address-modal');
        var newAddressModal = document.getElementById('new-address-modal');
        var returnModal = document.getElementById('return-modal-overlay');

        if (cartSidebar && (cartSidebar.classList.contains('open') || cartSidebar.style.right === '0px' || cartSidebar.style.right === '0')) {
            if (typeof window.closeCart === 'function') window.closeCart();
            else {
                cartSidebar.classList.remove('open');
                cartSidebar.style.right = '-600px';
                if (cartOverlay) cartOverlay.classList.remove('open');
            }
            return true;
        }

        var modal = [checkoutAddressModal, newAddressModal, returnModal].find(function (el) {
            return el && getComputedStyle(el).display !== 'none';
        });

        if (modal) {
            modal.style.display = 'none';
            return true;
        }

        return false;
    }

    function setImportantStyle(element, property, value) {
        if (!element) return;
        element.style.setProperty(property, value, 'important');
    }

    function findPriceElement(priceBox) {
        if (!priceBox) return null;

        var candidates = Array.prototype.slice.call(priceBox.querySelectorAll('div')).filter(function (node) {
            var text = (node.textContent || '').replace(/\s+/g, ' ').trim();
            return /\d/.test(text) && text.indexOf('TL') >= 0 && text.indexOf('Sepete') < 0 && node.children.length <= 1;
        });

        return candidates[candidates.length - 1] || priceBox.querySelector('[style*="color: #333"], [style*="color: #00897B"]') || priceBox;
    }

    function normalizeProductPriceCards() {
        if (isAdminPage()) return;

        document.querySelectorAll('.product-card').forEach(function (card) {
            var addButton = card.querySelector('.btn-add');
            if (!addButton) return;

            var priceBox = addButton.previousElementSibling;
            var actionRow = addButton.parentElement;
            if (!priceBox || !actionRow) return;

            var isDiscounted = (priceBox.textContent || '').indexOf('Sepete') >= 0;
            var priceElement = findPriceElement(priceBox);
            priceBox.classList.add('native-price-box');
            priceBox.classList.toggle('native-price-box-discount', isDiscounted);
            priceBox.classList.toggle('native-price-box-regular', !isDiscounted);

            if (priceElement) {
                priceElement.classList.add('native-card-price');
                priceElement.classList.toggle('native-card-price-discount', isDiscounted);
                priceElement.classList.toggle('native-card-price-regular', !isDiscounted);
            }

            setImportantStyle(actionRow, 'display', 'grid');
            setImportantStyle(actionRow, 'grid-template-columns', 'minmax(0, 1fr) 34px');
            setImportantStyle(actionRow, 'gap', '6px');
            setImportantStyle(actionRow, 'align-items', 'stretch');

            setImportantStyle(priceBox, 'min-height', '44px');
            setImportantStyle(priceBox, 'width', '100%');
            setImportantStyle(priceBox, 'min-width', '0');
            setImportantStyle(priceBox, 'margin-right', '0');
            setImportantStyle(priceBox, 'padding', '5px 4px');
            setImportantStyle(priceBox, 'align-items', 'flex-start');
            setImportantStyle(priceBox, 'justify-content', 'center');
            setImportantStyle(priceBox, 'text-align', 'left');
            setImportantStyle(priceBox, 'overflow', 'visible');
            setImportantStyle(priceBox, 'border', '0');
            setImportantStyle(priceBox, 'background', 'transparent');

            setImportantStyle(addButton, 'width', '34px');
            setImportantStyle(addButton, 'min-width', '34px');
            setImportantStyle(addButton, 'min-height', '44px');
            setImportantStyle(addButton, 'background', 'var(--app-accent)');

            if (priceElement) {
                setImportantStyle(priceElement, 'font-size', isDiscounted ? '0.9rem' : '0.95rem');
                setImportantStyle(priceElement, 'line-height', '1.02');
                setImportantStyle(priceElement, 'font-weight', '800');
                setImportantStyle(priceElement, 'letter-spacing', '0');
                setImportantStyle(priceElement, 'white-space', 'normal');
                setImportantStyle(priceElement, 'overflow', 'visible');
                if (!isDiscounted) setImportantStyle(priceElement, 'color', 'var(--app-ink)');

                priceElement.querySelectorAll('span').forEach(function (span) {
                    setImportantStyle(span, 'display', 'inline');
                    setImportantStyle(span, 'margin-top', '0');
                    setImportantStyle(span, 'font-size', '0.66rem');
                    setImportantStyle(span, 'line-height', '1');
                    setImportantStyle(span, 'font-weight', '700');
                });
            }
        });
    }

    function setupProductCardEnhancements() {
        normalizeProductPriceCards();

        if (!window.MutationObserver) return;

        [
            document.getElementById('products-container'),
            document.getElementById('favorites-container'),
            document.querySelector('.product-grid')
        ].forEach(function (container) {
            if (!container || container.dataset.nativePriceObserver === 'true') return;

            container.dataset.nativePriceObserver = 'true';
            new MutationObserver(function () {
                window.requestAnimationFrame(normalizeProductPriceCards);
            }).observe(container, { childList: true, subtree: true });
        });
    }

    function closeNativeSubcategoryTray(menu) {
        var tray = document.querySelector('.native-subcategory-tray');
        if (tray) tray.remove();

        if (!menu) menu = document.getElementById('category-menu');
        if (!menu) return;

        menu.querySelectorAll('.category-item.is-open').forEach(function (item) {
            item.classList.remove('is-open');
            var trigger = item.querySelector('.category-trigger');
            if (trigger) trigger.setAttribute('aria-expanded', 'false');
        });
    }

    function setupNativeCategoryTray() {
        var menu = document.getElementById('category-menu');
        var nav = document.getElementById('category-nav');
        if (!menu || !nav || menu.dataset.nativeTrayBound === 'true') return;

        menu.dataset.nativeTrayBound = 'true';

        menu.addEventListener('click', function (event) {
            var trigger = event.target && event.target.closest ? event.target.closest('.category-trigger') : null;
            if (!trigger || !menu.contains(trigger)) return;

            var item = trigger.closest('.category-item');
            if (!item || !item.classList.contains('has-children')) return;

            var subItems = Array.prototype.slice.call(item.querySelectorAll('.subcategory-item'));
            if (!subItems.length) return;

            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();

            var wasOpen = item.classList.contains('is-open');
            closeNativeSubcategoryTray(menu);
            if (wasOpen) return;

            item.classList.add('is-open');
            trigger.setAttribute('aria-expanded', 'true');

            var tray = document.createElement('div');
            tray.className = 'native-subcategory-tray';
            subItems.forEach(function (subItem) {
                var name = subItem.dataset.categoryName || subItem.textContent || '';
                var link = document.createElement('a');
                link.className = 'native-subcategory-link';
                link.href = appUrl('index.html?category=' + encodeURIComponent(name));
                link.textContent = name;
                tray.appendChild(link);
            });

            nav.insertAdjacentElement('afterend', tray);
        }, true);

        document.addEventListener('click', function (event) {
            if (nav.contains(event.target) || (event.target.closest && event.target.closest('.native-subcategory-tray'))) return;
            closeNativeSubcategoryTray(menu);
        });
    }

    function setupPullToRefresh() {
        if (isAdminPage() || isAuthPage() || !window.TouchEvent) return;

        var threshold = 74;
        var maxPull = 104;
        var startY = 0;
        var startX = 0;
        var pullDistance = 0;
        var isTouching = false;
        var isPulling = false;
        var isRefreshing = false;
        var startsInScrollableRegion = false;
        var indicator = null;

        function getScrollTop() {
            return window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
        }

        function getMaxScrollTop() {
            var doc = document.documentElement;
            var body = document.body;
            return Math.max(0, Math.max(doc.scrollHeight, body.scrollHeight) - window.innerHeight);
        }

        function isInteractiveTarget(target) {
            return Boolean(target && target.closest && target.closest([
                'input',
                'textarea',
                'select',
                '[contenteditable="true"]',
                '.cart-sidebar',
                '.native-alert-overlay',
                '#chat-window',
                '.modal',
                '.modal-content'
            ].join(',')));
        }

        function hasScrollableParent(target) {
            var node = target && target.nodeType === 1 ? target : target && target.parentElement;
            while (node && node !== document.body && node !== document.documentElement) {
                var style = window.getComputedStyle(node);
                if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && node.scrollHeight > node.clientHeight + 2) {
                    return true;
                }
                node = node.parentElement;
            }
            return false;
        }

        function ensureIndicator() {
            if (indicator) return indicator;

            indicator = document.createElement('div');
            indicator.className = 'native-pull-refresh';
            indicator.innerHTML = '<span class="native-pull-spinner"></span><strong>Yenile</strong>';
            document.body.appendChild(indicator);
            return indicator;
        }

        function hideIndicator() {
            if (!indicator) return;
            indicator.classList.remove('is-visible', 'is-ready', 'is-refreshing');
            indicator.style.setProperty('--pull-offset', '0px');
            document.body.classList.remove('native-is-pulling');
            var label = indicator.querySelector('strong');
            if (label) label.textContent = 'Yenile';
        }

        function updateIndicator(distance) {
            var el = ensureIndicator();
            var ready = distance >= threshold;
            var label = el.querySelector('strong');

            el.style.setProperty('--pull-offset', Math.max(0, distance) + 'px');
            el.classList.add('is-visible');
            el.classList.toggle('is-ready', ready);
            document.body.classList.add('native-is-pulling');
            if (label) label.textContent = ready ? 'Bırak yenile' : 'Yenile';
        }

        function startRefresh() {
            var el = ensureIndicator();
            var label = el.querySelector('strong');

            isRefreshing = true;
            document.body.classList.add('native-is-pulling');
            el.classList.add('is-visible', 'is-refreshing');
            el.classList.remove('is-ready');
            el.style.setProperty('--pull-offset', '12px');
            if (label) label.textContent = 'Yenileniyor';

            window.setTimeout(function () {
                window.location.reload();
            }, 220);
        }

        document.addEventListener('touchstart', function (event) {
            if (isRefreshing || event.touches.length !== 1 || isInteractiveTarget(event.target)) return;

            isTouching = true;
            isPulling = false;
            pullDistance = 0;
            startsInScrollableRegion = hasScrollableParent(event.target);
            startY = event.touches[0].clientY;
            startX = event.touches[0].clientX;
        }, { passive: true });

        document.addEventListener('touchmove', function (event) {
            if (!isTouching || isRefreshing || event.touches.length !== 1) return;
            if (startsInScrollableRegion) return;

            var touch = event.touches[0];
            var deltaY = touch.clientY - startY;
            var deltaX = touch.clientX - startX;
            var absY = Math.abs(deltaY);
            var absX = Math.abs(deltaX);

            if (absX > absY) return;

            var currentScrollTop = getScrollTop();
            var atTop = currentScrollTop <= 0;
            var atBottom = currentScrollTop >= getMaxScrollTop() - 1;

            if (atTop && deltaY > 0) {
                event.preventDefault();
                isPulling = true;
                pullDistance = Math.min(maxPull, deltaY * 0.52);
                updateIndicator(pullDistance);
                return;
            }

            if (atBottom && deltaY < 0) {
                event.preventDefault();
            }
        }, { passive: false });

        document.addEventListener('touchend', function () {
            if (!isTouching) return;

            isTouching = false;
            if (!isPulling) {
                document.body.classList.remove('native-is-pulling');
                return;
            }

            if (pullDistance >= threshold) {
                startRefresh();
            } else {
                hideIndicator();
            }

            isPulling = false;
            pullDistance = 0;
            if (!isRefreshing) document.body.classList.remove('native-is-pulling');
        }, { passive: true });

        document.addEventListener('touchcancel', function () {
            isTouching = false;
            isPulling = false;
            pullDistance = 0;
            startsInScrollableRegion = false;
            if (!isRefreshing) hideIndicator();
            if (!isRefreshing) document.body.classList.remove('native-is-pulling');
        }, { passive: true });
    }

    function setupNativeCheckoutFlow() {
        if (pageName !== 'checkout.html' || document.body.dataset.nativeCheckoutFlow === 'true') return;

        var container = document.querySelector('.checkout-container');
        var form = document.getElementById('checkout-form');
        var sections = form ? Array.prototype.slice.call(form.querySelectorAll('.checkout-section')) : [];
        var addressSection = sections[0];
        var paymentSection = sections[1];
        var summary = document.querySelector('.order-summary');
        var submitButton = document.getElementById('submit-btn');
        var total = document.getElementById('checkout-total');
        var trustRow = submitButton ? submitButton.nextElementSibling : null;
        var legalLinks = form ? form.querySelector('.legal-links') : null;

        if (!container || !form || !addressSection || !paymentSection || !summary || !submitButton) return;

        document.body.dataset.nativeCheckoutFlow = 'true';
        document.body.classList.add('native-checkout-flow');
        addressSection.dataset.nativeCheckoutStep = 'address';
        paymentSection.dataset.nativeCheckoutStep = 'payment';
        summary.dataset.nativeCheckoutStep = 'summary';
        if (trustRow) trustRow.classList.add('native-checkout-trust-row');
        if (legalLinks) legalLinks.classList.add('native-checkout-legal');
        if (trustRow) summary.appendChild(trustRow);
        if (legalLinks) summary.appendChild(legalLinks);

        var stepper = document.createElement('nav');
        stepper.className = 'native-checkout-stepper';
        stepper.setAttribute('aria-label', 'Ödeme adımları');
        stepper.innerHTML = [
            '<button type="button" data-step="address"><span>1</span><strong>Adres</strong></button>',
            '<button type="button" data-step="payment"><span>2</span><strong>Ödeme</strong></button>',
            '<button type="button" data-step="summary"><span>3</span><strong>Özet</strong></button>'
        ].join('');
        container.insertBefore(stepper, container.firstChild);

        var bottom = document.createElement('div');
        bottom.className = 'native-checkout-bottom';
        bottom.innerHTML = [
            '<div><span>Toplam</span><strong><em id="native-checkout-total">0</em> TL</strong></div>',
            '<button type="button" id="native-checkout-action">Devam Et</button>'
        ].join('');
        document.body.appendChild(bottom);

        var activeStep = 'address';
        var stepOrder = ['address', 'payment', 'summary'];
        var actionButton = bottom.querySelector('#native-checkout-action');
        var nativeTotal = bottom.querySelector('#native-checkout-total');

        function updateTotal() {
            if (nativeTotal && total) nativeTotal.textContent = total.textContent || '0';
        }

        function hasSelectedAddress() {
            var title = document.getElementById('checkout-addr-title');
            var detail = document.getElementById('checkout-addr-detail');
            var text = ((title && title.textContent) || '') + ' ' + ((detail && detail.textContent) || '');
            return text.indexOf('Henüz Kayıtlı Adresiniz Yok') < 0
                && text.indexOf('Lütfen Adres Seçin') < 0
                && text.indexOf('yeni bir adres ekleyin') < 0
                && text.trim().length > 12;
        }

        function getPaymentMethod() {
            var checked = document.querySelector('input[name="paymentMethod"]:checked');
            return checked ? checked.value : 'card';
        }

        function hasPaymentDetails() {
            var name = document.getElementById('cardName');
            var number = document.getElementById('cardNumber');
            var expiry = document.getElementById('cardExpiry');
            var cvv = document.getElementById('cardCvv');
            var digits = number ? String(number.value || '').replace(/\D/g, '') : '';
            var expiryValue = expiry ? String(expiry.value || '').trim() : '';
            var cvvValue = cvv ? String(cvv.value || '').replace(/\D/g, '') : '';

            return Boolean(
                name && name.value.trim().length >= 3 &&
                digits.length >= 16 &&
                /^\d{2}\/\d{2}$/.test(expiryValue) &&
                cvvValue.length >= 3
            );
        }

        function warn(message) {
            if (window.NovaNativeAlert) {
                window.NovaNativeAlert(message, { title: 'Eksik bilgi', type: 'error' });
            } else {
                window.alert(message);
            }
        }

        function canOpenStep(step, silent) {
            if (step === 'address') return true;

            if (!hasSelectedAddress()) {
                if (!silent) {
                    warn('Ödeme adımına geçmeden önce teslimat adresi ekleyin veya seçin.');
                    if (typeof window.openCheckoutAddressModal === 'function') window.openCheckoutAddressModal();
                }
                return false;
            }

            if (step === 'summary' && !hasPaymentDetails()) {
                if (!silent) warn('Özete geçmeden önce ödeme bilgilerini eksiksiz doldurun.');
                return false;
            }

            return true;
        }

        function setStep(step) {
            if (stepOrder.indexOf(step) < 0) step = 'address';
            if (!canOpenStep(step)) return;
            activeStep = step;
            document.body.dataset.nativeCheckoutStep = step;

            [addressSection, paymentSection, summary].forEach(function (panel) {
                var isActive = panel.dataset.nativeCheckoutStep === step;
                panel.classList.toggle('native-step-active', isActive);
                panel.classList.toggle('native-step-hidden', !isActive);
            });
            if (trustRow) trustRow.classList.toggle('native-step-hidden', step !== 'summary');
            if (legalLinks) legalLinks.classList.toggle('native-step-hidden', step !== 'summary');

            stepper.querySelectorAll('button').forEach(function (button) {
                var isActive = button.dataset.step === step;
                var isDone = stepOrder.indexOf(button.dataset.step) < stepOrder.indexOf(step);
                var isLocked = !canOpenStep(button.dataset.step, true);
                button.classList.toggle('is-active', isActive);
                button.classList.toggle('is-done', isDone);
                button.classList.toggle('is-locked', isLocked);
            });

            if (actionButton) {
                actionButton.textContent = step === 'address'
                    ? 'Ödemeye Geç'
                    : step === 'payment'
                        ? 'Özeti Gör'
                        : 'Siparişi Tamamla';
            }

            updateTotal();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        stepper.addEventListener('click', function (event) {
            var button = event.target && event.target.closest ? event.target.closest('button[data-step]') : null;
            if (!button) return;
            setStep(button.dataset.step);
        });

        if (actionButton) {
            actionButton.addEventListener('click', function () {
                if (activeStep === 'address') {
                    setStep('payment');
                    return;
                }

                if (activeStep === 'payment') {
                    setStep('summary');
                    return;
                }

                if (typeof form.requestSubmit === 'function') {
                    form.requestSubmit(submitButton);
                } else {
                    submitButton.click();
                }
            });
        }

        if (total && window.MutationObserver) {
            new MutationObserver(updateTotal).observe(total, { childList: true, subtree: true, characterData: true });
        }

        setStep('address');
    }

    function setupAndroidBackButton() {
        var appPlugin = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
        if (!appPlugin || typeof appPlugin.addListener !== 'function') return;

        appPlugin.addListener('backButton', function (event) {
            if (closeOpenSurfaces()) return;

            if (pageName === 'checkout.html' || pageName === 'payment-result.html') {
                goApp('index.html');
                return;
            }

            if (pageName === 'profile.html' && getProfileViewParam()) {
                goApp('profile.html');
                return;
            }

            if (!isHomePage()) {
                if (event && event.canGoBack && history.length > 1) {
                    history.back();
                } else {
                    goApp('index.html');
                }
                return;
            }

            if (typeof appPlugin.minimizeApp === 'function') {
                appPlugin.minimizeApp();
            }
        });
    }

    function setupAppRoutePersistence() {
        if (document.body.dataset.nativeRoutePersistence === 'true') return;
        document.body.dataset.nativeRoutePersistence = 'true';

        document.addEventListener('click', function (event) {
            var anchor = event.target && event.target.closest ? event.target.closest('a[href]') : null;
            if (!anchor || anchor.target || anchor.hasAttribute('download')) return;

            var href = anchor.getAttribute('href') || '';
            var nextHref = appUrl(href);
            if (nextHref === href) return;

            event.preventDefault();
            goApp(nextHref);
        }, true);

        document.addEventListener('submit', function (event) {
            var form = event.target;
            if (!form || form.tagName !== 'FORM') return;
            var method = String(form.getAttribute('method') || 'GET').toUpperCase();
            if (method !== 'GET') return;

            var action = form.getAttribute('action') || window.location.pathname;
            var nextAction = appUrl(action);
            if (nextAction !== action) {
                form.setAttribute('action', nextAction);
            }

            if (window.NOVASTORE_USE_NATIVE_THEME && !window.NOVASTORE_IS_NATIVE_APP && !form.querySelector('input[name="nativeTheme"]')) {
                var input = document.createElement('input');
                input.type = 'hidden';
                input.name = 'nativeTheme';
                input.value = '1';
                form.appendChild(input);
            }
        }, true);
    }

    function init() {
        document.body.classList.add(pageClass);
        setupNativeAlerts();
        makeHeaderAppLike();
        ensurePageAppBar();
        setupNativeCheckoutFlow();
        setupHomeScreen();
        enhanceProfileScreen();
        createBottomNav();
        setupNativeNavigationMotion();
        setupProductCardEnhancements();
        setupNativeCategoryTray();
        setupPullToRefresh();
        setupAppRoutePersistence();
        setupAndroidBackButton();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
}());
