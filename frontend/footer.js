(() => {
    if (window.__novaFooterReady) return;
    window.__novaFooterReady = true;

    // Font Awesome Free 6.5.2 brand icon data. See assets/vendor/fontawesome/LICENSE.txt.
    const FOOTER_BRAND_ICONS = Object.freeze({
        instagram: {
            viewBox: '0 0 448 512',
            path: 'M224.1 141c-63.6 0-114.9 51.3-114.9 114.9s51.3 114.9 114.9 114.9S339 319.5 339 255.9 287.7 141 224.1 141zm0 189.6c-41.1 0-74.7-33.5-74.7-74.7s33.5-74.7 74.7-74.7 74.7 33.5 74.7 74.7-33.6 74.7-74.7 74.7zm146.4-194.3c0 14.9-12 26.8-26.8 26.8-14.9 0-26.8-12-26.8-26.8s12-26.8 26.8-26.8 26.8 12 26.8 26.8zm76.1 27.2c-1.7-35.9-9.9-67.7-36.2-93.9-26.2-26.2-58-34.4-93.9-36.2-37-2.1-147.9-2.1-184.9 0-35.8 1.7-67.6 9.9-93.9 36.1s-34.4 58-36.2 93.9c-2.1 37-2.1 147.9 0 184.9 1.7 35.9 9.9 67.7 36.2 93.9s58 34.4 93.9 36.2c37 2.1 147.9 2.1 184.9 0 35.9-1.7 67.7-9.9 93.9-36.2 26.2-26.2 34.4-58 36.2-93.9 2.1-37 2.1-147.8 0-184.8zM398.8 388c-7.8 19.6-22.9 34.7-42.6 42.6-29.5 11.7-99.5 9-132.1 9s-102.7 2.6-132.1-9c-19.6-7.8-34.7-22.9-42.6-42.6-11.7-29.5-9-99.5-9-132.1s-2.6-102.7 9-132.1c7.8-19.6 22.9-34.7 42.6-42.6 29.5-11.7 99.5-9 132.1-9s102.7-2.6 132.1 9c19.6 7.8 34.7 22.9 42.6 42.6 11.7 29.5 9 99.5 9 132.1s2.7 102.7-9 132.1z'
        },
        youtube: {
            viewBox: '0 0 576 512',
            path: 'M549.655 124.083c-6.281-23.65-24.787-42.276-48.284-48.597C458.781 64 288 64 288 64S117.22 64 74.629 75.486c-23.497 6.322-42.003 24.947-48.284 48.597-11.412 42.867-11.412 132.305-11.412 132.305s0 89.438 11.412 132.305c6.281 23.65 24.787 41.5 48.284 47.821C117.22 448 288 448 288 448s170.78 0 213.371-11.486c23.497-6.321 42.003-24.171 48.284-47.821 11.412-42.867 11.412-132.305 11.412-132.305s0-89.438-11.412-132.305zm-317.51 213.508V175.185l142.739 81.205-142.739 81.201z'
        },
        tiktok: {
            viewBox: '0 0 448 512',
            path: 'M448,209.91a210.06,210.06,0,0,1-122.77-39.25V349.38A162.55,162.55,0,1,1,185,188.31V278.2a74.62,74.62,0,1,0,52.23,71.18V0l88,0a121.18,121.18,0,0,0,1.86,22.17h0A122.18,122.18,0,0,0,381,102.39a121.43,121.43,0,0,0,67,20.14Z'
        },
        facebook: {
            viewBox: '0 0 320 512',
            path: 'M80 299.3V512H196V299.3h86.5l18-97.8H196V166.9c0-51.7 20.3-71.5 72.7-71.5c16.3 0 29.4 .4 37 1.2V7.9C291.4 4 256.4 0 236.2 0C129.3 0 80 50.5 80 159.4v42.1H14v97.8H80z'
        },
        x: {
            viewBox: '0 0 512 512',
            path: 'M389.2 48h70.6L305.6 224.2 487 464H345L233.7 318.6 106.5 464H35.8L200.7 275.5 26.8 48H172.4L272.9 180.9 389.2 48zM364.4 421.8h39.1L151.1 88h-42L364.4 421.8z'
        },
        linkedin: {
            viewBox: '0 0 448 512',
            path: 'M100.28 448H7.4V148.9h92.88zM53.79 108.1C24.09 108.1 0 83.5 0 53.8a53.79 53.79 0 0 1 107.58 0c0 29.7-24.1 54.3-53.79 54.3zM447.9 448h-92.68V302.4c0-34.7-.7-79.2-48.29-79.2-48.29 0-55.69 37.7-55.69 76.7V448h-92.78V148.9h89.08v40.8h1.3c12.4-23.5 42.69-48.3 87.88-48.3 94 0 111.28 61.9 111.28 142.3V448z'
        },
        pinterest: {
            viewBox: '0 0 384 512',
            path: 'M204 6.5C101.4 6.5 0 74.9 0 185.6 0 256 39.6 296 63.6 296c9.9 0 15.6-27.6 15.6-35.4 0-9.3-23.7-29.1-23.7-67.8 0-80.4 61.2-137.4 140.4-137.4 68.1 0 118.5 38.7 118.5 109.8 0 53.1-21.3 152.7-90.3 152.7-24.9 0-46.2-18-46.2-43.8 0-37.8 26.4-74.4 26.4-113.4 0-66.2-93.9-54.2-93.9 25.8 0 16.8 2.1 35.4 9.6 50.7-13.8 59.4-42 147.9-42 209.1 0 18.9 2.7 37.5 4.5 56.4 3.4 3.8 1.7 3.4 6.9 1.5 50.4-69 48.6-82.5 71.4-172.8 12.3 23.4 44.1 36 69.3 36 106.2 0 153.9-103.5 153.9-196.8C384 71.3 298.2 6.5 204 6.5z'
        }
    });

    const FOOTER_SOCIAL_LINKS = [
        { label: 'Instagram', iconKey: 'instagram', href: 'https://www.instagram.com/novastore.tr/' },
        { label: 'YouTube', iconKey: 'youtube', href: 'https://www.youtube.com/@novastoretr' },
        { label: 'TikTok', iconKey: 'tiktok', href: 'https://www.tiktok.com/@novastoretr' },
        { label: 'Facebook', iconKey: 'facebook', href: 'https://www.facebook.com/novastoretr' },
        { label: 'X', iconKey: 'x', href: 'https://x.com/novastoretr' },
        { label: 'LinkedIn', iconKey: 'linkedin', href: 'https://www.linkedin.com/company/novastoretr' },
        { label: 'Pinterest', iconKey: 'pinterest', href: 'https://www.pinterest.com/novastoretr/' }
    ];

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function footerCategoryUrl(category) {
        const sharedUrl = window.NovaStoreCategoryNavigation?.categoryUrl?.(category);
        if (sharedUrl) return sharedUrl;
        const rawPath = String(category?.path || category?.slug || '').trim();
        const encodedPath = rawPath
            .replace(/^\/+|\/+$/g, '')
            .split('/')
            .map((segment) => segment.trim())
            .filter(Boolean)
            .map(encodeURIComponent)
            .join('/');
        return encodedPath ? `/kategori/${encodedPath}` : null;
    }

    function renderFooterSocialIcon(iconKey) {
        const icon = FOOTER_BRAND_ICONS[iconKey];
        if (!icon) return '';

        return `<svg class="nova-footer-social-icon" viewBox="${icon.viewBox}" aria-hidden="true" focusable="false"><path fill="currentColor" d="${icon.path}"></path></svg>`;
    }

    function injectFooterStyles() {
        if (document.getElementById('nova-footer-styles')) return;

        const style = document.createElement('style');
        style.id = 'nova-footer-styles';
        style.textContent = `
            body.nova-footer-mounted {
                display: block !important;
                min-height: 100vh;
            }
            .nova-footer-page-shell {
                width: 100%;
                min-height: calc(100vh - 360px);
            }
            .nova-footer-page-shell.is-centered {
                min-height: calc(100vh - 360px);
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 40px 20px 20px;
            }
            .nova-footer-page-shell.is-centered > * {
                width: 100%;
            }
            .nova-site-footer {
                margin-top: 56px;
                background:
                    radial-gradient(circle at top left, rgba(247, 148, 29, 0.16), transparent 32%),
                    linear-gradient(135deg, #081421 0%, #0F2A43 55%, #163B5D 100%);
                color: #EAF1F8;
                position: relative;
                overflow: hidden;
            }
            .nova-site-footer::before {
                content: "";
                position: absolute;
                inset: 0;
                background:
                    linear-gradient(120deg, rgba(255, 255, 255, 0.05), transparent 35%),
                    radial-gradient(circle at 85% 20%, rgba(247, 148, 29, 0.16), transparent 24%);
                pointer-events: none;
            }
            .nova-site-footer-inner {
                position: relative;
                max-width: 1240px;
                margin: 0 auto;
                padding: 54px 24px 26px;
            }
            .nova-site-footer-grid {
                display: grid;
                grid-template-columns: minmax(280px, 1.25fr) minmax(220px, 1fr) minmax(220px, 0.9fr);
                gap: 34px;
                align-items: start;
            }
            .nova-footer-brand {
                display: flex;
                gap: 18px;
                align-items: flex-start;
            }
            .nova-footer-brand-mark {
                width: 116px;
                height: 116px;
                border-radius: 20px;
                background: rgba(255, 255, 255, 0.08);
                border: 1px solid rgba(255, 255, 255, 0.12);
                display: inline-flex;
                align-items: center;
                justify-content: center;
                flex-shrink: 0;
                box-shadow: 0 12px 24px rgba(0, 0, 0, 0.18);
            }
            .nova-footer-brand-mark img {
                width: 98px;
                height: 98px;
                object-fit: contain;
                display: block;
            }
            .nova-footer-brand-copy h3 {
                margin: 0 0 10px;
                display: flex;
                align-items: center;
                gap: 10px;
                font-size: 1.32rem;
                letter-spacing: 0.02em;
                color: #FFFFFF;
            }
            .nova-footer-brand-copy h3 span {
                color: #F7A84A;
            }
            .nova-footer-brand-copy p {
                margin: 0;
                color: rgba(234, 241, 248, 0.78);
                line-height: 1.72;
                font-size: 0.95rem;
            }
            .nova-footer-column-title {
                margin: 0 0 16px;
                font-size: 0.9rem;
                text-transform: uppercase;
                letter-spacing: 0.12em;
                color: #F7A84A;
            }
            .nova-footer-category-list {
                display: flex;
                flex-wrap: wrap;
                gap: 10px;
            }
            .nova-footer-category-item {
                text-decoration: none;
                color: #F6FAFD;
                background: rgba(255, 255, 255, 0.08);
                border: 1px solid rgba(255, 255, 255, 0.1);
                padding: 10px 14px;
                border-radius: 999px;
                font-size: 0.88rem;
                transition: transform 0.2s ease, border-color 0.2s ease, background 0.2s ease;
            }
            .nova-footer-category-item:hover {
                transform: translateY(-2px);
                border-color: rgba(247, 148, 29, 0.72);
                background: rgba(247, 148, 29, 0.14);
            }
            .nova-footer-links {
                list-style: none;
                padding: 0;
                margin: 0;
                display: grid;
                gap: 12px;
            }
            .nova-footer-links a {
                color: rgba(234, 241, 248, 0.84);
                text-decoration: none;
                font-size: 0.95rem;
                transition: color 0.2s ease, transform 0.2s ease;
                display: inline-flex;
                align-items: center;
                gap: 8px;
            }
            .nova-footer-links a::before {
                content: "";
                width: 6px;
                height: 6px;
                border-radius: 50%;
                background: #F7941D;
                opacity: 0.85;
            }
            .nova-footer-links a:hover {
                color: #FFFFFF;
                transform: translateX(4px);
            }
            .nova-footer-note {
                padding: 18px 20px;
                border-radius: 18px;
                background: rgba(255, 255, 255, 0.08);
                border: 1px solid rgba(255, 255, 255, 0.1);
                color: rgba(234, 241, 248, 0.82);
                line-height: 1.7;
                font-size: 0.93rem;
            }
            .nova-footer-contact-list {
                list-style: none;
                padding: 0;
                margin: 18px 0 0;
                display: grid;
                gap: 12px;
            }
            .nova-footer-contact-item {
                display: flex;
                align-items: flex-start;
                gap: 12px;
                color: rgba(234, 241, 248, 0.86);
                font-size: 0.94rem;
            }
            .nova-footer-contact-icon {
                width: 34px;
                height: 34px;
                border-radius: 12px;
                background: rgba(255, 255, 255, 0.08);
                border: 1px solid rgba(255, 255, 255, 0.12);
                display: inline-flex;
                align-items: center;
                justify-content: center;
                color: #F7A84A;
                flex-shrink: 0;
                font-size: 0.86rem;
                font-weight: 800;
            }
            .nova-footer-contact-copy strong {
                display: block;
                margin-bottom: 4px;
                color: #FFFFFF;
                font-size: 0.84rem;
                text-transform: uppercase;
                letter-spacing: 0.08em;
            }
            .nova-footer-contact-copy a,
            .nova-footer-contact-copy span {
                color: rgba(234, 241, 248, 0.86);
                text-decoration: none;
            }
            .nova-footer-contact-copy a:hover {
                color: #FFFFFF;
            }
            .nova-footer-social-title {
                margin: 24px 0 12px;
                color: #FFFFFF;
                font-size: 0.98rem;
                font-weight: 700;
            }
            .nova-footer-social-list {
                display: grid;
                gap: 10px;
            }
            .nova-footer-social-link {
                display: inline-flex;
                align-items: center;
                gap: 12px;
                padding: 10px 12px;
                border-radius: 14px;
                text-decoration: none;
                color: #F6FAFD;
                background: rgba(255, 255, 255, 0.07);
                border: 1px solid rgba(255, 255, 255, 0.1);
                transition: transform 0.2s ease, border-color 0.2s ease, background 0.2s ease;
            }
            .nova-footer-social-link:hover {
                transform: translateX(4px);
                border-color: rgba(247, 148, 29, 0.74);
                background: rgba(247, 148, 29, 0.12);
            }
            .nova-footer-social-badge {
                width: 40px;
                height: 40px;
                border-radius: 50%;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                background: rgba(255, 255, 255, 0.12);
                color: #FFFFFF;
                border: 1px solid rgba(255, 255, 255, 0.18);
                flex-shrink: 0;
                font-size: 1.02rem;
                box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06);
            }
            .nova-footer-social-icon {
                width: 18px;
                height: 18px;
                display: block;
                flex: 0 0 auto;
                fill: currentColor;
            }
            .nova-footer-social-label {
                font-size: 0.94rem;
                font-weight: 600;
                letter-spacing: 0.01em;
            }
            .nova-footer-bottom {
                margin-top: 30px;
                padding-top: 18px;
                border-top: 1px solid rgba(255, 255, 255, 0.1);
                display: flex;
                justify-content: space-between;
                gap: 18px;
                flex-wrap: wrap;
                color: rgba(234, 241, 248, 0.62);
                font-size: 0.85rem;
            }
            .nova-footer-loading {
                color: rgba(234, 241, 248, 0.68);
                font-size: 0.9rem;
            }
            @media (max-width: 960px) {
                .nova-site-footer-grid {
                    grid-template-columns: 1fr;
                }
            }
            @media (max-width: 640px) {
                .nova-site-footer-inner {
                    padding: 44px 18px 22px;
                }
                .nova-footer-brand {
                    flex-direction: column;
                }
                .nova-footer-bottom {
                    flex-direction: column;
                }
            }
        `;

        document.head.appendChild(style);
    }

    function buildFooterShell() {
        if (document.getElementById('nova-footer-page-shell')) {
            return document.getElementById('nova-footer-page-shell');
        }

        const body = document.body;
        const shell = document.createElement('div');
        shell.id = 'nova-footer-page-shell';
        shell.className = 'nova-footer-page-shell';

        if (document.querySelector('.auth-container, .auth-card, .box')) {
            shell.classList.add('is-centered');
        }

        const movableNodes = Array.from(body.childNodes).filter((node) => {
            if (node.nodeType === Node.TEXT_NODE) {
                return String(node.textContent || '').trim().length > 0;
            }

            if (node.nodeType !== Node.ELEMENT_NODE) {
                return false;
            }

            const element = node;
            if (element.tagName === 'SCRIPT') return false;
            if (element.id === 'customer-chat-widget') return false;
            if (element.id === 'nova-site-footer') return false;
            if (element.id === 'nova-footer-page-shell') return false;
            return true;
        });

        const firstScript = Array.from(body.children).find((element) => element.tagName === 'SCRIPT') || null;
        body.insertBefore(shell, firstScript);
        movableNodes.forEach((node) => shell.appendChild(node));
        return shell;
    }

    function buildFooter() {
        const socialLinksHtml = FOOTER_SOCIAL_LINKS.map((item) => `
            <a class="nova-footer-social-link" href="${item.href}" target="_blank" rel="noopener noreferrer">
                <span class="nova-footer-social-badge" aria-hidden="true">${renderFooterSocialIcon(item.iconKey)}</span>
                <span class="nova-footer-social-label">${item.label}</span>
            </a>
        `).join('');

        const footer = document.createElement('footer');
        footer.id = 'nova-site-footer';
        footer.className = 'nova-site-footer';
        footer.lang = 'tr';
        footer.innerHTML = `
            <div class="nova-site-footer-inner">
                <div class="nova-site-footer-grid">
                    <section class="nova-footer-brand-copy">
                        <div class="nova-footer-brand">
                            <div class="nova-footer-brand-mark">
                                <img src="novastore-logo.png" alt="NovaStore Logo">
                            </div>
                            <div class="nova-footer-brand-copy">
                                <h3>NOVA<span>STORE</span></h3>
                                <p>NovaStore; güvenli ödeme, hızlı teslimat ve kategori bazlı düzenli alışveriş deneyimi sunan modern bir e-ticaret vitrini olarak tasarlandı. Ürün keşfi, destek ve sipariş takibini tek merkezde toplar.</p>
                            </div>
                        </div>
                    </section>

                    <section>
                        <h4 class="nova-footer-column-title">KATEGORİLER</h4>
                        <div id="nova-footer-categories" class="nova-footer-category-list">
                            <span class="nova-footer-loading">Kategoriler yükleniyor...</span>
                        </div>
                    </section>

                    <section>
                        <h4 class="nova-footer-column-title">İLETİŞİM VE TOPLULUK</h4>
                        <div class="nova-footer-note">
                            NovaStore ekibi; sipariş, ürün seçimi ve destek sürecinde hızlı geri dönüş için tek merkezden hizmet verir. Bizimle mail, telefon ve sosyal medya üzerinden iletişime geçebilirsiniz.
                        </div>
                        <ul class="nova-footer-contact-list">
                            <li class="nova-footer-contact-item">
                                <span class="nova-footer-contact-icon">@</span>
                                <div class="nova-footer-contact-copy">
                                    <strong>E-Posta</strong>
                                    <a href="mailto:destek@novastore.tr">destek@novastore.tr</a>
                                </div>
                            </li>
                            <li class="nova-footer-contact-item">
                                <span class="nova-footer-contact-icon">TR</span>
                                <div class="nova-footer-contact-copy">
                                    <strong>Telefon</strong>
                                    <a href="tel:+905314642430">0531 464 24 30</a>
                                </div>
                            </li>
                        </ul>
                        <div class="nova-footer-social-title">Bizi Takip Edin</div>
                        <div class="nova-footer-social-list">
                            ${socialLinksHtml}
                        </div>
                    </section>
                </div>

                <div class="nova-footer-bottom">
                    <span>&copy; <span id="nova-footer-year"></span> NovaStore. Tüm hakları saklıdır.</span>
                </div>
            </div>
        `;

        const footerBottomNotes = footer.querySelectorAll('.nova-footer-bottom span');
        if (footerBottomNotes.length > 1) {
            footerBottomNotes[1].remove();
        }

        return footer;
    }

    function getFooterCategoryItems(categories) {
        if (!Array.isArray(categories) || categories.length === 0) {
            return [];
        }

        const topLevel = categories
            .filter((item) => item && item.name)
            .sort((a, b) => {
                const aParent = a.parent_id === null || a.parent_id === undefined ? 0 : 1;
                const bParent = b.parent_id === null || b.parent_id === undefined ? 0 : 1;
                if (aParent !== bParent) return aParent - bParent;
                return String(a.name).localeCompare(String(b.name), 'tr');
            });

        const seen = new Set();
        return topLevel.filter((item) => {
            const key = String(item.name).trim().toLowerCase();
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return true;
        }).slice(0, 12);
    }

    async function populateFooterCategories() {
        const container = document.getElementById('nova-footer-categories');
        if (!container) return;

        try {
            const response = await fetch('/api/public/categories?format=tree');
            if (!response.ok) throw new Error('Kategori isteği başarısız.');
            const categories = await response.json();
            const items = getFooterCategoryItems(categories);

            if (!items.length) {
                container.innerHTML = '<span class="nova-footer-loading">Henüz kategori oluşturulmamış.</span>';
                return;
            }

            container.innerHTML = items
                .map((item) => ({ item, url: footerCategoryUrl(item) }))
                .filter(({ url }) => Boolean(url))
                .map(({ item, url }) =>
                    `<a class="nova-footer-category-item" href="${escapeHtml(url)}">${escapeHtml(item.name)}</a>`
                )
                .join('');
        } catch (_) {
            container.innerHTML = '<span class="nova-footer-loading">Kategoriler şu anda alınamadı.</span>';
        }
    }

    function initFooter() {
        injectFooterStyles();
        document.body.classList.add('nova-footer-mounted');
        const shell = buildFooterShell();
        const footer = buildFooter();
        shell.insertAdjacentElement('afterend', footer);

        const yearElement = document.getElementById('nova-footer-year');
        if (yearElement) {
            yearElement.textContent = String(new Date().getFullYear());
        }

        populateFooterCategories();

        if (!document.getElementById('nova-analytics-script')) {
            const analyticsScript = document.createElement('script');
            analyticsScript.id = 'nova-analytics-script';
            analyticsScript.src = 'analytics.js';
            analyticsScript.defer = true;
            document.body.appendChild(analyticsScript);
        } else if (window.NovaAnalytics && typeof window.NovaAnalytics.init === 'function') {
            window.NovaAnalytics.init();
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initFooter, { once: true });
    } else {
        initFooter();
    }
})();
