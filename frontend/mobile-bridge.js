(function () {
    var PRODUCTION_ORIGIN = 'https://novastore.tr';
    var APP_ASSET_VERSION = '20260526-app-contained-2';
    var nativeProtocols = { 'capacitor:': true, 'ionic:': true };
    var isCapacitorLocalhost = window.location.hostname === 'localhost' && window.location.protocol === 'https:';
    var hasCapacitorBridge = Boolean(
        window.Capacitor &&
        typeof window.Capacitor.isNativePlatform === 'function' &&
        window.Capacitor.isNativePlatform()
    );
    var isNativeApp = Boolean(nativeProtocols[window.location.protocol] || isCapacitorLocalhost || hasCapacitorBridge);
    var nativeThemePreview = false;

    try {
        nativeThemePreview = new URLSearchParams(window.location.search).has('nativeTheme');
    } catch (_) { }

    var shouldUseNativeTheme = isNativeApp || nativeThemePreview;

    window.NOVASTORE_API_ORIGIN = isNativeApp ? PRODUCTION_ORIGIN : '';
    window.NOVASTORE_IS_NATIVE_APP = isNativeApp;
    window.NOVASTORE_USE_NATIVE_THEME = shouldUseNativeTheme;

    function shouldShowNativeSplash() {
        if (!shouldUseNativeTheme) return false;
        if (/admin/i.test(window.location.pathname || '')) return false;

        try {
            if (sessionStorage.getItem('nova_native_splash_seen')) return false;
            sessionStorage.setItem('nova_native_splash_seen', '1');
        } catch (_) { }

        return true;
    }

    function showNativeSplash() {
        if (!shouldShowNativeSplash() || !document.body || document.querySelector('.nova-native-splash')) return;

        var splash = document.createElement('div');
        splash.className = 'nova-native-splash';
        splash.innerHTML = [
            '<div class="nova-native-splash-card">',
            '<div class="nova-native-splash-logo"><img src="novastore-logo.png" alt="NovaStore"></div>',
            '<div class="nova-native-splash-wordmark">Nova<span>Store</span></div>',
            '<div class="nova-native-splash-line"><i></i></div>',
            '</div>'
        ].join('');
        document.body.appendChild(splash);

        window.setTimeout(function () {
            splash.classList.add('is-leaving');
            window.setTimeout(function () {
                splash.remove();
            }, 420);
        }, 1650);
    }

    function enableNativeTheme() {
        if (!shouldUseNativeTheme) return;

        document.documentElement.classList.add('novastore-native-app-root');

        if (!document.getElementById('novastore-native-critical-style')) {
            var criticalStyle = document.createElement('style');
            criticalStyle.id = 'novastore-native-critical-style';
            criticalStyle.textContent = [
                'html.novastore-native-app-root{background:#F7F9FC;}',
                'html.novastore-native-app-root body{opacity:0;background:#F7F9FC!important;}',
                'html.novastore-native-app-root body.novastore-native-app{opacity:1;transition:opacity .12s ease;}',
                'html.novastore-native-app-root .nova-site-footer,',
                'html.novastore-native-app-root footer{display:none!important;}',
                '.nova-native-splash{position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;background:radial-gradient(circle at 50% 28%,rgba(247,148,29,.13),transparent 30%),linear-gradient(180deg,#fff 0%,#F7F9FC 100%);transition:opacity .38s ease,transform .38s ease;}',
                '.nova-native-splash.is-leaving{opacity:0;transform:scale(1.02);pointer-events:none;}',
                '.nova-native-splash-card{display:grid;justify-items:center;gap:16px;animation:novaSplashRise .72s cubic-bezier(.2,.9,.2,1) both;}',
                '.nova-native-splash-logo{width:132px;height:132px;display:grid;place-items:center;border-radius:30px;background:#fff;box-shadow:0 22px 55px rgba(15,42,67,.16);animation:novaSplashPulse 1.35s ease-in-out infinite;}',
                '.nova-native-splash-logo img{width:96px;height:96px;object-fit:contain;}',
                '.nova-native-splash-wordmark{color:#0F2A43;font:900 1.65rem/1 Inter,system-ui,sans-serif;letter-spacing:0!important;}',
                '.nova-native-splash-wordmark span{color:#F7941D;}',
                '.nova-native-splash-line{width:108px;height:4px;overflow:hidden;border-radius:999px;background:#E2E8F0;}',
                '.nova-native-splash-line i{display:block;width:46%;height:100%;border-radius:999px;background:#F7941D;animation:novaSplashLine 1s ease-in-out infinite;}',
                '@keyframes novaSplashRise{from{opacity:0;transform:translateY(18px) scale(.94)}to{opacity:1;transform:translateY(0) scale(1)}}',
                '@keyframes novaSplashPulse{0%,100%{transform:scale(1);box-shadow:0 22px 55px rgba(15,42,67,.16)}50%{transform:scale(1.045);box-shadow:0 26px 66px rgba(247,148,29,.22)}}',
                '@keyframes novaSplashLine{0%{transform:translateX(-120%)}100%{transform:translateX(240%)}}'
            ].join('');
            document.head.appendChild(criticalStyle);
        }

        if (!document.querySelector('link[data-novastore-native-theme]')) {
            var themeLink = document.createElement('link');
            themeLink.rel = 'stylesheet';
            themeLink.href = 'mobile-app-theme.css?v=' + APP_ASSET_VERSION;
            themeLink.setAttribute('data-novastore-native-theme', 'true');
            document.head.appendChild(themeLink);
        }

        var themeColor = document.querySelector('meta[name="theme-color"]');
        if (!themeColor) {
            themeColor = document.createElement('meta');
            themeColor.setAttribute('name', 'theme-color');
            document.head.appendChild(themeColor);
        }
        themeColor.setAttribute('content', '#F7F9FC');

        document.addEventListener('DOMContentLoaded', function () {
            document.body.classList.add('novastore-native-app');
            showNativeSplash();

            if (!document.querySelector('script[data-novastore-native-shell]')) {
                var shellScript = document.createElement('script');
                shellScript.src = 'mobile-app-shell.js?v=' + APP_ASSET_VERSION;
                shellScript.defer = true;
                shellScript.setAttribute('data-novastore-native-shell', 'true');
                document.body.appendChild(shellScript);
            }
        });
    }

    enableNativeTheme();

    function nativeApiUrl(path) {
        if (!isNativeApp || typeof path !== 'string' || !path.startsWith('/api/')) {
            return path;
        }
        return PRODUCTION_ORIGIN + path;
    }

    function normalizeFetchInput(input) {
        if (!isNativeApp) return input;

        if (typeof input === 'string') {
            return nativeApiUrl(input);
        }

        if (typeof Request !== 'undefined' && input instanceof Request) {
            var url = new URL(input.url);
            if (url.origin === window.location.origin && url.pathname.startsWith('/api/')) {
                return new Request(PRODUCTION_ORIGIN + url.pathname + url.search, input);
            }
        }

        return input;
    }

    if (window.fetch) {
        var originalFetch = window.fetch.bind(window);
        window.fetch = function (input, init) {
            return originalFetch(normalizeFetchInput(input), init);
        };
    }

    function wrapSocketIo(ioClient) {
        if (typeof ioClient !== 'function' || ioClient.__novaWrapped) {
            return ioClient;
        }

        var wrapped = function (url, options) {
            if (isNativeApp && (url === undefined || url === null || url === '')) {
                return ioClient(PRODUCTION_ORIGIN, options);
            }
            return ioClient(url, options);
        };

        Object.keys(ioClient).forEach(function (key) {
            wrapped[key] = ioClient[key];
        });

        wrapped.__novaWrapped = true;
        return wrapped;
    }

    var currentIo;
    Object.defineProperty(window, 'io', {
        configurable: true,
        get: function () {
            return currentIo;
        },
        set: function (value) {
            currentIo = wrapSocketIo(value);
        }
    });

    if (isNativeApp) {
        document.write('<script src="' + PRODUCTION_ORIGIN + '/socket.io/socket.io.js"><\/script>');
    }
}());
