def process_files():
    with open('c:/Users/kusay/OneDrive/Desktop/NovaStore-App/frontend/index.html', 'r', encoding='utf-8') as f:
        text = f.read()

    # Extract CSS
    css_start = text.find('        /* --- KUSURSUZ YANDAN KAYAN SEPET --- */')
    css_end = text.find('</style>', css_start)
    css_content = text[css_start:css_end]

    # Extract HTML
    html_start = text.find('    <div class="cart-overlay" id="cart-overlay" onclick="closeCart()"></div>')
    html_end = text.find('</nav>', html_start) + len('</nav>')
    html_content = text[html_start:html_end]

    # Extract JS
    js_start = text.find('        // --- 1. KULLANICI KİMLİK KONTROLÜ ---')
    js_end = text.find('        // --- 3. ÜRÜNLERİ VİTRİNE DİZME ---', js_start)
    js_content = text[js_start:js_end]

    def update_file(filepath):
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()

        if 'KUSURSUZ YANDAN KAYAN SEPET' not in content:
            content = content.replace('</style>', css_content + '\n    </style>')

        html_target_start = content.find('    <header>')
        html_target_end = content.find('</header>', html_target_start) + len('</header>')
        
        # Check if already replaced
        if html_target_start != -1 and 'cart-overlay' not in content:
            content = content[:html_target_start] + html_content + content[html_target_end:]

        if 'KULLANICI KİMLİK KONTROLÜ' not in content:
            script_start = content.find('    <script>') + len('    <script>\n')
            content = content[:script_start] + js_content + content[script_start:]

        if 'fetchNavigationCategories();' not in content:
            # We want to add checkUserStatus, renderCartUI, fetchNavigationCategories call
            end_script = content.find('    </script>')
            init_code = """
        document.addEventListener('DOMContentLoaded', () => {
            checkUserStatus();
            if(typeof renderCartUI === 'function') renderCartUI();
            fetchNavigationCategories();
        });
"""
            content = content[:end_script] + init_code + content[end_script:]

        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)

    update_file('c:/Users/kusay/OneDrive/Desktop/NovaStore-App/frontend/product.html')
    update_file('c:/Users/kusay/OneDrive/Desktop/NovaStore-App/frontend/profile.html')

process_files()
print("Slices extracted and updated.")
