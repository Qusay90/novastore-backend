(() => {
    if (window.__novaFooterReady) return;
    window.__novaFooterReady = true;

    const FOOTER_SOCIAL_LINKS = [
        { label: 'Instagram', iconClass: 'fa-instagram', href: 'https://www.instagram.com/novastore.tr/' },
        { label: 'YouTube', iconClass: 'fa-youtube', href: 'https://www.youtube.com/@novastoretr' },
        { label: 'TikTok', iconClass: 'fa-tiktok', href: 'https://www.tiktok.com/@novastoretr' },
        { label: 'Facebook', iconClass: 'fa-facebook-f', href: 'https://www.facebook.com/novastoretr' },
        { label: 'X', iconClass: 'fa-x-twitter', href: 'https://x.com/novastoretr' },
        { label: 'LinkedIn', iconClass: 'fa-linkedin-in', href: 'https://www.linkedin.com/company/novastoretr' },
        { label: 'Pinterest', iconClass: 'fa-pinterest-p', href: 'https://www.pinterest.com/novastoretr/' }
    ];

    function injectIconFont() {
        if (document.getElementById('nova-footer-icon-font')) return;

        const link = document.createElement('link');
        link.id = 'nova-footer-icon-font';
        link.rel = 'stylesheet';
        link.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css';
        link.crossOrigin = 'anonymous';
        link.referrerPolicy = 'no-referrer';
        document.head.appendChild(link);
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
            .nova-footer-social-badge i {
                line-height: 1;
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
                <span class="nova-footer-social-badge" aria-hidden="true"><i class="fa-brands ${item.iconClass}"></i></span>
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
            const response = await fetch('/api/categories');
            if (!response.ok) throw new Error('Kategori isteği başarısız.');
            const categories = await response.json();
            const items = getFooterCategoryItems(categories);

            if (!items.length) {
                container.innerHTML = '<span class="nova-footer-loading">Henüz kategori oluşturulmamış.</span>';
                return;
            }

            container.innerHTML = items
                .map((item) => `<a class="nova-footer-category-item" href="index.html?category=${encodeURIComponent(item.name)}">${item.name}</a>`)
                .join('');
        } catch (_) {
            container.innerHTML = '<span class="nova-footer-loading">Kategoriler şu anda alınamadı.</span>';
        }
    }

    function initFooter() {
        injectIconFont();
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
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initFooter, { once: true });
    } else {
        initFooter();
    }
})();
