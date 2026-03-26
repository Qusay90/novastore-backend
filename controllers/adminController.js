const pool = require('../config/db');
const { ORDER_STATUS } = require('../constants/orderStatus');

const CONVERSION_EXCLUDED_STATUSES = [ORDER_STATUS.IPTAL_EDILDI];
const SALES_EXCLUDED_STATUSES = [ORDER_STATUS.IPTAL_EDILDI, ORDER_STATUS.IADE_EDILDI];

const clampAnalyticsDays = (rawValue) => {
    const parsed = Number.parseInt(rawValue, 10);
    if (!Number.isInteger(parsed)) return 30;
    return Math.min(Math.max(parsed, 1), 90);
};

const toSafeNumber = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const compareAnalyticsNames = (left, right) => String(left?.name || '').localeCompare(String(right?.name || ''), 'tr');

const buildRecommendationPack = ({ overview, topViewedProducts, topSellingProducts, lingerProducts, topAddToCartProducts }) => {
    const recommendations = [];
    const bestSeller = topSellingProducts[0] || null;
    const bestViewed = topViewedProducts[0] || null;
    const bestLinger = lingerProducts[0] || null;
    const bestCarted = topAddToCartProducts[0] || null;

    if (bestSeller) {
        recommendations.push({
            title: 'Satis liderini vitrine tasi',
            tone: 'growth',
            detail: `${bestSeller.name} son donemde ${bestSeller.unitsSold} adet satti ve ${bestSeller.orderCount} sipariste yer aldi.`,
            action: 'Ana sayfa hero alaninda, kategori ustunde ve kampanya bannerlarinda bu urunu one cikarin.'
        });
    }

    if (bestCarted && (!bestSeller || bestCarted.id !== bestSeller.id)) {
        recommendations.push({
            title: 'Sepete en cok giren urunu takip et',
            tone: 'insight',
            detail: `${bestCarted.name} ${bestCarted.addToCartCount} kez sepete eklendi ve ${bestCarted.uniqueSessions} farkli oturumda ilgi gordu.`,
            action: 'Bu urunun fiyat, stok guveni ve teslimat bilgisini daha gorunur yaparak siparise gecisi hizlandirin.'
        });
    }

    const lowConversionInterest = topViewedProducts.find((product) => {
        const views = toSafeNumber(product.views);
        const orderCount = toSafeNumber(product.orderCount);
        return views >= 8 && orderCount <= Math.max(1, Math.floor(views / 12));
    });

    if (lowConversionInterest) {
        recommendations.push({
            title: 'Yuksek ilgi var ama siparis dusuk',
            tone: 'warning',
            detail: `${lowConversionInterest.name} ${lowConversionInterest.views} kez incelendi ama siparise donusmesi zayif kaldi.`,
            action: 'Fiyat avantaji, yorumlar, teslimat vaadi ve urun faydasini daha net gosteren bloklar ekleyin.'
        });
    }

    const highCartLowOrder = topAddToCartProducts.find((product) => {
        const addToCartCount = toSafeNumber(product.addToCartCount);
        const orderCount = toSafeNumber(product.orderCount);
        return addToCartCount >= 3 && orderCount <= Math.max(1, Math.floor(addToCartCount / 4));
    });

    if (highCartLowOrder) {
        recommendations.push({
            title: 'Sepete giriyor ama satisa donmuyor',
            tone: 'warning',
            detail: `${highCartLowOrder.name} ${highCartLowOrder.addToCartCount} kez sepete eklendi fakat siparise donusmesi sinirli kaldi.`,
            action: 'Sepet adiminda bu urune kupon, capraz satis veya guven rozetleri ekleyerek terk oranini azaltin.'
        });
    }

    if (bestLinger && (!bestSeller || bestLinger.id !== bestSeller.id)) {
        recommendations.push({
            title: 'Kararsizlik yaratan urunu aciklayin',
            tone: 'insight',
            detail: `${bestLinger.name} uzerinde ortalama ${Math.round(toSafeNumber(bestLinger.avgDurationSeconds))} saniye geciriliyor.`,
            action: 'Bu urune karsilastirma tablosu, sik sorulan sorular ve kisa video/demo eklemek donusumu arttirabilir.'
        });
    }

    if (toSafeNumber(overview.conversionRate) < 3 && toSafeNumber(overview.totalSessions) >= 20) {
        recommendations.push({
            title: 'Genel donusum hizi iyilestirilebilir',
            tone: 'warning',
            detail: `Donusum orani su an %${toSafeNumber(overview.conversionRate).toFixed(1)} seviyesinde.`,
            action: 'Checkout oncesi guven unsurlari, kupon tetikleyicileri ve yeniden hedefleme mesajlari test edin.'
        });
    }

    if (toSafeNumber(overview.avgSessionSeconds) < 75 && toSafeNumber(overview.totalSessions) >= 15) {
        recommendations.push({
            title: 'Oturum suresi kisa kaliyor',
            tone: 'warning',
            detail: `Ziyaretciler sitede ortalama ${Math.round(toSafeNumber(overview.avgSessionSeconds))} saniye kaliyor.`,
            action: 'Acilis sayfasinda kategori yonlendirmelerini guclendirin ve daha hizli urun kesfi saglayin.'
        });
    }

    if (recommendations.length === 0) {
        recommendations.push({
            title: 'Veri saglikli gorunuyor',
            tone: 'growth',
            detail: 'Ilgi ve satis dagilimi dengeli ilerliyor, bariz bir sorun sinyali yok.',
            action: 'En cok satan ve en cok incelenen urunleri donemsel kampanyalarda birlikte kullanarak momentumu koruyun.'
        });
    }

    return {
        bestSeller: bestSeller
            ? {
                id: bestSeller.id,
                name: bestSeller.name,
                unitsSold: toSafeNumber(bestSeller.unitsSold)
            }
            : null,
        bestViewed: bestViewed
            ? {
                id: bestViewed.id,
                name: bestViewed.name,
                views: toSafeNumber(bestViewed.views)
            }
            : null,
        bestLinger: bestLinger
            ? {
                id: bestLinger.id,
                name: bestLinger.name,
                avgDurationSeconds: toSafeNumber(bestLinger.avgDurationSeconds)
            }
            : null,
        bestCarted: bestCarted
            ? {
                id: bestCarted.id,
                name: bestCarted.name,
                addToCartCount: toSafeNumber(bestCarted.addToCartCount)
            }
            : null,
        recommendations: recommendations.slice(0, 5)
    };
};

const getDashboardStats = async (req, res) => {
    try {
        const revenueResult = await pool.query(
            'SELECT COALESCE(SUM(total_amount), 0) AS total_revenue FROM orders WHERE status != $1',
            [ORDER_STATUS.IPTAL_EDILDI]
        );

        const ordersCountResult = await pool.query('SELECT COUNT(*) AS total_orders FROM orders');
        const productsCountResult = await pool.query('SELECT COUNT(*) AS total_products FROM products');
        const usersCountResult = await pool.query("SELECT COUNT(*) AS total_users FROM users WHERE role = 'customer'");

        res.status(200).json({
            totalRevenue: parseFloat(revenueResult.rows[0].total_revenue).toFixed(2),
            totalOrders: parseInt(ordersCountResult.rows[0].total_orders, 10),
            totalProducts: parseInt(productsCountResult.rows[0].total_products, 10),
            totalUsers: parseInt(usersCountResult.rows[0].total_users, 10)
        });
    } catch (err) {
        console.error('Dashboard istatistik hatasi:', err.message);
        res.status(500).json({ error: 'Istatistikler getirilemedi.' });
    }
};

const getBehaviorAnalytics = async (req, res) => {
    const days = clampAnalyticsDays(req.query.days);
    const trendDays = Math.min(days, 14);
    const intervalSql = "($1::text || ' days')::interval";

    try {
        const overviewPromise = pool.query(
            `
                WITH session_rollup AS (
                    SELECT
                        vs.session_key,
                        vs.visitor_key,
                        COALESCE(SUM(pv.duration_seconds), 0)::INT AS total_duration_seconds,
                        COUNT(pv.id)::INT AS page_view_count
                    FROM visitor_sessions vs
                    LEFT JOIN page_visits pv ON pv.session_key = vs.session_key
                    WHERE vs.started_at >= NOW() - ${intervalSql}
                    GROUP BY vs.session_key, vs.visitor_key
                ),
                converted_sessions AS (
                    SELECT DISTINCT analytics_session_key AS session_key
                    FROM orders
                    WHERE analytics_session_key IS NOT NULL
                      AND created_at >= NOW() - ${intervalSql}
                      AND COALESCE(status, '') != ALL($2::text[])
                )
                SELECT
                    COUNT(*)::INT AS total_sessions,
                    COUNT(DISTINCT sr.visitor_key)::INT AS unique_visitors,
                    COALESCE(SUM(sr.page_view_count), 0)::INT AS total_page_views,
                    COALESCE(ROUND(AVG(sr.total_duration_seconds)::NUMERIC, 1), 0) AS avg_session_seconds,
                    COUNT(cs.session_key)::INT AS converted_sessions,
                    COALESCE(ROUND((COUNT(cs.session_key)::NUMERIC / NULLIF(COUNT(*), 0)) * 100, 1), 0) AS conversion_rate
                FROM session_rollup sr
                LEFT JOIN converted_sessions cs ON cs.session_key = sr.session_key
            `,
            [days, CONVERSION_EXCLUDED_STATUSES]
        );

        const productBehaviorPromise = pool.query(
            `
                WITH product_view_stats AS (
                    SELECT
                        p.id,
                        p.name,
                        COUNT(*)::INT AS views,
                        COUNT(DISTINCT pv.session_key)::INT AS unique_sessions,
                        COALESCE(SUM(pv.duration_seconds), 0)::INT AS total_duration_seconds,
                        COALESCE(ROUND(AVG(pv.duration_seconds)::NUMERIC, 1), 0) AS avg_duration_seconds
                    FROM page_visits pv
                    JOIN products p ON p.id = pv.product_id
                    WHERE pv.product_id IS NOT NULL
                      AND pv.entered_at >= NOW() - ${intervalSql}
                    GROUP BY p.id, p.name
                ),
                tracked_order_items AS (
                    SELECT
                        o.analytics_session_key AS session_key,
                        o.id AS order_id,
                        COALESCE(NULLIF(item->>'id', '')::INT, NULLIF(item->>'product_id', '')::INT) AS product_id
                    FROM orders o
                    CROSS JOIN LATERAL jsonb_array_elements(
                        CASE
                            WHEN jsonb_typeof(COALESCE(o.items, '[]'::jsonb)) = 'array' THEN COALESCE(o.items, '[]'::jsonb)
                            ELSE '[]'::jsonb
                        END
                    ) item
                    WHERE o.analytics_session_key IS NOT NULL
                      AND o.created_at >= NOW() - ${intervalSql}
                      AND COALESCE(o.status, '') != ALL($2::text[])
                ),
                viewed_sessions AS (
                    SELECT DISTINCT session_key, product_id
                    FROM page_visits
                    WHERE product_id IS NOT NULL
                      AND entered_at >= NOW() - ${intervalSql}
                ),
                viewed_order_stats AS (
                    SELECT
                        vs.product_id,
                        COUNT(DISTINCT toi.order_id)::INT AS order_count
                    FROM viewed_sessions vs
                    LEFT JOIN tracked_order_items toi
                        ON toi.session_key = vs.session_key
                       AND toi.product_id = vs.product_id
                    GROUP BY vs.product_id
                )
                SELECT
                    pvs.id,
                    pvs.name,
                    pvs.views,
                    pvs.unique_sessions,
                    pvs.total_duration_seconds,
                    pvs.avg_duration_seconds,
                    COALESCE(vos.order_count, 0)::INT AS order_count
                FROM product_view_stats pvs
                LEFT JOIN viewed_order_stats vos ON vos.product_id = pvs.id
                ORDER BY pvs.views DESC, pvs.total_duration_seconds DESC, pvs.name ASC
                LIMIT 50
            `,
            [days, CONVERSION_EXCLUDED_STATUSES]
        );

        const topSellingProductsPromise = pool.query(
            `
                WITH sales AS (
                    SELECT
                        o.id AS order_id,
                        COALESCE(NULLIF(item->>'id', '')::INT, NULLIF(item->>'product_id', '')::INT) AS product_id,
                        COALESCE(NULLIF(item->>'quantity', '')::INT, 1) AS quantity,
                        COALESCE(
                            NULLIF(item->>'line_total', '')::NUMERIC,
                            COALESCE(NULLIF(item->>'price', '')::NUMERIC, 0) * COALESCE(NULLIF(item->>'quantity', '')::INT, 1)
                        ) AS line_total
                    FROM orders o
                    CROSS JOIN LATERAL jsonb_array_elements(
                        CASE
                            WHEN jsonb_typeof(COALESCE(o.items, '[]'::jsonb)) = 'array' THEN COALESCE(o.items, '[]'::jsonb)
                            ELSE '[]'::jsonb
                        END
                    ) item
                    WHERE o.created_at >= NOW() - ${intervalSql}
                      AND COALESCE(o.status, '') != ALL($2::text[])
                ),
                view_stats AS (
                    SELECT
                        product_id,
                        COUNT(*)::INT AS views,
                        COALESCE(SUM(duration_seconds), 0)::INT AS total_duration_seconds,
                        COALESCE(ROUND(AVG(duration_seconds)::NUMERIC, 1), 0) AS avg_duration_seconds
                    FROM page_visits
                    WHERE product_id IS NOT NULL
                      AND entered_at >= NOW() - ${intervalSql}
                    GROUP BY product_id
                )
                SELECT
                    p.id,
                    p.name,
                    COALESCE(SUM(s.quantity), 0)::INT AS units_sold,
                    COUNT(DISTINCT s.order_id)::INT AS order_count,
                    COALESCE(ROUND(SUM(s.line_total), 2), 0) AS revenue,
                    COALESCE(vs.views, 0)::INT AS views,
                    COALESCE(vs.total_duration_seconds, 0)::INT AS total_duration_seconds,
                    COALESCE(vs.avg_duration_seconds, 0) AS avg_duration_seconds
                FROM sales s
                JOIN products p ON p.id = s.product_id
                LEFT JOIN view_stats vs ON vs.product_id = p.id
                WHERE s.product_id IS NOT NULL
                GROUP BY p.id, p.name, vs.views, vs.total_duration_seconds, vs.avg_duration_seconds
                ORDER BY units_sold DESC, revenue DESC, p.name ASC
                LIMIT 8
            `,
            [days, SALES_EXCLUDED_STATUSES]
        );

        const topAddToCartProductsPromise = pool.query(
            `
                WITH cart_stats AS (
                    SELECT
                        pa.product_id,
                        COUNT(*)::INT AS add_to_cart_count,
                        COALESCE(SUM(pa.quantity), 0)::INT AS total_quantity_added,
                        COUNT(DISTINCT pa.session_key)::INT AS unique_sessions
                    FROM product_actions pa
                    WHERE pa.product_id IS NOT NULL
                      AND pa.action_type = 'add_to_cart'
                      AND pa.created_at >= NOW() - ${intervalSql}
                    GROUP BY pa.product_id
                ),
                tracked_order_items AS (
                    SELECT
                        o.analytics_session_key AS session_key,
                        o.id AS order_id,
                        COALESCE(NULLIF(item->>'id', '')::INT, NULLIF(item->>'product_id', '')::INT) AS product_id
                    FROM orders o
                    CROSS JOIN LATERAL jsonb_array_elements(
                        CASE
                            WHEN jsonb_typeof(COALESCE(o.items, '[]'::jsonb)) = 'array' THEN COALESCE(o.items, '[]'::jsonb)
                            ELSE '[]'::jsonb
                        END
                    ) item
                    WHERE o.analytics_session_key IS NOT NULL
                      AND o.created_at >= NOW() - ${intervalSql}
                      AND COALESCE(o.status, '') != ALL($2::text[])
                ),
                cart_sessions AS (
                    SELECT DISTINCT session_key, product_id
                    FROM product_actions
                    WHERE product_id IS NOT NULL
                      AND action_type = 'add_to_cart'
                      AND created_at >= NOW() - ${intervalSql}
                ),
                cart_order_stats AS (
                    SELECT
                        cs.product_id,
                        COUNT(DISTINCT toi.order_id)::INT AS order_count,
                        COUNT(DISTINCT CASE WHEN toi.order_id IS NOT NULL THEN cs.session_key END)::INT AS converted_sessions
                    FROM cart_sessions cs
                    LEFT JOIN tracked_order_items toi
                        ON toi.session_key = cs.session_key
                       AND toi.product_id = cs.product_id
                    GROUP BY cs.product_id
                )
                SELECT
                    p.id,
                    p.name,
                    cs.add_to_cart_count,
                    cs.total_quantity_added,
                    cs.unique_sessions,
                    COALESCE(cos.order_count, 0)::INT AS order_count,
                    COALESCE(cos.converted_sessions, 0)::INT AS converted_sessions,
                    COALESCE(
                        ROUND((COALESCE(cos.converted_sessions, 0)::NUMERIC / NULLIF(cs.unique_sessions, 0)) * 100, 1),
                        0
                    ) AS cart_conversion_rate
                FROM cart_stats cs
                JOIN products p ON p.id = cs.product_id
                LEFT JOIN cart_order_stats cos ON cos.product_id = cs.product_id
                ORDER BY cs.add_to_cart_count DESC, cs.total_quantity_added DESC, p.name ASC
                LIMIT 8
            `,
            [days, CONVERSION_EXCLUDED_STATUSES]
        );

        const recentSessionsPromise = pool.query(
            `
                WITH session_rollup AS (
                    SELECT
                        vs.session_key,
                        vs.visitor_key,
                        vs.user_id,
                        vs.landing_path,
                        vs.started_at,
                        COALESCE(SUM(pv.duration_seconds), 0)::INT AS total_duration_seconds,
                        COUNT(pv.id)::INT AS page_view_count
                    FROM visitor_sessions vs
                    LEFT JOIN page_visits pv ON pv.session_key = vs.session_key
                    WHERE vs.started_at >= NOW() - ${intervalSql}
                    GROUP BY vs.session_key, vs.visitor_key, vs.user_id, vs.landing_path, vs.started_at
                )
                SELECT
                    sr.session_key,
                    sr.visitor_key,
                    sr.landing_path,
                    sr.started_at,
                    sr.total_duration_seconds,
                    sr.page_view_count,
                    COALESCE(NULLIF(TRIM(COALESCE(u.full_name, u.name, '')), ''), 'Misafir') AS visitor_name,
                    u.email AS visitor_email,
                    EXISTS(
                        SELECT 1
                        FROM orders o
                        WHERE o.analytics_session_key = sr.session_key
                          AND COALESCE(o.status, '') != ALL($2::text[])
                    ) AS converted,
                    (
                        SELECT MAX(o.id)
                        FROM orders o
                        WHERE o.analytics_session_key = sr.session_key
                          AND COALESCE(o.status, '') != ALL($2::text[])
                    ) AS order_id,
                    COALESCE(product_summary.visited_products, ARRAY[]::TEXT[]) AS visited_products
                FROM session_rollup sr
                LEFT JOIN users u ON u.id = sr.user_id
                LEFT JOIN LATERAL (
                    SELECT ARRAY_AGG(summary_line ORDER BY duration_seconds DESC, summary_line ASC) AS visited_products
                    FROM (
                        SELECT
                            CONCAT(p.name, ' (', COALESCE(SUM(pv.duration_seconds), 0)::INT, ' sn)') AS summary_line,
                            COALESCE(SUM(pv.duration_seconds), 0)::INT AS duration_seconds
                        FROM page_visits pv
                        JOIN products p ON p.id = pv.product_id
                        WHERE pv.session_key = sr.session_key
                          AND pv.product_id IS NOT NULL
                        GROUP BY p.id, p.name
                        ORDER BY duration_seconds DESC, p.name ASC
                        LIMIT 4
                    ) product_lines
                ) product_summary ON TRUE
                ORDER BY sr.started_at DESC
                LIMIT 12
            `,
            [days, CONVERSION_EXCLUDED_STATUSES]
        );

        const trendsPromise = pool.query(
            `
                WITH days AS (
                    SELECT generate_series(
                        CURRENT_DATE - (($1::INT - 1) * INTERVAL '1 day'),
                        CURRENT_DATE,
                        INTERVAL '1 day'
                    )::DATE AS day
                ),
                session_stats AS (
                    SELECT
                        started_at::DATE AS day,
                        COUNT(*)::INT AS total_sessions,
                        COUNT(DISTINCT visitor_key)::INT AS unique_visitors
                    FROM visitor_sessions
                    WHERE started_at >= CURRENT_DATE - (($1::INT - 1) * INTERVAL '1 day')
                    GROUP BY started_at::DATE
                ),
                page_view_stats AS (
                    SELECT
                        entered_at::DATE AS day,
                        COUNT(*)::INT AS total_page_views
                    FROM page_visits
                    WHERE entered_at >= CURRENT_DATE - (($1::INT - 1) * INTERVAL '1 day')
                    GROUP BY entered_at::DATE
                ),
                conversion_stats AS (
                    SELECT
                        created_at::DATE AS day,
                        COUNT(DISTINCT analytics_session_key)::INT AS converted_sessions,
                        COUNT(*)::INT AS total_orders
                    FROM orders
                    WHERE analytics_session_key IS NOT NULL
                      AND created_at >= CURRENT_DATE - (($1::INT - 1) * INTERVAL '1 day')
                      AND COALESCE(status, '') != ALL($2::text[])
                    GROUP BY created_at::DATE
                )
                SELECT
                    d.day,
                    TO_CHAR(d.day, 'DD Mon') AS label,
                    COALESCE(ss.total_sessions, 0)::INT AS total_sessions,
                    COALESCE(ss.unique_visitors, 0)::INT AS unique_visitors,
                    COALESCE(pvs.total_page_views, 0)::INT AS total_page_views,
                    COALESCE(cs.converted_sessions, 0)::INT AS converted_sessions,
                    COALESCE(cs.total_orders, 0)::INT AS total_orders
                FROM days d
                LEFT JOIN session_stats ss ON ss.day = d.day
                LEFT JOIN page_view_stats pvs ON pvs.day = d.day
                LEFT JOIN conversion_stats cs ON cs.day = d.day
                ORDER BY d.day ASC
            `,
            [trendDays, CONVERSION_EXCLUDED_STATUSES]
        );

        const [
            overviewResult,
            productBehaviorResult,
            topSellingProductsResult,
            topAddToCartProductsResult,
            recentSessionsResult,
            trendsResult
        ] = await Promise.all([
            overviewPromise,
            productBehaviorPromise,
            topSellingProductsPromise,
            topAddToCartProductsPromise,
            recentSessionsPromise,
            trendsPromise
        ]);

        const overviewRow = overviewResult.rows[0] || {};
        const overview = {
            totalSessions: toSafeNumber(overviewRow.total_sessions),
            uniqueVisitors: toSafeNumber(overviewRow.unique_visitors),
            totalPageViews: toSafeNumber(overviewRow.total_page_views),
            avgSessionSeconds: toSafeNumber(overviewRow.avg_session_seconds),
            convertedSessions: toSafeNumber(overviewRow.converted_sessions),
            conversionRate: toSafeNumber(overviewRow.conversion_rate)
        };

        const productBehaviorRows = productBehaviorResult.rows.map((row) => ({
            id: row.id,
            name: row.name,
            views: toSafeNumber(row.views),
            uniqueSessions: toSafeNumber(row.unique_sessions),
            totalDurationSeconds: toSafeNumber(row.total_duration_seconds),
            avgDurationSeconds: toSafeNumber(row.avg_duration_seconds),
            orderCount: toSafeNumber(row.order_count)
        }));

        const topProducts = [...productBehaviorRows]
            .sort((left, right) => (
                toSafeNumber(right.views) - toSafeNumber(left.views) ||
                toSafeNumber(right.totalDurationSeconds) - toSafeNumber(left.totalDurationSeconds) ||
                compareAnalyticsNames(left, right)
            ))
            .slice(0, 8);

        const lingerProducts = [...productBehaviorRows]
            .sort((left, right) => (
                toSafeNumber(right.totalDurationSeconds) - toSafeNumber(left.totalDurationSeconds) ||
                toSafeNumber(right.avgDurationSeconds) - toSafeNumber(left.avgDurationSeconds) ||
                compareAnalyticsNames(left, right)
            ))
            .slice(0, 8);

        const topSellingProducts = topSellingProductsResult.rows.map((row) => ({
            id: row.id,
            name: row.name,
            unitsSold: toSafeNumber(row.units_sold),
            orderCount: toSafeNumber(row.order_count),
            revenue: toSafeNumber(row.revenue),
            views: toSafeNumber(row.views),
            totalDurationSeconds: toSafeNumber(row.total_duration_seconds),
            avgDurationSeconds: toSafeNumber(row.avg_duration_seconds)
        }));

        const topAddToCartProducts = topAddToCartProductsResult.rows.map((row) => ({
            id: row.id,
            name: row.name,
            addToCartCount: toSafeNumber(row.add_to_cart_count),
            totalQuantityAdded: toSafeNumber(row.total_quantity_added),
            uniqueSessions: toSafeNumber(row.unique_sessions),
            orderCount: toSafeNumber(row.order_count),
            convertedSessions: toSafeNumber(row.converted_sessions),
            cartConversionRate: toSafeNumber(row.cart_conversion_rate)
        }));

        const recentSessions = recentSessionsResult.rows.map((row) => ({
            sessionKey: row.session_key,
            visitorKey: row.visitor_key,
            visitorName: row.visitor_name,
            visitorEmail: row.visitor_email,
            landingPath: row.landing_path,
            startedAt: row.started_at,
            totalDurationSeconds: toSafeNumber(row.total_duration_seconds),
            pageViewCount: toSafeNumber(row.page_view_count),
            converted: Boolean(row.converted),
            orderId: row.order_id ? Number(row.order_id) : null,
            visitedProducts: Array.isArray(row.visited_products) ? row.visited_products : []
        }));

        const trends = trendsResult.rows.map((row) => ({
            day: row.day,
            label: row.label,
            totalSessions: toSafeNumber(row.total_sessions),
            uniqueVisitors: toSafeNumber(row.unique_visitors),
            totalPageViews: toSafeNumber(row.total_page_views),
            convertedSessions: toSafeNumber(row.converted_sessions),
            totalOrders: toSafeNumber(row.total_orders)
        }));

        const insightPack = buildRecommendationPack({
            overview,
            topViewedProducts: topProducts,
            topSellingProducts,
            lingerProducts,
            topAddToCartProducts
        });

        res.status(200).json({
            days,
            trendDays,
            overview,
            trends,
            topProducts,
            topSellingProducts,
            topAddToCartProducts,
            lingerProducts,
            recentSessions,
            insights: {
                bestSeller: insightPack.bestSeller,
                bestViewed: insightPack.bestViewed,
                bestLinger: insightPack.bestLinger,
                bestCarted: insightPack.bestCarted
            },
            recommendations: insightPack.recommendations
        });
    } catch (err) {
        console.error('Davranis analitigi hatasi:', err.message);
        res.status(500).json({ error: 'Davranis analitigi getirilemedi.' });
    }
};

module.exports = {
    getDashboardStats,
    getBehaviorAnalytics
};
