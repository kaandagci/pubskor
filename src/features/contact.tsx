// İletişim ve başvuru formu (/iletisim): KVKK başvuruları, hukuka aykırı içerik bildirimleri ve diğer talepler.
// Sitede e-posta adresi yayımlanmaz; tek iletişim kanalı bu form (bkz. src/lib/contact.ts).
import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { authUser } from '../lib/auth';
import {
    CONTACT_TOPICS, KVKK_RIGHTS, LIMITS, contactFields, referenceId, submitContact, validateContact,
    type ContactInput, type ContactTopic
} from '../lib/contact';
import { CircleCheck, ShieldCheck } from '../components/icons';
import { AsyncButton, Field, TopBar } from '../components/ui';
import { toastError } from '../state/ui';

const TOPICS = Object.keys(CONTACT_TOPICS) as ContactTopic[];

/** Birden çok seçenek içeren alan (Field bir <label>; içine başka etiket konamaz). */
function Group({ label, error, children }: { label: string; error?: string | null; children: ComponentChildren }) {
    return (
        <div class="field" role="group" aria-label={label}>
            <span class="label">{label}</span>
            {children}
            {error && <span class="error-text">{error}</span>}
        </div>
    );
}

export function Contact() {
    const { query } = useLocation();
    const user = authUser.value;
    const initialTopic = TOPICS.includes(query.konu as ContactTopic) ? (query.konu as ContactTopic) : 'diger';
    const [f, setF] = useState<ContactInput>({
        topic: initialTopic,
        name: user?.name ?? '',
        email: user?.email ?? '',
        phone: '', identity: '', address: '', rights: [],
        link: query.yer ? `${location.origin}/yer/${encodeURIComponent(query.yer)}` : '',
        message: '', acknowledged: false
    });
    const [touched, setTouched] = useState(false);
    const [sent, setSent] = useState<{ ref: string; reply: string } | null>(null);
    const set = <K extends keyof ContactInput>(k: K, v: ContactInput[K]) => setF(p => ({ ...p, [k]: v }));
    const errors = validateContact(f);
    const err = (k: keyof ContactInput) => (touched ? errors[k] ?? null : null);
    const kvkk = f.topic === 'kvkk';
    const topic = CONTACT_TOPICS[f.topic];

    const submit = async () => {
        setTouched(true);
        if (Object.keys(errors).length) return;
        const ref = referenceId();
        try {
            await submitContact(contactFields(f, ref, user?.email ?? null));
            setSent({ ref, reply: topic.reply });
            window.scrollTo(0, 0);
        } catch (e) { toastError(e); }
    };

    if (sent) {
        return (
            <>
                <TopBar back="/yasal" />
                <main class="page no-tabbar"><div class="empty mt-32">
                    <span class="contact-done"><CircleCheck /></span>
                    <h3 class="display">Talebin alındı</h3>
                    <p>Başvuru numaran <b style={{ fontVariantNumeric: 'tabular-nums', letterSpacing: '.02em' }}>{sent.ref}</b>. Yanıt <b>{f.email.trim()}</b> adresine {sent.reply} gönderilir. Sonraki yazışmalarda bu numarayı belirt.</p>
                    <a class="btn btn-secondary mt-16" href="/">Ana sayfa</a>
                </div></main>
            </>
        );
    }

    const input = (k: 'name' | 'email' | 'phone' | 'identity' | 'link', max: number, extra: Record<string, unknown> = {}) => (
        <input class="input" value={f[k]} maxLength={max} onInput={e => set(k, (e.target as HTMLInputElement).value)} {...extra} />
    );

    return (
        <>
            <TopBar back="/yasal" />
            <main class="page no-tabbar">
                <div class="page-head">
                    <h1 class="display">İletişim ve başvuru</h1>
                    <p>Pub Skor'a bu formdan ulaşabilirsin. Yanıt, yazdığın e-posta adresine gönderilir.</p>
                </div>

                <form onSubmit={e => { e.preventDefault(); void submit(); }} noValidate>
                    <Group label="Konu">
                        <div class="stack gap-8" role="radiogroup" aria-label="Konu">
                            {TOPICS.map(t => (
                                <label key={t} class={`consent contact-topic${f.topic === t ? ' on' : ''}`}>
                                    <input type="radio" name="konu" checked={f.topic === t} onChange={() => set('topic', t)} />
                                    <span><b>{CONTACT_TOPICS[t].label}</b><span class="small muted" style={{ display: 'block' }}>{CONTACT_TOPICS[t].sub}</span></span>
                                </label>
                            ))}
                        </div>
                    </Group>

                    <div class="banner mt-16">
                        <span class="b-icon"><ShieldCheck /></span>
                        <div class="grow small">
                            {kvkk
                                ? <>KVKK m.11 kapsamındaki başvurun, Veri Sorumlusuna Başvuru Usul ve Esasları Hakkında Tebliğ m.5 uyarınca bu başvuru formuyla yapılabilir. Tebliğ gereği ad soyad, T.C. kimlik numarası ve tebligat adresi istenir; bunlar yalnızca kimliğini doğrulamak ve başvurunu yanıtlamak için kullanılır. Yanıt {topic.reply}.</>
                                : f.topic === 'icerik'
                                    ? <>Kişilik hakkını ihlal ettiğini düşündüğün içeriği bildir; inceleme sonucu {topic.reply} bildirilir. Gerekirse içerik yayından kaldırılır.</>
                                    : <>Yanıt {topic.reply} verilir.</>}
                        </div>
                    </div>

                    <div class="mt-16">
                        <Field label="Ad soyad" error={err('name')}>{input('name', LIMITS.name, { autoComplete: 'name' })}</Field>
                        <Field label="E-posta" hint="Yanıt bu adrese gönderilir" error={err('email')}>{input('email', LIMITS.email, { type: 'email', inputMode: 'email', autoComplete: 'email' })}</Field>
                        {kvkk && (
                            <>
                                <Field label="T.C. kimlik numarası" hint="Yabancı uyruklular: uyruk ve pasaport numarası" error={err('identity')}>{input('identity', LIMITS.identity, { inputMode: 'text', autoComplete: 'off' })}</Field>
                                <Field label="Tebligat adresi" hint="Yerleşim yeri ya da iş yeri adresi" error={err('address')}>
                                    <textarea class="textarea" style={{ minHeight: '72px' }} value={f.address} maxLength={LIMITS.address} autoComplete="street-address" onInput={e => set('address', (e.target as HTMLTextAreaElement).value)} />
                                </Field>
                                <Group label="Talebin" error={err('rights')}>
                                    <div class="stack gap-8">
                                        {KVKK_RIGHTS.map(([id, label]) => (
                                            <label key={id} class="consent">
                                                <input type="checkbox" checked={f.rights.includes(id)} onChange={e => set('rights', (e.target as HTMLInputElement).checked ? [...f.rights, id] : f.rights.filter(r => r !== id))} />
                                                <span>{label}</span>
                                            </label>
                                        ))}
                                    </div>
                                </Group>
                            </>
                        )}
                        {(f.topic === 'icerik' || f.topic === 'mekan') && (
                            <Field label={f.topic === 'icerik' ? 'İçeriğin bağlantısı ya da yeri' : 'Mekanın bağlantısı ya da adı'} error={err('link')}>
                                {input('link', LIMITS.link, { inputMode: 'url', placeholder: f.topic === 'icerik' ? 'Paylaşım bağlantısı, mekan sayfası…' : 'Mekan sayfasının bağlantısı ya da adı ve ilçesi' })}
                            </Field>
                        )}
                        <Field label="Telefon (isteğe bağlı)">{input('phone', LIMITS.phone, { type: 'tel', inputMode: 'tel', autoComplete: 'tel' })}</Field>
                        <Field label="Mesajın" hint={`${f.message.length}/${LIMITS.message}`} error={err('message')}>
                            <textarea class="textarea" value={f.message} maxLength={LIMITS.message} onInput={e => set('message', (e.target as HTMLTextAreaElement).value)} />
                        </Field>
                    </div>

                    <label class="consent mt-16">
                        <input type="checkbox" checked={f.acknowledged} onChange={e => set('acknowledged', (e.target as HTMLInputElement).checked)} />
                        <span><a href="/gizlilik#iletisim" target="_blank">İletişim formu aydınlatma metnini</a> okudum. Bilgilerim yalnızca bu talebin yanıtlanması için işlenir.</span>
                    </label>
                    {err('acknowledged') && <p class="error-text mt-8">{err('acknowledged')}</p>}
                    {/* Bot tuzağı: insanlar görmez, doldurulursa Netlify kaydı spam sayar */}
                    <p hidden><label>Bu alanı boş bırak <input name="bot-field" tabIndex={-1} autoComplete="off" /></label></p>
                    <button type="submit" hidden />
                </form>

                <AsyncButton class="btn btn-primary btn-lg btn-block mt-24" onClick={submit}>Gönder</AsyncButton>
                {touched && Object.keys(errors).length > 0 && <p class="small center mt-8" style={{ color: 'var(--danger)' }}>İşaretli alanları kontrol et.</p>}
                <p class="tiny faint mt-16">Başvurunu Kişisel Verileri Koruma Kurumu'na şikayet hakkın saklıdır (KVKK m.14). Pub Skor bir mekan puanlama uygulamasıdır; alkollü içki satmaz, tanıtmaz, sipariş almaz.</p>
            </main>
        </>
    );
}
