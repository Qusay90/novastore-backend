package com.novastore.app.core.navigation

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class CustomerVisualManifestTest {
    @Test
    fun manifestCoversAllReferencesAndUniqueScreens() {
        val references = CustomerVisualManifest.references

        assertEquals(80, references.size)
        assertEquals(80, references.map { it.referenceFile }.toSet().size)
        assertEquals(77, references.map { it.screenId }.toSet().size)
        assertEquals(77, references.map { it.referenceSha256 }.toSet().size)
        assertEquals(emptyList<String>(), CustomerVisualManifest.validationErrors)

        assertEquals(
            mapOf(2 to 2, 3 to 10, 4 to 7, 5 to 7, 6 to 7, 7 to 8, 8 to 7, 9 to 5, 10 to 11, 11 to 10, 12 to 6),
            references.groupingBy { it.tour }.eachCount().toSortedMap()
        )
    }

    @Test
    fun manifestContainsTheExactPhysicalFilenames() {
        val expected = setOf(
            "giriş kayıt ol kısmı.png", "hesabım kısmı.png",
            "Giriş, kayıt ve şifre sıfırlama.png", "Hesap Oluştur.png", "Kayıt tamamlandı.png",
            "E-posta doğrulama.png", "Telefon doğrulama.png", "Şifremi Unuttum.png",
            "Şifre sıfırlama kodu.png", "Yeni şifre oluşturma.png", "Şifre değiştirildi.png",
            "İki adımlı doğrulamayla giriş.png", "Anasayfa teması.png", "kategoriler kısmı.jpg",
            "favori kısmı.png", "ürün kartı tasarımı.png", "arama kısmı 1.png", "arama kısmı 2.png",
            "bildirim kısmı.png", "Ayarlar ve profil düzenleme.png", "Profilimi Düzenle.png",
            "Profil fotoğrafı işlemleri.png", "E-posta adresini değiştirme.png",
            "Telefon numarasını güvenli biçimde değiştirme.png",
            "Giriş yapılmış hesaptan şifre değiştirme.png", "Çıkış yapma onayı.png",
            "Adres yönetimi.png", "Yeni adres ekleme.png", "Adresi düzenleme.png",
            "Adres silme onayı.png", "adres ekleme 1.png", "adres ekleme 2.png", "adres seçimi.png",
            "Siparişlerim listesi.png", "Sipariş detayı.png", "Kargo takibi.png", "E-Arşiv fatura.png",
            "Sipariş iptali.png", "Sipariş iptal edildi.png", "ade talebi oluşturma.png",
            "İade ve geri ödeme takibi.png", "Kayıtlı ödeme yöntemleri.png", "Yeni kart ekleme.png",
            "Kart doğrulama başarı durumu.png", "Kart işlemleri.png", "Kupon merkezi.png",
            "Kupon detayı.png", "ödeme ekranı.png", "Değerlendirme merkezi.png",
            "Değerlendirme yazma.png", "Yayınlanan değerlendirme detayı.png",
            "Satıcıya sorulan sorular.png", "Soru ve satıcı yanıtı detayı.png",
            "Yardım, NovaBot, canlı destek ve SSS.png", "NovaBot sohbet.png", "novabot chat.png",
            "Canlı desteğe bağlanmış sohbet.png", "canlı destek chat.png", "Geçmiş sohbetler.png",
            "geçmiş chat.png", "Geçmiş görüşme detayı.png", "Destek görüşmesini puanlama.png",
            "Sıkça Sorulan Sorular merkezi.png", "SSS makale detayı.png",
            "Gizlilik ve Güvenlik merkezi.png", "Aktif cihazlar ve oturumlar.png",
            "İki adımlı doğrulama yöntemi.png", "Doğrulama uygulaması ve QR kurulumu.png",
            "Kurtarma kodları.png", "Gizlilik ve izinler.png", "Verilerimin kopyasını isteme.png",
            "Hesabı silme bilgilendirmesi.png", "Hesabı kalıcı silme son onayı.png",
            "Gizlilik politikası belge görüntüleyici.png", "Bildirim ve uygulama tercihleri.png",
            "Sessiz saatler.png", "Dil ve bölge.png", "Görünüm ve erişilebilirlik.png",
            "İzinler ve veri kullanımı.png", "Hakkında ve yasal.png"
        )

        assertEquals(expected, CustomerVisualManifest.references.map { it.referenceFile }.toSet())
    }

    @Test
    fun onlyTheThreeByteIdenticalPairsShareScreenIdsAndHashes() {
        val references = CustomerVisualManifest.references
        val duplicateFilesByScreen = references.groupBy { it.screenId }
            .filterValues { it.size > 1 }
            .mapValues { (_, values) -> values.map { it.referenceFile }.toSet() }
        val duplicateFilesByHash = references.groupBy { it.referenceSha256 }
            .filterValues { it.size > 1 }
            .mapValues { (_, values) -> values.map { it.referenceFile }.toSet() }
            .values
            .toSet()
        val expectedPairs = setOf(
            setOf("Canlı desteğe bağlanmış sohbet.png", "canlı destek chat.png"),
            setOf("Geçmiş sohbetler.png", "geçmiş chat.png"),
            setOf("NovaBot sohbet.png", "novabot chat.png")
        )

        assertEquals(expectedPairs, duplicateFilesByScreen.values.toSet())
        assertEquals(expectedPairs, duplicateFilesByHash)
        assertEquals(3, duplicateFilesByScreen.size)
    }

    @Test
    fun referenceSpecificEdgeCasesRemainExact() {
        val categories = CustomerVisualManifest.references.single { it.referenceFile == "kategoriler kısmı.jpg" }
        val returnRequest = CustomerVisualManifest.references.single { it.referenceFile == "ade talebi oluşturma.png" }

        assertEquals(740, categories.referenceWidth)
        assertEquals(1600, categories.referenceHeight)
        assertEquals(852, returnRequest.referenceWidth)
        assertEquals(1846, returnRequest.referenceHeight)
        assertTrue(CustomerVisualManifest.references.all { it.variant.isNotBlank() })
    }
}
