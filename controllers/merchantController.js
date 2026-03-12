const pool = require('../config/db');
const { getAppBaseUrl } = require('../config/appConfig');

const xmlEscape = (value = '') =>
    String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');

const buildProductUrl = (productId) => {
    const base = getAppBaseUrl();
    return `${base}/product.html?id=${productId}`;
};

const buildImageUrl = (product) => {
    return product.image_url || 'https://via.placeholder.com/600x600?text=NovaStore';
};

const getMerchantFeed = async (req, res) => {
    try {
        const productsResult = await pool.query(
            `SELECT id, name, description, price, stock, category, image_url, created_at
             FROM products
             ORDER BY created_at DESC`
        );

        const itemsXml = productsResult.rows
            .map((p) => {
                const availability = Number(p.stock || 0) > 0 ? 'in stock' : 'out of stock';
                return `
    <item>
      <g:id>${p.id}</g:id>
      <title>${xmlEscape(p.name)}</title>
      <description>${xmlEscape(p.description || p.name)}</description>
      <link>${xmlEscape(buildProductUrl(p.id))}</link>
      <g:image_link>${xmlEscape(buildImageUrl(p))}</g:image_link>
      <g:availability>${availability}</g:availability>
      <g:price>${Number(p.price).toFixed(2)} TRY</g:price>
      <g:condition>new</g:condition>
      <g:brand>NovaStore</g:brand>
      <g:google_product_category>${xmlEscape(p.category || 'Elektronik')}</g:google_product_category>
    </item>`;
            })
            .join('\n');

        const xml = `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>NovaStore Product Feed</title>
    <link>${xmlEscape(getAppBaseUrl())}</link>
    <description>NovaStore Google Merchant urun feed'i</description>
${itemsXml}
  </channel>
</rss>`;

        res.set('Content-Type', 'application/xml; charset=utf-8');
        res.status(200).send(xml);
    } catch (err) {
        console.error('Merchant feed hatasi:', err.message);
        res.status(500).json({ error: 'Merchant feed olusturulamadi.' });
    }
};

module.exports = {
    getMerchantFeed
};
