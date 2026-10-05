# Pub Skor v8.1

Arkadaşlarınla gittiğin pub, bar, kokteyl bar, meyhane ve restoranları birlikte puanla. Masada herkes kendi telefonundan oylar; Pub Skor ağırlıklı ortak skoru hesaplar ve ekibinin kendi sıralamasını, istatistiklerini ve haritasını tutar.

## Özellikler

- **Hesaplar:** E-posta + şifre ya da Google ile giriş (Netlify Identity). Ekipler ve puanlar hesapta; her telefonda aynı. Hesap uygulama içinden silinebilir.
- **Özel ekipler:** Ekibi kuran kişi davet linki ya da QR ile arkadaşlarını çağırır. Arşivi yalnızca ekip görür.
- **İstanbul mekan kataloğu:** Overture Maps açık verisinden İstanbul'un 39 ilçesindeki ~3.900 **alkollü içki servis eden** mekan: bar, pub, meyhane, şarap ve kokteyl barları, gece kulüpleri, türkü evleri ve alkol servisi olan restoranlar. Mekanlar gerçek ilçe sınırlarına göre ilçelere atanır. Alkol servisi üç kaynaktan doğrulanır: kategori ve ad kuralları, mekanın kendi web sitesindeki menü (en az iki farklı içki türü aranır, tek başına "kokteyl" yetmez; alan adı mekanın adına benzemeyen siteler sayılmaz; kendini kafe gösterip içki servis eden mekanlar da böyle bulunur; sitesinde "alkolsüz" yazanlar, zincirlerde yalnızca belirtilen şube çıkarılır) ve elle istisnalar. Adla arama, yakındakiler, ilçenin tüm mekanları, mekan sayfası (telefon, web sitesi, "Google Maps'te aç / yol tarifi"). Listede olmayan içki mekanını kullanıcı "topluluk mekanı" olarak ekleyebilir. "Alkol servisi yok / kapandı" bildirimini iki farklı kişi yaparsa mekan önerilerden düşer.
- **Keşfet:** Bugün / bu hafta / bu ay çok gidilen mekanlar; semt, ilçe ve tür filtresi, liste ve harita. Ekiplerin ziyaretlerinden anonim sayılır (en az 3 farklı grup), kurucu katkıyı kapatabilir. Topluluk puanı (son 3 ay).
- **Canlı masa:** Herkes QR ya da 6 haneli kodla kendi telefonundan katılır. Kör puanlama, ilerleme halkaları, telefonu olmayanın yerine puanlama ve masa kapanınca skorun açılması.
- **Tek telefon modu:** Telefon elden ele dolaşır. Kriter kriter ilerleyen hızlı puanlama, ardından inceleme tablosu. İnternetsiz de çalışır.
- **Modüler kriterler:** Ortak mekan kriterleri (servis, fiyat, akustik, ambiyans, hijyen…) ve seçilen türe göre eklenen modüller: Bira, Kokteyl, Şarap, Rakı ve sert içki, Alkolsüz, Yemek ve meze. Kişi bir kriteri deneyimlemediyse "fikrim yok" diyebilir.
- **Sipariş defteri:** Ne içildi, ne yendi, fiyatı ve masanın kararı. Mekan sayfasında "Masanın favorileri" olarak toplanır.
- **Mekan profilleri ve sıralama:** Kategori bazlı sıralama (en iyi kokteyl, en iyi yemek…), skor eğilimi, kriter ortalamaları, özellik etiketleri (canlı müzik, teras, maç yayını…).
- **Harita** (OpenStreetMap), **gidilecekler listesi**, **"Nereye gidelim?"** önerileri ve **"Buradayım"** bildirimi.
- **Kişisel istatistikler ve rozetler:** Kim cömert, kim sert puanlıyor, kim kiminle aynı zevkte (uyum matrisi), puanlama tarzı.
- **Paylaşım:** Hikâye boyutunda skor görseli, WhatsApp metni, PDF rapor, gizlilik ayarlı herkese açık bağlantı.
- **PWA:** Ana ekrana eklenebilir. Çevrimdışı açılır; kayıtlar bağlantı gelince gönderilir.
- **Yasal hazırlık:** 18 yaş onayı, KVKK aydınlatma metni, kullanım koşulları, "alkol tanıtımı yapılmaz" beyanı, varsayılan olarak kapalı ve alkol kategorisini engelleyen reklam altyapısı. Ayrıntılar: [`docs/YASAL.md`](docs/YASAL.md).
- **İletişim ve başvuru formu (`/iletisim`):** Sitede e-posta adresi yok. KVKK başvurusu (Tebliğ m.5 bilgileriyle), hukuka aykırı içerik bildirimi, mekan bilgisi ve diğer talepler Netlify Forms'a gider; Netlify'da form algılama açılmalı (bkz. `docs/YASAL.md` → Yayından önce yapılacaklar). Yerelde gönderimler `.data/forms.jsonl` dosyasına yazılır.
- **Tanıtım sayfası (`/tanitim/`):** Uygulamadan bağımsız statik sayfa (`public/tanitim/`).
- **Tasarım önizlemesi:** `design/demo.html` (yalnızca yerelde, `npm run dev` → `/design/demo.html`); Apple (iOS 26) dilinde tokenlar `design/tokens.css`. Yayına girmez.

## Mimari

```
shared/      Alan modeli (istemci + sunucu ortak): kriterler, skor, doğrulama, istatistik, rozet, v7 dönüştürücü
server/      API (çerçevesiz, Request → Response): ekip/üyelik, ziyaret, mekan, canlı masa, fotoğraf, paylaşım
  kv.ts        Depolama arayüzü + bellek uygulaması (testler)
  kv-blobs.ts  Netlify Blobs uyarlayıcısı (üretim)
  kv-file.ts   Dosya uyarlayıcısı (yerel geliştirme, .data/)
  identity.ts  Hesap doğrulama (Netlify Identity; geliştirme ve testte imzalı dev anahtarı)
  users.ts     Hesap profili ve "ekiplerim" dizini
  places-app.ts Mekan kataloğu araması ve topluluk mekanları
  popular.ts   Anonim etkinlik kaydı ve gün / hafta / ay toplaması
netlify/functions/
  api.ts       /api/*        (dakikada 600 istek / IP)
  auth.ts      /api/auth/*   (dakikada 30 istek / IP; ekip kurma, davet)
  places.ts    /api/places/* (katalog gömülü; arama, mekan, topluluk mekanı)
  popular.ts   Zamanlanmış görev, 30 dk'da bir popüler listeleri hesaplar
data/places/   İstanbul kataloğu (ist.json) ve lisans atıfları (NOTICE.txt)
scripts/places/ Kataloğu Overture'dan yeniden üreten betik
src/         Preact + TypeScript istemci
  state/       Sinyal tabanlı durum: oturum, ekip verisi, çevrimdışı gönderim kuyruğu, taslak
  features/    Ekranlar
  components/  Tasarım sistemi bileşenleri
  styles/      Tokenlar (koyu/açık tema), bileşen ve ekran stilleri
  sw.ts        Service worker (uygulama kabuğu, fotoğraf ve harita karosu önbelleği)
tests/       Vitest: skor, doğrulama, istatistik ve uçtan uca API senaryoları
```

**Veri modeli:** Her ekip tek bir belgede tutulur: üyeler, mekanlar, ziyaretler, aktif masalar. Her yazım ETag ile koşullu yapılır; aynı anda yazan iki kişi birbirinin kaydını ezmez, çakışmada işlem taze veriyle tekrarlanır. Canlı masada her kişinin puan kağıdı ayrı bir kayıtta durur, böylece aynı anda puan verenler çakışmaz. Fotoğraflar ayrı saklanır ve tahmin edilemez kimliklerle sunulur.

**Kimlik:** Netlify Identity hesabı. İstemci Identity erişim anahtarını (JWT) `Authorization` başlığıyla, hangi ekip için olduğunu `X-Crew-Id` ile gönderir; sunucu anahtarı Identity'ye sorarak doğrular ve 5 dk önbellekte tutar. Yetki her zaman ekip belgesindeki üye kaydından (`userId`) gelir. v8.0'dan kalan cihaz anahtarları (`m1.…`) ilk girişte otomatik olarak hesaba bağlanır ve geçersiz olur. Canlı masaya misafirler hesapsız, koltuk anahtarıyla katılır.

**Mekanlar:** Katalog statik karolara bölünür (`/places/ist/<geohash6>.json`; CDN'den gelir, çevrimdışı önbelleğe alınır). Yakındakiler cihazda hesaplanır, konum sunucuya gitmez. Ekip mekanları `placeId` ile kataloğa bağlanır (eski mekanlar arka planda ad + konumla eşleştirilir).

**Popülerlik:** Her ziyaret, kataloğa bağlı mekanda o gün için `act/<gün>/<grup özeti>` kaydı oluşturur (grup özeti = gizli tuzla HMAC). Zamanlanmış görev günlük özetleri ve gün / 7 gün / 30 gün pencerelerini hesaplar; en az 3 farklı grup kuralı uygulanır.

**Çevrimdışı:** Ekip verisi IndexedDB'de önbelleklenir; uygulama anında açılır, sonra sunucudan tazelenir. Yeni ziyaretler ve fotoğraflar önce cihaza yazılır, bağlantı gelince sırayla gönderilir. İstekler istemci kimlikleriyle idempotent olduğu için yarıda kalan gönderim güvenle tekrarlanır.

## Geliştirme

```bash
npm install
npm run dev          # http://localhost:5173 (API dahil; veriler .data/ klasöründe)
npm test             # birim + API testleri
npm run typecheck
npm run build        # dist/
npm run icons        # public/icons/icon.svg → PNG simgeler
npm run places:ist   # İstanbul kataloğunu Overture'ın son sürümünden yeniden üret (ayda bir)
npm run places:ist -- --menus   # + mekanların kendi web sitelerindeki menüleri yeniden kontrol et (~20 dk)
                     # Alkol sınıflandırması: shared/alcohol.ts · menü kontrolü: scripts/places/menu-check.mjs
                     # Menü sonuçları: data/places/menu-cache.json · elle istisnalar: data/places/overrides.json
```

Yerelde eski v7 arşivini içe aktarmayı denemek için `.data/legacy/` klasörüne v7 kayıtlarını `<id>.json` olarak koyabilirsin.

## Yayına alma (Netlify)

1. **Önce Identity'yi aç** (hesap zorunlu): Netlify → Project configuration → Identity → **Enable Identity**.
   - Registration: **Open**
   - External providers → **Google** → *Use default configuration* (Google Cloud gerekmez)
   - Emails: şablon yolları `/identity/confirmation.html`, `/identity/recovery.html`, `/identity/invitation.html`, `/identity/email-change.html`
2. **Environment variables:** `STATS_SALT` = uzun, rastgele bir değer (popülerlik özetleri; bir kez belirle, değiştirme). `ADMIN_KEY` = v7 arşivini aktarmak için parola.
3. Depoyu GitHub'a gönder; ayarlar `netlify.toml` dosyasından gelir (`npm run build`, `dist`, fonksiyonlar).
4. Yayına almadan önce `src/config.ts → LEGAL` alanlarını doldur ve [`docs/YASAL.md`](docs/YASAL.md) içindeki kontrol listesini tamamla.

### v7'den geçiş

v7'nin herkese açık arşivi (`visits` ve `photos` Blobs depoları) silinmez. Yeni sürümde:

1. Ekibi kur, arkadaşlarını davet et.
2. Kurucu olarak **Ayarlar → Eski ortak arşiv → Ekibe aktar** (ADMIN_KEY tanımlıysa anahtarı gir).
3. Katılımcı adları ekip üyelerinin adlarıyla eşleşirse ziyaretler profillere bağlanır. Eşleşmeyenler misafir olarak kalır; o kişi daha sonra ekibe katılırken "daha önce misafir olarak puan verdin mi?" ekranından kendini seçebilir.

Tarayıcıda kalmış, hiç paylaşılmamış eski yerel kayıtlar da **Ayarlar → Bu cihazdaki eski kayıtlar** bölümünden aktarılabilir.

## Sınırlar

- Ekip başına 40 üye, 3000 ziyaret, 1500 mekan
- Masada en fazla 12 kişi
- Ziyaret başına 6 fotoğraf (tarayıcıda 1600 piksele küçültülür) ve 40 sipariş kalemi
- Canlı masa 12 saat açık kalır
