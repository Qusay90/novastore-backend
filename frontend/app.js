let allProducts = [];

// Kullanıcıya özel localStorage anahtarı
function _getCartKey() {
    try {
        const info = JSON.parse(localStorage.getItem('nova_user_info'));
        const uid = info && info.id ? info.id : 'guest';
        return `novastore_cart_${uid}`;
    } catch (e) { return 'novastore_cart_guest'; }
}

let cart = JSON.parse(localStorage.getItem(_getCartKey())) || [];

document.addEventListener('DOMContentLoaded', () => {
    fetchProducts();
    updateCartUI(); // Sayfa açılır açılmaz sepet ikonundaki sayıyı güncelle
});

// Ürünleri Çekme
async function fetchProducts() {
    try {
        const response = await fetch('/api/products');
        allProducts = await response.json();
        renderProducts(allProducts);
    } catch (error) {
        console.error('Hata:', error);
        document.getElementById('product-list').innerHTML = '<p>Ürünler yüklenemedi.</p>';
    }
}

// Ürünleri Ekrana Basma
function renderProducts(products) {
    const productList = document.getElementById('product-list');
    productList.innerHTML = '';

    products.forEach(product => {
        const productCard = document.createElement('div');
        productCard.className = 'product-card';
        productCard.innerHTML = `
            <div class="product-image">
                <img src="${product.image_url}" alt="${product.name}">
            </div>
            <div class="product-info">
                <h3>${product.name}</h3>
                <div class="price">${product.price} TL</div>
                <button class="btn btn-secondary add-to-cart" onclick="addToCart(${product.id})">Sepete Ekle</button>
            </div>
        `;
        productList.appendChild(productCard);
    });
}

// 🛒 SEPETE ÜRÜN EKLEME FONKSİYONU
function addToCart(productId) {
    const productToAdd = allProducts.find(p => p.id === productId);
    const existingItem = cart.find(item => item.id === productId);

    if (existingItem) {
        existingItem.quantity += 1;
    } else {
        cart.push({
            id: productToAdd.id,
            name: productToAdd.name,
            price: productToAdd.price,
            image: productToAdd.image_url || '',
            old_price: productToAdd.old_price || null,
            quantity: 1
        });
    }

    localStorage.setItem(_getCartKey(), JSON.stringify(cart));
    updateCartUI();
    toggleCart();
}

// 🗑️ SEPETTEN ÜRÜN SİLME
function removeFromCart(productId) {
    cart = cart.filter(item => item.id !== productId);
    localStorage.setItem(_getCartKey(), JSON.stringify(cart));
    updateCartUI();
}

// 🔄 SEPET ARAYÜZÜNÜ VE TOPLAM FİYATI GÜNCELLEME
function updateCartUI() {
    const cartItemsContainer = document.getElementById('cart-items');
    const cartCount = document.getElementById('cart-count');
    const cartTotalPrice = document.getElementById('cart-total-price');

    if (cartItemsContainer) cartItemsContainer.innerHTML = ''; // İçini temizle
    let total = 0;
    let totalItems = 0;
    let selectedItemsCount = 0;

    if (cart.length === 0) {
        if (cartItemsContainer) {
            cartItemsContainer.innerHTML = `
                <div class="cart-empty-msg" style="text-align: center; color: #888; margin-top: 60px; font-size: 1.1rem; line-height: 1.6;">
                    <span style="font-size: 3rem; display:block; margin-bottom:15px;">🛒</span>
                    Sepetiniz şu an bomboş.<br>Hemen ürün eklemeye başlayın!
                </div>`;
        }
        if (cartTotalPrice) cartTotalPrice.innerText = "0.00 TL";
        if (cartCount) cartCount.innerText = "0";
        return;
    }

    cart.forEach((item, index) => {
        const itemTotal = item.price * item.quantity;
        totalItems += item.quantity;
        let isChecked = item.selected !== false;
        if (isChecked) {
            total += itemTotal;
            selectedItemsCount += item.quantity;
        }

        if (cartItemsContainer) {
            const imageUrl = item.image || item.image_url || 'https://via.placeholder.com/80?text=Görsel+Yok';
            let priceSectionHtml = '';
            if (item.old_price && parseFloat(item.old_price) > parseFloat(item.price)) {
                const discountRate = Math.round(((parseFloat(item.old_price) - parseFloat(item.price)) / parseFloat(item.old_price)) * 100);
                priceSectionHtml = `
                    <div style="display: flex; align-items: center; background: #FAFAFA; border: 1px solid #EAEAEA; border-radius: 8px; padding: 6px 10px; margin-top: 8px; gap: 12px; width: fit-content;">
                        <div style="color: #00897B; font-size: 0.75rem; font-weight: 700; line-height: 1.2; text-align: center;">
                            Sepete<br>Özel
                        </div>
                        <div style="width: 1px; height: 32px; background: #EAEAEA;"></div>
                        <div style="display: flex; flex-direction: column; gap: 2px;">
                            <div style="display: flex; align-items: center; gap: 6px; line-height: 1;">
                                <span style="color: #888; text-decoration: line-through; font-size: 0.75rem;">${parseFloat(item.old_price).toFixed(2)} TL</span>
                                <span style="background: #00897B; color: white; padding: 2px 5px; border-radius: 4px; font-weight: bold; font-size: 0.7rem;">%${discountRate}</span>
                            </div>
                            <div style="color: #00897B; font-weight: 800; font-size: 1.1rem; line-height: 1;">
                                ${parseFloat(item.price).toFixed(2)} <span style="font-size: 0.8rem; font-weight: 600;">TL</span>
                            </div>
                        </div>
                    </div>
                `;
            } else {
                priceSectionHtml = `
                    <div style="display: flex; align-items: center; background: #FAFAFA; border: 1px solid #EAEAEA; border-radius: 8px; padding: 6px 10px; margin-top: 8px; width: fit-content;">
                        <div style="color: #0F2A43; font-weight: 800; font-size: 1.1rem; line-height: 1;">
                            ${parseFloat(item.price).toFixed(2)} <span style="font-size: 0.8rem; font-weight: 600;">TL</span>
                        </div>
                    </div>
                `;
            }

            cartItemsContainer.innerHTML += `
                <div class="cart-item" style="display: flex; align-items: center; gap: 15px; padding: 15px; background: #fff; border: 1px solid #EAEAEA; border-radius: 12px; margin-bottom: 15px; box-shadow: 0 4px 10px rgba(0,0,0,0.02);">
                    <input type="checkbox" class="cart-item-checkbox" ${isChecked ? 'checked' : ''} onchange="toggleCartItemSelection(${index})" style="width: 20px; height: 20px; cursor: pointer; accent-color: #00897B; flex-shrink: 0;">
                    
                    <img src="${imageUrl}" alt="${item.name}" style="width: 70px; height: 70px; object-fit: cover; border-radius: 8px; flex-shrink: 0; border: 1px solid #F0F0F0;">
                    
                    <div class="cart-item-info" style="flex-grow: 1; display: flex; flex-direction: column; justify-content: center; min-width: 0;">
                        <span class="cart-item-title" style="font-weight: 600; color: #333; font-size: 0.95rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${item.name}">${item.name}</span>
                        ${priceSectionHtml}
                    </div>

                    <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 10px; flex-shrink: 0;">
                        <button class="remove-item" onclick="removeFromCart(${item.id})" title="Ürünü Sil" style="background: #FFF0F0; color: #E53935; border: none; padding: 6px; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: 0.2s;">
                            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                        </button>
                        
                        <div style="display: flex; align-items: center; background: #F8F9FA; border: 1px solid #EAEAEA; border-radius: 6px; overflow: hidden;">
                            <button onclick="updateCartQuantity(${index}, -1)" style="border: none; background: transparent; cursor: pointer; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; font-size: 1.2rem; color: #555; transition: 0.2s;">-</button>
                            <span style="font-weight: 600; font-size: 0.95rem; width: 24px; text-align: center; color: #333;">${item.quantity}</span>
                            <button onclick="updateCartQuantity(${index}, 1)" style="border: none; background: transparent; cursor: pointer; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; font-size: 1.1rem; color: #555; transition: 0.2s;">+</button>
                        </div>
                    </div>
                </div>
            `;
        }
    });

    if (cartCount) cartCount.innerText = totalItems;
    if (cartTotalPrice) cartTotalPrice.innerText = total.toFixed(2) + ' TL';
}

function updateCartQuantity(index, change) {
    if (cart[index]) {
        cart[index].quantity += change;
        if (cart[index].quantity <= 0) {
            cart[index].quantity = 1;
        }
        localStorage.setItem(_getCartKey(), JSON.stringify(cart));
        updateCartUI();
    }
}

function toggleCartItemSelection(index) {
    if (cart[index].selected === undefined) {
        cart[index].selected = false;
    } else {
        cart[index].selected = !cart[index].selected;
    }
    localStorage.setItem(_getCartKey(), JSON.stringify(cart));
    updateCartUI();
}

// 🎚️ SEPET MENÜSÜNÜ AÇIP KAPATMA
function toggleCart() {
    document.getElementById('cart-sidebar').classList.toggle('open');
    document.getElementById('cart-overlay').classList.toggle('show');
}

// 💳 ÖDEME SAYFASINA YÖNLENDİRME
function goToCheckout() {
    if (cart.length === 0) {
        alert("Sepetiniz boş, önce ürün ekleyin!");
        return;
    }
    window.location.href = "checkout.html"; // Ödeme sayfasına yönlendir
}


