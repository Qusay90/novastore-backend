const pool = require('../config/db');

const seedProducts = async () => {
    const products = [
        {
            name: 'Premium Akıllı Saat',
            description: 'NovaStore özel serisi, nabız ölçer ve su geçirmez akıllı saat.',
            price: 2499.00,
            stock: 50,
            image_url: 'https://images.unsplash.com/photo-1546868871-7041f2a55e12?q=80&w=400&auto=format&fit=crop'
        },
        {
            name: 'Gürültü Engelleyici Kulaklık',
            description: 'Müziğin keyfini çıkarın. Aktif gürültü engelleme teknolojisi.',
            price: 3250.00,
            stock: 30,
            image_url: 'https://images.unsplash.com/photo-1618366712010-f4ae9c647dcb?q=80&w=400&auto=format&fit=crop'
        },
        {
            name: 'Deri Tasarım Çanta',
            description: 'El yapımı, %100 hakiki deri şık omuz çantası.',
            price: 1850.00,
            stock: 15,
            image_url: 'https://images.unsplash.com/photo-1584916201218-f4242ceb4809?q=80&w=400&auto=format&fit=crop'
        },
        {
            name: 'UV Korumalı Gözlük',
            description: 'Yaz aylarının vazgeçilmezi, polarize camlı güneş gözlüğü.',
            price: 950.00,
            stock: 100,
            image_url: 'https://images.unsplash.com/photo-1495474472204-518605696190?q=80&w=400&auto=format&fit=crop'
        },
        {
            name: 'Kahve Makinesi (Nova Edition)',
            description: 'Güne enerjik başlamak isteyenler için profesyonel espresso makinesi.',
            price: 4500.00,
            stock: 10,
            image_url: 'https://images.unsplash.com/photo-1568644396922-5c3bfae12521?q=80&w=400&auto=format&fit=crop'
        }
    ];

    try {
        console.log("⏳ Ürünler Supabase veritabanına ekleniyor...");
        for (let product of products) {
            await pool.query(
                'INSERT INTO products (name, description, price, stock, image_url) VALUES ($1, $2, $3, $4, $5)',
                [product.name, product.description, product.price, product.stock, product.image_url]
            );
        }
        console.log("🛍️ Ürünler başarıyla raflara dizildi!");
    } catch (err) {
        console.error("❌ Hata oluştu:", err);
    } finally {
        pool.end();
    }
};

seedProducts();