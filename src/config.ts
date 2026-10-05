// Uygulama yapılandırması. Yayına almadan önce LEGAL alanlarını doldurmalısın (bkz. docs/YASAL.md).

export const APP_VERSION = '8.1.0';

/** Veri sorumlusu ve iletişim bilgileri (KVKK aydınlatma metni ve 5651 kimlik bildirimi için). */
export const LEGAL = {
    /** Gerçek kişi adı soyadı ya da şirket unvanı. */
    controller: '[Veri sorumlusunun adı / unvanı]',
    /** Tebligata elverişli adres. */
    address: '[Adres]',
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
    updatedAt: '2026-10-05'
};

/**
 * Reklam ayarları. Varsayılan olarak tamamen kapalı.
 * Açılsa bile: alkol, tütün, kumar ve bahis kategorileri engellenir; her reklam "Reklam" etiketiyle gösterilir;
 * kişiselleştirilmiş reklam yalnızca kullanıcının açık rızasıyla yapılır.
 */
export const ADS = {
    enabled: false,
    blockedCategories: ['alkol', 'tutun', 'elektronik-sigara', 'kumar', 'bahis'] as readonly string[],
    /** Akış ve sıralama listelerinde kaç öğede bir reklam alanı. */
    every: 6
};
