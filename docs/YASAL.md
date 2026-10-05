# Pub Skor: Türkiye'de yayın için yasal değerlendirme

> **Önemli:** Bu belge bir hukuki görüş değildir. Ekim 2026 itibarıyla kamuya açık kaynaklardan derlenmiş bir ön incelemedir. Yayına almadan, özellikle de reklam gelirine geçmeden önce bilişim ve tüketici hukuku alanında çalışan bir avukata kontrol ettirin.

## Özet

| Konu | Durum | Uygulamada yapılan |
|---|---|---|
| Alkol reklam ve tanıtım yasağı (4250 s. K. m.6) | **Yüksek risk alanı.** 20 Haziran 2026 değişikliğiyle sıkılaştı. | Paylaşım görseli, PDF ve açık bağlantılarda marka adı, logo ya da sipariş listesi yok. Reklamlarda alkol kategorisi kod düzeyinde engelli. |
| KVKK (6698) | Uyum gerekli | Aydınlatma metni, açık rıza ayarları, veri dışa aktarma ve silme, saklama süreleri |
| Yurt dışına veri aktarımı (KVKK m.9) | **Aksiyon gerekli** | Sunucular ABD'de (Netlify). Standart sözleşme imzalanıp 5 iş günü içinde Kurul'a bildirilmeli. |
| Çerezler | Uyumlu | Çerez yok; yalnızca zorunlu yerel depolama var. Zorunlu olmayan araçlar açık rızaya bağlı. |
| 5651 s. Kanun | Uyum gerekli | Kimlik bilgileri `src/config.ts` dosyasından gösteriliyor. Bildirimler uygulama içi formdan (`/iletisim`) alınıyor; kişilik hakkı bildirimlerine 24 saat içinde yanıt verilmeli (m.9). |
| İletişim ve başvuru kanalı | Hazır (Netlify'da açılmalı) | Sitede e-posta adresi yok; tek kanal `/iletisim` formu. KVKK başvurusu, Veri Sorumlusuna Başvuru Usul ve Esasları Hakkında Tebliğ m.5'teki "başvuru amacına yönelik geliştirilmiş bir yazılım ya da uygulama" yoluyla yapılır; Tebliğ'in istediği ad soyad, T.C. kimlik no ve tebligat adresi yalnızca KVKK konusunda istenir. Gönderimler Netlify Forms'a gider (ücretsiz), bildirim site sahibinin Netlify hesabındaki e-postaya düşer. Formun kendi aydınlatma bölümü `/gizlilik#iletisim`. |
| Veri sorumlusunun kimliği | **Eksik** | Form e-postanın yerini tutar ama veri sorumlusunun adını / unvanını ve adresini tutmaz. KVKK m.10 aydınlatmada veri sorumlusunun kimliğini, 5651 m.3 içerik sağlayıcının tanıtıcı bilgilerini ister. `src/config.ts → LEGAL.controller` ve `address` yayından önce doldurulmalı. Kişisel adres paylaşmak istenmiyorsa şahıs şirketi ya da sanal ofis adresi kullanılabilir. |
| Alkol tanıtımı yapılmadığı beyanı | Hazır | Kullanım koşulları m.2, "Yasal bilgiler" sayfasının ilk bölümü, karşılama ekranı, yaş kapısı ve tanıtım sayfasındaki "Pub Skor ne değildir?" bölümü: içki satışı, marka, fiyat, kampanya, sponsorluk ve tüketimi özendiren öğe yok. |
| Reklam yönetmeliği (örtülü reklam) | Hazır | Her reklam "Reklam" etiketli, `rel="sponsored"`. Varsayılan olarak kapalı. |
| Yaş sınırı | Uyumlu | İlk açılışta 18 yaş beyanı. Mağaza dağıtımında 18+ derecelendirme gerekir. |
| VERBİS | Muhtemelen muaf | Çalışan sayısı 50'den az ve bilanço 100 milyon TL'den küçükse kayıt gerekmiyor. |
| Hesaplar (v8.1) | Uyum gerekli | E-posta ve şifre Netlify Identity'de (ABD). Kayıtta 18+ ve koşul onayı zaman damgasıyla saklanıyor. Uygulama içinden hesap silme var (App Store da bunu şart koşuyor). |
| Google Maps verisi | **Kullanılmıyor** | Google'ın koşulları kazımayı ve saklamayı yasaklıyor. Yalnızca anahtarsız "Google Maps'te aç / yol tarifi" bağlantıları var; Google'a veri gitmiyor. |
| Mekan kataloğu (Overture) | Uyumlu, atıf gerekli | Meta/Microsoft CDLA-Permissive-2.0, Foursquare Apache-2.0, AllThePlaces CC0. Atıf `/yasal` sayfasında ve `data/places/NOTICE.txt` dosyasında. |
| Yalnızca içki mekanı önerme | Dikkat | Uygulama yalnızca alkol servis eden mekanları listeliyor. Bu bir mekan rehberi; ürün ya da marka tanıtımı yok. Yine de: içecek markası, fiyat kampanyası, "happy hour" ya da indirim duyurusu listelenmemeli; mekanlardan ücretli öne çıkarma alınmamalı; ifadeler nötr kalmalı ("çok gidilen", "en iyi içki" değil); 18+ kapısı korunmalı. Reklam açılmadan önce avukata sorulmalı. |
| Mekan sitelerinin menü kontrolü | Düşük risk | Yalnızca mekanların kendi web siteleri ve bağlantı verdikleri menü sayfaları okunur. `robots.txt` engeline uyulur, kendini tanıtan bir tarayıcı adı (PubSkorBot) kullanılır, site başına bir ana sayfa ve en fazla iki menü sayfası okunur, sonuç 90 gün önbellekte tutulur, içerik saklanmaz (yalnızca "içki var / yok / bilinmiyor" kararı). Google Haritalar, Yemeksepeti ve sosyal medya hiç okunmaz; bunların koşulları otomatik veri toplamayı ve onlardan mekan veritabanı oluşturmayı yasaklar. |
| Anonim popülerlik | Düşük risk | HMAC'lenmiş grup özetleri, en az 3 grup eşiği, 60/90 gün saklama, kurucu kapatabilir. Aydınlatma metninde ayrı bölüm. |
| Topluluk mekanları | 5651 kapsamında yer sağlayıcılık | Kullanıcılar mekan adı ve konumu ekleyebiliyor. Kişi başı günlük sınır var. İletişim formundan gelen yanıltıcı kayıt bildirimlerinde kayıt gizlenmeli (`places/community` belgesinde `hidden: true`). |

## 1. Alkol reklam ve tanıtım yasağı

**Mevzuat:** 4250 sayılı İspirto ve İspirtolu İçkiler İnhisarı Kanunu, 6. madde (6487 sayılı Kanun ile 2013'te değişti). Bu madde, alkollü içkilerin her ne surette olursa olsun reklamını ve tüketiciye yönelik tanıtımını, ayrıca tüketimi özendiren kampanya, promosyon ve etkinlikleri yasaklıyor.

**2026 değişikliği:** TBMM'de 11 Haziran 2026'da kabul edilen düzenleme 20 Haziran 2026 tarihli ve 33286 sayılı Resmî Gazete'de yayımlandı. Getirdikleri:

- Alkollü içki üreticisi, ithalatçısı ve pazarlayıcısına ait isim, marka, logo ve amblemler işyerlerinin içinde ve dışında, vitrinlerde ve etkinlik alanlarında kullanılamıyor.
- Bu firmalar hiçbir etkinliği ya da yayını markalarıyla destekleyemiyor (sponsorluk yasağı).
- İşletmelere 1 yıl uyum süresi tanındı.
- Bakanlık duyurusuna göre sosyal medya, internet ve yayınlarda marka, logo ve ambalaj görselleri kullanılamıyor.

**Pub Skor açısından değerlendirme:**

- Uygulama bir değerlendirme aracı. Alkol satmıyor, sipariş almıyor, tanıtım yapmıyor. Kullanıcıların özel ekipleri içindeki puan ve notlar kişisel iletişim niteliğinde.
- **Risk, uygulama gelir elde etmeye başladığında artar.** Reklam gelirli bir platformda alkol markası öne çıkaran içerik, ticari tanıtım olarak değerlendirilebilir. Bu yüzden:
  - Herkese açık paylaşım bağlantılarında sipariş defteri (ürün ve marka adları) **hiç gösterilmiyor**. Kişi adları, fotoğraflar ve notlar varsayılan olarak kapalı (`server/routes-visits.ts → getShare`).
  - Paylaşım görseli ve PDF yalnızca mekan puanlarını gösteriyor, marka ya da logo içermiyor (`src/features/export/card.ts`).
  - Reklam altyapısı alkol, tütün, elektronik sigara, kumar ve bahis kategorilerini kod düzeyinde reddediyor (`src/components/AdSlot.tsx → allowed`).
- **Yapılmaması gerekenler:**
  - Alkol markalarından ya da alkol satan işletmelerden ücretli öne çıkarma, sponsorluk ya da "happy hour" kampanyası duyurusu almak
  - "En iyi bira markası" gibi marka sıralamaları yayınlamak
  - Uygulamanın kendi tanıtımında alkol tüketimini özendiren görsel veya metin kullanmak
- **Gri alan:** Kullanıcıların herkese açık bağlantılarla paylaştığı mekan puanları. Marka içermedikleri için risk düşük görünüyor, ancak işletmelerle ticari ilişki kurulursa yeniden değerlendirilmeli.

## 2. KVKK (6698 sayılı Kanun)

**İşlenen veriler:**

- Hesap: e-posta, şifre özeti (Netlify Identity), Google ile girişte ad ve e-posta, onay zaman damgaları
- Ad veya takma ad
- Puanlar, notlar, fotoğraflar ve sipariş defteri
- Mekan konumları; adla aramada yaklaşık konum (1 km, saklanmıyor)
- Anonim popülerlik kayıtları (grup özeti + mekan + gün; kişi ya da ekip kimliği yok)
- Barındırma sağlayıcısının teknik kayıtları (IP adresi)

Telefon numarası toplanmıyor.

**Hukuki sebepler:** sözleşmenin kurulması ve ifası (m.5/2-c), meşru menfaat (m.5/2-f), hukuki yükümlülük (m.5/2-ç). Reklam ve analiz için açık rıza (m.5/1).

**Uygulamada:**

- Aydınlatma metni: `/gizlilik` sayfası (`src/features/legal.tsx`). **`src/config.ts` içindeki `LEGAL` alanları (veri sorumlusu adı ve adresi) doldurulmalı.** Başvuru kanalı e-posta değil, uygulama içi form (`/iletisim`); başvurular 30 gün içinde, yanıt formda yazılan e-postaya gönderilerek cevaplanmalı. Yanıt için kişisel olmayan ayrı bir e-posta hesabı açılabilir; bu adres sitede yayımlanmaz.
- Açık rıza: Ayarlar → Gizlilik bölümünde, varsayılan olarak kapalı.
- İlgili kişi hakları (m.11): dışa aktarma (JSON/CSV), ekipten ayrılma, ekibi silme, cihazdan çıkış. E-posta başvurularına 30 gün içinde yanıt verilmeli.
- Saklama süreleri:
  - Silinen ziyaretler 30 gün sonra temizlenir (`server/crew.ts → housekeeping`).
  - Canlı masa kağıtları 12 saat sonra geçersiz olur.

**VERBİS:** Kişisel Verileri Koruma Kurulu'nun kararlarına göre yıllık çalışan sayısı 50'den az ve yıllık mali bilanço toplamı 100 milyon TL'nin altında olan, ana faaliyeti özel nitelikli veri işlemek olmayan veri sorumluları kayıttan muaf. Pub Skor sağlık, din gibi özel nitelikli veri işlemiyor.

## 3. Yurt dışına veri aktarımı (KVKK m.9)

Uygulama Netlify üzerinde çalışıyor; veriler ABD'deki sunucularda (Netlify Blobs) tutuluyor. Bu, yurt dışına aktarım sayılır.

7499 sayılı Kanun ile 12 Mart 2024'te yürürlüğe giren değişiklik sonrası yollar:

1. **Standart sözleşme (önerilen):** Kurul'un yayımladığı standart sözleşme metni veri işleyenle (Netlify) imzalanır ve **imzadan itibaren 5 iş günü içinde** Kurul'a bildirilir. Bildirim, Kurul'un 17.10.2024 kararıyla açılan "Standart Sözleşme Bildirim Modülü" üzerinden ya da KEP ile yapılabiliyor. Bildirmemenin cezası 50.000 TL ile 1.000.000 TL arası idari para cezası. Netlify'ın veri işleme sözleşmesinin (DPA) KVKK standart sözleşmesiyle nasıl eşleşeceğini bir avukata danışın.
2. **Alternatif:** Verileri Türkiye'de tutan bir barındırmaya geçmek. Sunucu kodu buna hazır: depolama `server/kv.ts` arayüzü arkasında, PostgreSQL ya da başka bir depo için yalnızca yeni bir uyarlayıcı yazmak yeterli.

Harita ve arama servislerine (OpenStreetMap, Nominatim, Photon, Overpass) istekler yalnızca kullanıcı ilgili özelliği kullandığında doğrudan cihazdan gidiyor. Bu servisler aydınlatma metninde belirtildi.

## 4. Çerezler ve yerel depolama

KVKK'nın Çerez Uygulamaları Hakkında Rehberi'ne (20 Haziran 2022) göre yalnızca iletişimi sağlamak ya da kullanıcının açıkça talep ettiği hizmet için kesinlikle gerekli çerezler ve depolama açık rıza gerektirmiyor.

Pub Skor **çerez kullanmıyor**. Yerel depolamayı (localStorage, IndexedDB) yalnızca şunlar için kullanıyor:

- Giriş anahtarı
- Taslaklar
- Çevrimdışı kopya
- Tercihler

Bu yüzden şu an çerez onay bandı gerekmiyor. Reklam ya da analiz aracı eklenirse aracı **yüklemeden önce** onay alınmalı. Altyapı hazır: `src/state/consent.ts`.

## 5. 5651 sayılı Kanun

İçerik ve yer sağlayıcıların tanıtıcı bilgilerini kullanıcıların erişebileceği şekilde güncel tutması gerekiyor. Bu bilgiler `/yasal`, `/gizlilik` ve `/kosullar` sayfalarında `src/config.ts → LEGAL` alanından gösteriliyor.

Hukuka aykırı içerik ve kişilik hakkı bildirimleri `/iletisim` formundan ("Hukuka aykırı içerik / kişilik hakkı" konusu) alınır ve en geç 24 saat içinde yanıtlanmalı (m.9). Kurucular ekipten üye çıkarabiliyor, ziyaretleri silebiliyor ve paylaşım bağlantılarını kaldırabiliyor.

Ekip içerikleri herkese açık değil; açık olan tek içerik kullanıcının bilerek oluşturduğu paylaşım bağlantıları.

## 6. Reklam (Ticari Reklam ve Haksız Ticari Uygulamalar Yönetmeliği, 6502 s. K.)

- Örtülü reklam yasak. Her reklam açıkça "Reklam" olarak işaretlenmeli. `AdSlot` bileşeni bunu zorunlu kılıyor.
- Kişiselleştirilmiş reklam için KVKK açık rızası gerekiyor. Rıza alınmamışsa reklam "kişiselleştirilmemiş" modda gösterilir.
- **Reklam modeli önerisi:**
  - Alkol dışı kategoriler: ulaşım (taksi, araç kiralama), etkinlik ve konser biletleri, yemek siparişi (alkolsüz), alkolsüz içecekler, giyim
  - Mekanların ücretli olarak "öne çıkarılması" **önerilmez**: alkol satan işletmelerin tanıtımı riskli.
  - Reklamı açmak için: `src/config.ts → ADS.enabled = true` ve bir reklam sağlayıcısının eklenmesi. Sağlayıcı seçerken kategori engelleme desteği (alkol, kumar) ve KVKK uyumu aranmalı.
- Gelir elde edilince vergi mükellefiyeti (şahıs şirketi ya da limited şirket) ve e-fatura yükümlülükleri doğar.

## 7. Yaş sınırı ve mağazalar

- Uygulama ilk açılışta 18 yaş beyanı alıyor. Alkol satışı 18 yaş altına yasak; içeriği yetişkinlere sınırlamak ihtiyatlı bir tercih.
- **Google Play:** Alkol tüketimine odaklanan uygulamalar "Mature" (Yetişkin) derecelendirilmeli. Play Console'da yaş kısıtlama ayarı açılabilir. Alkolün sorumsuz kullanımını özendiren içerik yasak.
- **App Store:** Sık alkol referansı 17+ derecelendirme gerektiriyor.
- Sorumlu tüketim mesajları ve Yeşilay Danışmanlık Merkezi (YEDAM) **115** ücretsiz danışma hattı uygulamada yer alıyor.

## 8. Yayından önce yapılacaklar

- [ ] `src/config.ts → LEGAL`: veri sorumlusu adı veya unvanı ve adres (varsa KEP). E-posta gerekmez; başvurular `/iletisim` formundan.
- [ ] Netlify → Project configuration → Forms: **Enable form detection** (form tanımı `public/__forms.html`), ardından Forms → Form notifications → Email notification ile `iletisim` formu için bildirim e-postası. Kayıtlar Forms → iletisim altında görünür.
- [ ] Netlify ile KVKK standart sözleşmesi ve 5 iş günü içinde Kurul'a bildirim (ya da Türkiye'de barındırma)
- [ ] Aydınlatma metni ve kullanım koşullarının avukat kontrolü
- [ ] Kendi alan adı (ör. `.com.tr`). İletişim e-postası zorunlu değil (başvurular formdan), ama başvurulara yanıt vermek için kişisel olmayan ayrı bir e-posta hesabı önerilir.
- [ ] Netlify panelinde `ADMIN_KEY` ortam değişkeni (eski arşivi içe aktarırken gerekir)
- [ ] Netlify panelinde `STATS_SALT` ortam değişkeni (uzun, rastgele; popülerlik özetlerinin tuzu, bir kez belirlenip değiştirilmemeli)
- [ ] Netlify Identity: Enable, Registration open, Google (varsayılan ayar), e-posta şablonları `/identity/*.html`
- [ ] Netlify'ın KVKK standart sözleşmesi kapsamına Identity (hesap verisi) de girmeli
- [ ] Reklam açılacaksa: sağlayıcı seçimi, kategori engelleme, rıza akışının sağlayıcıya bağlanması

## Kaynaklar

- [Tarım ve Orman Bakanlığı: Alkollü İçki Reklamlarına İlişkin Mevzuatta Yapılan Değişiklik Hakkında Duyuru](https://www.tarimorman.gov.tr/TADAB/Duyuru/280/Alkollu-Icki-Reklamlarina-Iliskin-Mevzuatta-Yapilan-Degisiklik-Hakkinda-Duyuru)
- [Alkollü içki satışıyla ilgili değişiklikleri de içeren kanun Resmî Gazete'de (20.06.2026)](https://www.abchukuk.com/index.php/2026/06/20/alkollu-icki-satisiyla-ilgili-degisiklikleri-de-iceren-kanun-resmi-gazetede/)
- [TBMM'de kabul edildi: Alkol yasakları genişletildi (11.06.2026)](https://anlatilaninotesi.com.tr/20260611/tbmmde-kabul-edildi-alkol-yasaklari-genisletildi-1106438907.html)
- [6487 sayılı Kanun](https://www.alomaliye.com/2013/06/11/bazi-kanunlar-ile-375-sayili-kanun-hukmunde-kararnamede-degisiklik-yapilmasi-hakkinda-kanun-6487-sayili-kanun/)
- [KVKK yurt dışı aktarım değişikliği](https://www.hukukihaber.net/kvkk-yurt-disina-aktarim-kapsaminda-yapilan-kanun-degisikligi)
- [KVKK Standart Sözleşme Bildirim Modülü duyurusu](https://www.alomaliye.com/2024/10/30/kvkk-standart-sozlesme-bildirim-modulu/)
- [KVKK Çerez Uygulamaları Hakkında Rehber](https://www.alomaliye.com/2022/06/20/kvkk-cerez-uygulamalari-hakkinda-rehber-yayimladi/)
- [VERBİS istisna kriteri değişikliği (2025)](https://www.erdem-erdem.av.tr/bilgi-bankasi/verbis-kayit-yukumlulugune-iliskin-istisna-kriteri-degistirildi)
- [5651 sayılı Kanun kapsamında internet aktörleri](https://www.erdem-erdem.av.tr/bilgi-bankasi/5651-sayili-kanun-kapsaminda-internet-aktorleri)
- [Ticari Reklam ve Haksız Ticari Uygulamalar Yönetmeliği](https://www.lexpera.com.tr/mevzuat/yonetmelikler/ticari-reklam-ve-haksiz-ticari-uygulamalar-yonetmeligi)
- [Sosyal medya etkileyicileri reklam kılavuzu](https://hukukcularevi.com/influencer-sosyal-medya-reklam-kurulu-kilavuz/)
- [115 YEDAM Danışma Hattı](https://kureansiklopedi.com/tr/detay/115-yedam-danisma-hatti-b185a)
