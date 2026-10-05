// Yasal sayfalar ve yaş onayı. Metinler src/config.ts içindeki LEGAL bilgileriyle doldurulur.
// Yayından önce bir hukukçuya kontrol ettirilmesi önerilir (bkz. docs/YASAL.md).
import type { ComponentChildren } from 'preact';
import { LEGAL } from '../config';
import { setConsent } from '../state/consent';
import { Pint } from '../components/Pint';
import { TopBar } from '../components/ui';

function Doc({ title, children }: { title: string; children: ComponentChildren }) {
    return (
        <>
            <TopBar back="/ayarlar" title={title} />
            <main class="page no-tabbar legal">
                <h1 class="display" style={{ fontSize: '28px' }}>{title}</h1>
                <p class="tiny faint mt-8">Son güncelleme: {LEGAL.updatedAt}</p>
                <div class="mt-16">{children}</div>
            </main>
        </>
    );
}

export function Privacy() {
    return (
        <Doc title="Gizlilik ve KVKK aydınlatma metni">
            <h2>1. Veri sorumlusu</h2>
            <p>6698 sayılı Kişisel Verilerin Korunması Kanunu (“KVKK”) kapsamında veri sorumlusu: <b>{LEGAL.controller}</b>, {LEGAL.address}. Başvuru: {LEGAL.email}{LEGAL.kep ? `, KEP: ${LEGAL.kep}` : ''}.</p>

            <h2>2. İşlenen veriler</h2>
            <ul>
                <li><b>Hesap:</b> E-posta adresin ve şifren (şifre Netlify Identity'de özet olarak saklanır; Pub Skor şifreni görmez). Google ile girersen Google hesabındaki adın ve e-postan. 18 yaş beyanı ile koşulların onaylandığı zaman.</li>
                <li><b>Kimlik:</b> Ekipte ve masada görünen ad ya da takma ad, seçtiğin renk.</li>
                <li><b>İçerik:</b> Ziyaret puanları, notlar, fotoğraflar, sipariş defteri kalemleri, mekan adları ve semtleri.</li>
                <li><b>Konum:</b> Yalnızca “yakınımdaki mekanlar”, “buradayım” ya da harita özelliklerini kullandığında cihazının konumu. Yakındaki mekanlar cihazında hesaplanır; adla aramada konumun yaklaşık 1 km'ye yuvarlanarak sunucuya gider ve saklanmaz. Kaydedilen tek konum, seçtiğin ya da eklediğin mekanın konumudur; senin konum geçmişin tutulmaz.</li>
                <li><b>Topluluk mekanı:</b> Listede olmayan bir mekanı “herkes bulabilsin” seçeneğiyle eklersen mekanın adı, türü ve konumu Pub Skor'un İstanbul mekan listesine eklenir. Kimin eklediği diğer kullanıcılara gösterilmez.</li>
                <li><b>Cihaz verisi:</b> Oturum bilgisi, tema ve gizlilik tercihlerin, çevrimdışı taslaklar ve ekip kopyaları (yalnızca cihazında).</li>
                <li><b>Teknik kayıtlar:</b> Barındırma sağlayıcısının güvenlik ve kötüye kullanım önleme amacıyla tuttuğu IP adresi ve istek kayıtları.</li>
            </ul>

            <h2>Anonim popülerlik istatistiği</h2>
            <p>Keşfet'teki “bugün / bu hafta / bu ay çok gidilenler” listeleri, ekiplerin kataloğa bağlı mekanlardaki ziyaretlerinden ve “buradayım” bildirimlerinden üretilir. Bu sayımda ekip ya da kişi adı, kimliği, puan kağıdı veya konum geçmişi tutulmaz: her grup, geri çevrilemeyen gizli bir özetle temsil edilir. Bir mekan yalnızca en az 3 farklı gruptan kayıt aldığında listelenir. Ham kayıtlar 60, günlük özetler 90 gün sonra silinir. Ekip kurucusu bu katkıyı Ayarlar → Ekip bölümünden kapatabilir; kapatınca ekibin son kayıtları da sayımdan çıkarılır.</p>

            <h2>3. Amaçlar ve hukuki sebepler</h2>
            <ul>
                <li>Hesap, ekip, ziyaret ve canlı masa hizmetinin sunulması: sözleşmenin kurulması ve ifası (KVKK m.5/2-c).</li>
                <li>Anonim popülerlik istatistiği ve topluluk mekan listesi: hizmetin geliştirilmesine yönelik meşru menfaat (m.5/2-f); kişiyi belirlemeye imkân vermeyecek şekilde ve kapatılabilir olarak.</li>
                <li>Güvenlik, kötüye kullanımın önlenmesi, hizmetin iyileştirilmesi: meşru menfaat (m.5/2-f) ve hukuki yükümlülük (m.5/2-ç).</li>
                <li>Kişiselleştirilmiş reklam ve kullanım istatistiği (şu an kullanılmıyor; eklenirse): yalnızca açık rıza (m.5/1). Rızanı Ayarlar → Gizlilik tercihleri’nden istediğin an geri alabilirsin.</li>
            </ul>

            <h2>4. Kimlere aktarılır?</h2>
            <ul>
                <li><b>Ekibin üyeleri:</b> Ekip içeriği yalnızca o ekibin üyelerine görünür.</li>
                <li><b>Herkese açık bağlantı:</b> Bir ziyaret için bağlantı oluşturursan, bağlantıyı alan herkes skoru ve kriterleri görür. Kişi adları, fotoğraflar ve notlar varsayılan olarak gizlidir.</li>
                <li><b>Barındırma ve hesap (yurt dışı):</b> Veriler ve hesap bilgilerin (Netlify Identity) {LEGAL.hosting} sunucularında saklanır. Yurt dışına aktarım KVKK m.9 kapsamında standart sözleşme güvencesiyle yapılır.</li>
                <li><b>Harita ve konum servisleri:</b> Harita karoları için OpenStreetMap; İstanbul dışındaki ya da listede olmayan mekanların araması için Photon (komoot), OpenStreetMap Nominatim ve Overpass hizmetlerine yalnızca ilgili özelliği kullandığında doğrudan cihazından istek gider.</li>
                <li><b>Google Maps bağlantıları:</b> “Google Maps'te aç” ya da “Yol tarifi”ne dokunursan Google'ın sitesi veya uygulaması açılır; bu durumda Google'ın kendi gizlilik koşulları geçerlidir. Pub Skor Google'a veri göndermez.</li>
                <li>Yetkili kamu kurum ve kuruluşları: hukuki yükümlülük kapsamında, talep hâlinde.</li>
            </ul>

            <h2>5. Saklama süreleri</h2>
            <ul>
                <li>Ekip verileri, ekip kurucusu ekibi silene kadar saklanır. Silinen ziyaretler 30 gün sonra kalıcı olarak silinir.</li>
                <li>Canlı masa puan kağıtları masa kapandıktan ya da 12 saat geçtikten sonra kullanılmaz ve temizlenir.</li>
                <li>Hesap bilgilerin, hesabını silene kadar saklanır. Ayarlar → Hesabımı sil ile hesabın ve profilin kalıcı olarak silinir; ekiplerde adın “Silinmiş üye” olarak anonimleşir.</li>
                <li>Anonim popülerlik kayıtları 60 gün (ham) ve 90 gün (günlük özet) sonra silinir.</li>
                <li>Cihazdaki veriler, Ayarlar’dan “Çıkış yap” ile ya da tarayıcı verilerini silerek kaldırılabilir.</li>
            </ul>

            <h2>6. Yerel depolama ve çerezler</h2>
            <p>Pub Skor çerez kullanmaz. Tarayıcının yerel depolamasını yalnızca hizmetin çalışması için zorunlu amaçlarla kullanır (oturum bilgisi, taslaklar, tercihler, çevrimdışı kopya). Bu kullanım için açık rıza gerekmez. Reklam ya da analiz gibi zorunlu olmayan bir araç eklenirse önce açık rızan istenir.</p>

            <h2>7. Hakların (KVKK m.11)</h2>
            <p>Verilerinin işlenip işlenmediğini öğrenme, bilgi talep etme, amacına uygun kullanılıp kullanılmadığını öğrenme, aktarıldığı üçüncü kişileri bilme, eksik ya da yanlış işlenmişse düzeltilmesini, silinmesini ya da yok edilmesini isteme, itiraz etme ve zararın giderilmesini talep etme haklarına sahipsin. Başvurularını {LEGAL.email} adresine iletebilirsin; en geç 30 gün içinde ücretsiz yanıtlanır. Verilerinin bir kopyasını Ayarlar → Veriler bölümünden kendin de alabilir, hesabını Ayarlar → Hesabımı sil ile kendin silebilirsin.</p>
        </Doc>
    );
}

export function Terms() {
    return (
        <Doc title="Kullanım koşulları">
            <h2>1. Hizmet</h2>
            <p>Pub Skor; arkadaş gruplarının gittikleri mekanları birlikte puanlaması, notlaması ve kendi aralarında karşılaştırması için bir araçtır. Alkollü içki satmaz, sipariş almaz, alkollü içki tanıtımı ya da reklamı yapmaz.</p>
            <h2>2. Hesap</h2>
            <p>Ekip kurmak ve katılmak için ücretsiz bir hesap gerekir. Hesabının güvenliğinden (şifren, e-postan) sen sorumlusun. Hesabını istediğin zaman Ayarlar'dan silebilirsin. Canlı masaya hesapsız, misafir olarak katılabilirsin.</p>
            <h2>3. Yaş sınırı</h2>
            <p>Pub Skor’u yalnızca 18 yaşını doldurmuş kişiler kullanabilir. Uygulamayı kullanarak 18 yaşından büyük olduğunu beyan edersin.</p>
            <h2>4. Sorumlu tüketim</h2>
            <p>Puanlamalar mekan deneyimini değerlendirmek içindir; alkol tüketimini özendirmek amacı taşımaz. Alkollü araç kullanma. Bağımlılıkla ilgili ücretsiz destek için Yeşilay Danışmanlık Merkezi (YEDAM) 115’i arayabilirsin.</p>
            <h2>5. İçerik kuralları</h2>
            <ul>
                <li>Hukuka aykırı, hakaret içeren, nefret söylemi barındıran ya da başkalarının kişilik haklarını ihlal eden içerik paylaşma.</li>
                <li>Masada olmayan kişilerin fotoğrafını ya da kişisel bilgisini izinsiz ekleme.</li>
                <li>Uygulamayı alkollü içki markası ya da işletme reklamı, kampanya veya promosyon amacıyla kullanma.</li>
                <li>Davet bağlantılarını yalnızca güvendiğin kişilerle paylaş; bağlantıyı alan kişi ekibe katılabilir.</li>
                <li>Topluluk listesine yalnızca gerçekten var olan mekanları, doğru adı ve konumuyla ekle. Yanıltıcı ya da reklam amaçlı kayıtlar kaldırılır.</li>
            </ul>
            <p>Kurallara aykırı içerik bildirildiğinde ya da tespit edildiğinde kaldırılabilir. Bildirim için: {LEGAL.email}.</p>
            <h2>6. Sorumluluk</h2>
            <p>Puanlar ve yorumlar ekip üyelerinin kişisel görüşleridir. Hizmet “olduğu gibi” sunulur; kesintisiz ya da hatasız çalışacağı garanti edilmez. Önemli verilerini Ayarlar’dan düzenli olarak dışa aktarman önerilir.</p>
            <h2>7. Değişiklikler ve uygulanacak hukuk</h2>
            <p>Bu koşullar güncellenebilir; önemli değişiklikler uygulama içinde duyurulur. Uyuşmazlıklarda Türkiye Cumhuriyeti hukuku uygulanır.</p>
            <h2>8. İletişim</h2>
            <p>{LEGAL.controller} · {LEGAL.address} · {LEGAL.email}</p>
        </Doc>
    );
}

export function LegalInfo() {
    return (
        <Doc title="Yasal bilgiler ve sorumlu tüketim">
            <h2>Neden paylaşımlarda marka ya da logo yok?</h2>
            <p>Türkiye’de 4250 sayılı Kanun’un 6. maddesi uyarınca alkollü içkilerin her türlü reklamı ve tüketiciye yönelik tanıtımı yasaktır; 20 Haziran 2026’da yürürlüğe giren düzenlemeyle alkollü içki marka, logo ve görsellerinin kullanımı daha da sınırlandırılmıştır. Bu nedenle Pub Skor’un ürettiği paylaşım görselleri, PDF raporları ve herkese açık bağlantılar marka adı, logo ya da sipariş listesi içermez; yalnızca mekan deneyimine dair puanları gösterir.</p>
            <h2>Reklamlar</h2>
            <p>Pub Skor’da şu an reklam yoktur. İleride gösterilirse: alkol, tütün ve bahis reklamı kesinlikle yer almaz; her reklam açıkça “Reklam” olarak etiketlenir; kişiselleştirilmiş reklam yalnızca açık rızanla yapılır.</p>
            <h2>18 yaş sınırı</h2>
            <p>Uygulama 18 yaş ve üzeri içindir.</p>
            <h2>Sorumlu tüketim</h2>
            <p>Alkollü araç kullanma; eve dönüşünü önceden planla. Alkol ya da başka bir bağımlılık konusunda kendin ya da bir yakının için ücretsiz destek: <b>Yeşilay Danışmanlık Merkezi (YEDAM) 115</b>.</p>
            <h2>Veri kaynakları</h2>
            <p>Mekan bilgileri: <a class="link-btn" href="https://overturemaps.org" target="_blank" rel="noopener">Overture Maps Foundation</a> açık verisi (Meta ve Microsoft: CDLA-Permissive-2.0; Foursquare Open Source Places: Apache 2.0; AllThePlaces: CC0). Harita: © OpenStreetMap katkıcıları (ODbL). Mekan bilgileri hatalı ya da eski olabilir.</p>
            <h2>İletişim ve bildirim</h2>
            <p>İçerik sağlayıcı: {LEGAL.controller}, {LEGAL.address}. Hukuka aykırı içerik bildirimi: {LEGAL.email}.</p>
            <p class="mt-16"><a class="link-btn" href="/gizlilik">Gizlilik ve KVKK aydınlatma metni</a> · <a class="link-btn" href="/kosullar">Kullanım koşulları</a></p>
        </Doc>
    );
}

/** İlk açılışta 18 yaş beyanı. */
export function AgeGate({ onAccept }: { onAccept: () => void }) {
    return (
        <div class="welcome" style={{ justifyContent: 'center' }}>
            <div class="center">
                <Pint score={7} size={72} />
                <h1 class="mt-24" style={{ fontSize: '34px' }}>18 yaşından büyük müsün?</h1>
                <p>Pub Skor, alkollü içki sunulan mekanların değerlendirmelerini içerir ve yalnızca 18 yaş ve üzeri kullanıcılar içindir.</p>
            </div>
            <div class="stack gap-12 mt-32">
                <button class="btn btn-primary btn-lg" onClick={() => { setConsent({ adult: true }); onAccept(); }}>Evet, 18 yaşından büyüğüm</button>
                <a class="btn btn-ghost" href="https://www.yesilay.org.tr" rel="noopener noreferrer">Hayır</a>
            </div>
            <p class="tiny faint center mt-24">Devam ederek <a class="link-btn" href="/kosullar">kullanım koşullarını</a> ve <a class="link-btn" href="/gizlilik">gizlilik metnini</a> okuduğunu kabul edersin. Lütfen sorumlu tüketin.</p>
        </div>
    );
}
