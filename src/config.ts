// Uygulama yapılandırması. Yasal alanların anlamı ve riskleri için bkz. docs/YASAL.md.

export const APP_VERSION = '8.1.0';

/** Veri sorumlusu ve iletişim bilgileri (KVKK aydınlatma metni). */
export const LEGAL = {
    /**
     * Veri sorumlusunun adı ya da şirket unvanı. Boşsa metinlerde kişisel ad ve adres gösterilmez; veri sorumlusu
     * "Pub Skor'u geliştiren ve işleten kişi" olarak anılır, kimlik bilgisi yalnızca başvuru yanıtında ve yetkili
     * makamlara bildirilir. DİKKAT: KVKK m.10 ve Aydınlatma Tebliği m.5 aydınlatmada veri sorumlusunun kimliğini
     * ister; boş bırakmak bu yükümlülüğü tam karşılamaz. Kişisel ad vermeden uyumlu olmanın yolu bir şirket
     * kurup buraya şirket unvanını yazmaktır (bkz. docs/YASAL.md).
     */
    controller: '',
    /** Tebligat adresi (şirket varsa şirket adresi). Boşsa gösterilmez. */
    address: '',
    /**
     * Başvuru ve şikayet kanalı: uygulama içi form (KVKK Başvuru Tebliği m.5: "başvuru amacına yönelik geliştirilmiş
     * bir yazılım ya da uygulama"). Sitede e-posta adresi yayımlanmaz; kayıtlar Netlify Forms panelinde görülür.
     */
    contact: '/iletisim',
    /** İletişim formu kayıtlarının saklama süresi. */
    contactRetention: 'başvurunun sonuçlanmasından itibaren 2 yıl',
    /** Kayıtlı elektronik posta (varsa). */
    kep: '',
    /** Sunucu ve veritabanı sağlayıcısı (yurt dışı aktarım bilgisi için). */
    hosting: 'Netlify, Inc. (ABD)',
    /** Metinlerin son güncellenme tarihi. */
    updatedAt: '2026-10-06'
};

/**
 * Reklam ayarları. Varsayılan olarak tamamen kapalı.
 * Açılsa bile: alkol, tütün, kumar ve bahis kategorileri engellenir; her reklam "Reklam" etiketiyle gösterilir;
 * kişiselleştirilmiş reklam yalnızca kullanıcının açık rızasıyla yapılır.
 */
export const ADS = {
    /**
     * Reklam açılırsa hizmet ticari olur: 5651 s. Kanun ve Yönetmelik m.5 uyarınca ticari içerik sağlayıcı kimlik,
     * adres ve iletişim bilgilerini yayımlamak zorundadır. Bu yüzden LEGAL.controller boşken reklam açılamaz (testle denetlenir).
     */
    enabled: false,
    blockedCategories: ['alkol', 'tutun', 'elektronik-sigara', 'kumar', 'bahis'] as readonly string[],
    /** Akış ve sıralama listelerinde kaç öğede bir reklam alanı. */
    every: 6
};
