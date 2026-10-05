# Pub Skor v8

Arkadaşlarınla gittiğin pub, bar, kokteyl bar, meyhane ve restoranları birlikte puanla. Masada herkes kendi telefonundan oylar; Pub Skor ağırlıklı ortak skoru hesaplar ve ekibinin kendi sıralamasını, istatistiklerini ve haritasını tutar.

## Özellikler

- **Özel ekipler:** Hesap ve şifre yok. Ekibi kuran kişi davet linki ya da QR ile arkadaşlarını çağırır. Arşivi yalnızca ekip görür.
- **Canlı masa:** Herkes QR ya da 6 haneli kodla kendi telefonundan katılır. Kör puanlama, ilerleme halkaları, telefonu olmayanın yerine puanlama ve masa kapanınca skorun açılması.
- **Tek telefon modu:** Telefon elden ele dolaşır. Kriter kriter ilerleyen hızlı puanlama, ardından inceleme tablosu. İnternetsiz de çalışır.
- **Modüler kriterler:** Ortak mekan kriterleri (servis, fiyat, akustik, ambiyans, hijyen…) ve seçilen türe göre eklenen modüller: Bira, Kokteyl, Şarap, Rakı ve sert içki, Alkolsüz, Yemek ve meze. Kişi bir kriteri deneyimlemediyse "fikrim yok" diyebilir.
- **Sipariş defteri:** Ne içildi, ne yendi, fiyatı ve masanın kararı. Mekan sayfasında "Masanın favorileri" olarak toplanır.
- **Mekan profilleri ve sıralama:** Kategori bazlı sıralama (en iyi kokteyl, en iyi yemek…), skor eğilimi, kriter ortalamaları, özellik etiketleri (canlı müzik, teras, maç yayını…).
- **Harita** (OpenStreetMap), **gidilecekler listesi** ve **"Nereye gidelim?"** önerileri.
- **Kişisel istatistikler ve rozetler:** Kim cömert, kim sert puanlıyor, kim kiminle aynı zevkte (uyum matrisi), puanlama tarzı.
- **Paylaşım:** Hikâye boyutunda skor görseli, WhatsApp metni, PDF rapor, gizlilik ayarlı herkese açık bağlantı.
- **PWA:** Ana ekrana eklenebilir. Çevrimdışı açılır; kayıtlar bağlantı gelince gönderilir.
- **Yasal hazırlık:** 18 yaş onayı, KVKK aydınlatma metni, kullanım koşulları, varsayılan olarak kapalı ve alkol kategorisini engelleyen reklam altyapısı. Ayrıntılar: [`docs/YASAL.md`](docs/YASAL.md).

## Mimari

```
shared/      Alan modeli (istemci + sunucu ortak): kriterler, skor, doğrulama, istatistik, rozet, v7 dönüştürücü
server/      API (çerçevesiz, Request → Response): ekip/üyelik, ziyaret, mekan, canlı masa, fotoğraf, paylaşım
  kv.ts        Depolama arayüzü + bellek uygulaması (testler)
  kv-blobs.ts  Netlify Blobs uyarlayıcısı (üretim)
  kv-file.ts   Dosya uyarlayıcısı (yerel geliştirme, .data/)
netlify/functions/
  api.ts       /api/*        (dakikada 600 istek / IP)
  auth.ts      /api/auth/*   (dakikada 30 istek / IP; ekip kurma, davet)
src/         Preact + TypeScript istemci
  state/       Sinyal tabanlı durum: oturum, ekip verisi, çevrimdışı gönderim kuyruğu, taslak
  features/    Ekranlar
  components/  Tasarım sistemi bileşenleri
  styles/      Tokenlar (koyu/açık tema), bileşen ve ekran stilleri
  sw.ts        Service worker (uygulama kabuğu, fotoğraf ve harita karosu önbelleği)
tests/       Vitest: skor, doğrulama, istatistik ve uçtan uca API senaryoları
```

**Veri modeli:** Her ekip tek bir belgede tutulur: üyeler, mekanlar, ziyaretler, aktif masalar. Her yazım ETag ile koşullu yapılır; aynı anda yazan iki kişi birbirinin kaydını ezmez, çakışmada işlem taze veriyle tekrarlanır. Canlı masada her kişinin puan kağıdı ayrı bir kayıtta durur, böylece aynı anda puan verenler çakışmaz. Fotoğraflar ayrı saklanır ve tahmin edilemez kimliklerle sunulur.

**Kimlik:** E-posta ya da şifre yok. Her cihaz, ekibe katılırken rastgele bir giriş anahtarı alır; sunucu yalnızca anahtarın özetini (SHA-256) saklar. Cihaz kaybedilirse kurucu yeni giriş bağlantısı üretebilir. Kullanıcı Ayarlar'dan diğer cihazlarının erişimini kapatabilir.

**Çevrimdışı:** Ekip verisi IndexedDB'de önbelleklenir; uygulama anında açılır, sonra sunucudan tazelenir. Yeni ziyaretler ve fotoğraflar önce cihaza yazılır, bağlantı gelince sırayla gönderilir. İstekler istemci kimlikleriyle idempotent olduğu için yarıda kalan gönderim güvenle tekrarlanır.

## Geliştirme

```bash
npm install
npm run dev          # http://localhost:5173 (API dahil; veriler .data/ klasöründe)
npm test             # birim + API testleri
npm run typecheck
npm run build        # dist/
npm run icons        # public/icons/icon.svg → PNG simgeler
```

Yerelde eski v7 arşivini içe aktarmayı denemek için `.data/legacy/` klasörüne v7 kayıtlarını `<id>.json` olarak koyabilirsin.

## Yayına alma (Netlify)

1. Depoyu GitHub'a gönder. Netlify'da **Add new site → Import from Git** ile depoyu seç; ayarlar `netlify.toml` dosyasından gelir (`npm run build`, `dist`, fonksiyonlar).
2. **Environment variables:** `ADMIN_KEY` = uzun, rastgele bir parola. v7 ortak arşivini bir ekibe aktarırken istenir.
3. Yayına almadan önce `src/config.ts → LEGAL` alanlarını doldur ve [`docs/YASAL.md`](docs/YASAL.md) içindeki kontrol listesini tamamla.

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
