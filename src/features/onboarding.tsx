import { useEffect, useState } from 'preact/hooks';
import { useLocation, useRoute } from 'preact-iso';
import type { CrewSnapshot } from '../../shared/types';
import { LIMITS } from '../../shared/validate';
import { ApiError, request } from '../lib/api';
import { personClass } from '../lib/colors';
import { initials } from '../lib/format';
import { local } from '../lib/storage';
import { applySnapshot, syncCrew } from '../state/crew';
import { authUser } from '../lib/auth';
import { addMembership, memberships } from '../state/session';
import { profile, profileStatus } from '../state/user';
import { rememberReturn } from './auth';
import { toast } from '../state/ui';
import { Avatar } from '../components/Avatar';
import { ArrowLeft, Check } from '../components/icons';
import { AsyncButton, Field, Loading, Segmented, TopBar } from '../components/ui';
import { PUBLIC_DELAY_LABEL, publicNameOk, type PublicMode } from '../../shared/public';

const COLORS = [0, 1, 2, 3, 4, 5, 6, 7];

function ColorPicker({ value, onChange, name }: { value: number; onChange: (c: number) => void; name: string }) {
    return (
        <div class="row-wrap" role="radiogroup" aria-label="Renk">
            {COLORS.map(c => (
                <button key={c} type="button" role="radio" aria-checked={value === c} onClick={() => onChange(c)}
                    class={`avatar ${personClass(c)}`} style={{ '--size': '40px', ...(value === c ? { boxShadow: '0 0 0 2px var(--bg), 0 0 0 4px var(--accent)' } : { opacity: .55 }) }}
                    aria-label={`Renk ${c + 1}`}>
                    {value === c ? initials(name || '?') : ''}
                </button>
            ))}
        </div>
    );
}

export function CreateCrew() {
    const { route } = useLocation();
    const [crewName, setCrewName] = useState('');
    const [name, setName] = useState(profile.value?.name ?? local.raw<{ name: string }[] | null>('pubskor_roster', null)?.[0]?.name ?? '');
    const [color, setColor] = useState(profile.value?.color ?? 0);
    const [publicMode, setPublicMode] = useState<PublicMode>('anon');
    const valid = crewName.trim() && name.trim();
    const submit = async () => {
        try {
            const r = await request<{ snapshot: CrewSnapshot }>('POST', '/api/auth/crew', { body: { crewName, name, color, publicMode } });
            addMembership({ crewId: r.snapshot.id, crewName: r.snapshot.name, memberId: r.snapshot.me, role: 'owner' });
            applySnapshot(r.snapshot);
            toast('Ekip kuruldu!');
            route('/', true);
        } catch (e) {
            toast(e instanceof Error ? e.message : 'Ekip kurulamadı', 'error');
        }
    };
    return (
        <>
            <TopBar back="/" />
            <main class="page no-tabbar">
                <div class="page-head">
                    <h1 class="display">Ekibini kur</h1>
                    <p>Ekip; birlikte gezdiğin arkadaş grubun. Ziyaretler, kişiler, notlar ve fotoğraflar yalnızca ekip üyelerine görünür.</p>
                </div>
                <form class="card card-pad-lg" onSubmit={e => { e.preventDefault(); if (valid) void submit(); }}>
                    <Field label="Ekip adı" hint="Örn. Cuma Akşamcıları, Ofis Ekibi">
                        <input class="input input-lg" value={crewName} maxLength={LIMITS.crewName} placeholder="Ekibin adı" autoFocus onInput={e => setCrewName((e.target as HTMLInputElement).value)} />
                    </Field>
                    <Field label="Bu ekipteki adın" hint="Masada görünecek isim">
                        <input class="input" value={name} maxLength={LIMITS.personName} placeholder="Adın" autoComplete="given-name" onInput={e => setName((e.target as HTMLInputElement).value)} />
                    </Field>
                    <div class="field"><span class="label">Rengin</span><ColorPicker value={color} onChange={setColor} name={name} /></div>
                    <div class="field">
                        <span class="label">Puanlarınız toplulukta nasıl görünsün?</span>
                        <Segmented label="Toplulukta görünüm" value={publicMode} onChange={setPublicMode}
                            options={[{ value: 'anon', label: 'Takma adla' }, { value: 'named', label: 'Ekip adıyla' }, { value: 'off', label: 'Kapalı' }]} />
                        <p class="hint mt-8">
                            {publicMode === 'off'
                                ? 'Puanlarınız yalnızca ekibinizde kalır.'
                                : publicMode === 'named' && crewName.trim() && !publicNameOk(crewName)
                                    ? 'Bu ad içki ya da marka adı, hakaret veya iletişim bilgisi içerdiği için toplulukta gösterilmez; yerine takma ad görünür.'
                                    : `Diğer ekipler mekan, gün ve skoru ${publicMode === 'named' ? 'ekip adınızla' : 'size özel bir takma adla'} görür; kişi adları, notlar ve fotoğraflar asla paylaşılmaz. Yeni puanlar ${PUBLIC_DELAY_LABEL} sonra görünür.`}
                            {' '}Sonra Ayarlar'dan değiştirebilirsin.
                        </p>
                    </div>
                    <button type="submit" hidden />
                </form>
            </main>
            <div class="actionbar"><div class="actionbar-inner">
                <AsyncButton class="btn btn-primary btn-lg" disabled={!valid} onClick={submit}>Ekibi kur</AsyncButton>
            </div></div>
        </>
    );
}

/** Davet bağlantısını ya da kodu yapıştırma ekranı. */
export function PasteInvite() {
    const { route } = useLocation();
    const [text, setText] = useState('');
    const go = () => {
        const m = /\/katil\/(c_[\w-]{14})#([\w-]{16,64})/.exec(text.trim());
        if (!m) { toast('Bu bir Pub Skor davet bağlantısına benzemiyor', 'error'); return; }
        route(`/katil/${m[1]}#${m[2]}`);
    };
    return (
        <>
            <TopBar back="/hosgeldin" />
            <main class="page no-tabbar">
                <div class="page-head">
                    <h1 class="display">Davetle katıl</h1>
                    <p>Ekipten birinin gönderdiği bağlantıyı aç ya da buraya yapıştır. QR kodu telefon kamerasıyla okutman da yeterli.</p>
                </div>
                <Field label="Davet bağlantısı">
                    <input class="input" value={text} placeholder="https://…/katil/…" autoFocus onInput={e => setText((e.target as HTMLInputElement).value)} />
                </Field>
            </main>
            <div class="actionbar"><div class="actionbar-inner">
                <button class="btn btn-primary btn-lg" disabled={!text.trim()} onClick={go}>Devam</button>
            </div></div>
        </>
    );
}

interface Preview {
    crewId: string;
    name: string;
    visits: number;
    members: { id: string; name: string; color: number }[];
    guests: { key: string; name: string; visits: number }[];
    alreadyMember: string | null;
}

export function JoinCrew() {
    const { params } = useRoute();
    const { route } = useLocation();
    const invite = typeof location !== 'undefined' ? location.hash.slice(1) : '';
    const [pv, setPv] = useState<Preview | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [name, setName] = useState(profile.value?.name ?? '');
    const [guestKey, setGuestKey] = useState<string | null>(null);
    const existing = memberships.value.find(m => m.crewId === params.crewId);

    useEffect(() => {
        request<Preview>('POST', '/api/auth/preview', { body: { crewId: params.crewId, invite }, token: existing?.token ?? null })
            .then(setPv)
            .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Davet açılamadı'));
    }, [params.crewId]);

    if (existing && pv?.alreadyMember) {
        return (
            <main class="page no-tabbar"><div class="empty mt-32">
                <h3 class="display">Zaten “{pv.name}” ekibindesin</h3>
                <p>Bu cihaz ekibe bağlı.</p>
                <a class="btn btn-primary" href="/">Ekibe git</a>
            </div></main>
        );
    }
    if (error) {
        return (
            <>
                <TopBar back="/hosgeldin" />
                <main class="page no-tabbar"><div class="empty mt-32">
                    <h3 class="display">Davet açılamadı</h3>
                    <p>{error}. Ekipten güncel bir bağlantı iste.</p>
                    <a class="btn btn-secondary" href="/hosgeldin"><ArrowLeft />Geri dön</a>
                </div></main>
            </>
        );
    }
    if (!pv) return <Loading label="Davet açılıyor" />;

    // Katılmak için hesap gerekir: girişten sonra bu davete geri dönülür
    if (!authUser.value || profileStatus.value === 'none') {
        const back = location.pathname + location.hash;
        return (
            <>
                <TopBar back="/hosgeldin" />
                <main class="page no-tabbar">
                    <div class="card card-pad-lg center">
                        <span class="eyebrow">Ekip daveti</span>
                        <h1 class="display mt-8" style={{ fontSize: '30px' }}>{pv.name}</h1>
                        <p class="muted mt-8">{pv.members.length} üye · {pv.visits} ziyaret</p>
                        <div class="row-wrap mt-16" style={{ justifyContent: 'center' }}>{pv.members.slice(0, 10).map(m => <Avatar key={m.id} p={m} />)}</div>
                    </div>
                    <p class="muted center mt-24">Ekibe katılmak için hesabınla giriş yap. Ücretsiz ve tek seferlik.</p>
                    <div class="stack gap-12 mt-16">
                        <a class="btn btn-primary btn-lg btn-block" href="/kayit" onClick={() => rememberReturn(back)}>Hesap oluştur ve katıl</a>
                        <a class="btn btn-secondary btn-lg btn-block" href="/giris" onClick={() => rememberReturn(back)}>Giriş yap</a>
                    </div>
                </main>
            </>
        );
    }

    const pickGuest = (g: Preview['guests'][number]) => {
        if (guestKey === g.key) { setGuestKey(null); return; }
        setGuestKey(g.key);
        if (!name.trim()) setName(g.name);
    };
    const submit = async () => {
        try {
            const r = await request<{ snapshot: CrewSnapshot }>('POST', '/api/auth/join', { body: { crewId: pv.crewId, invite, name, guestKey } });
            addMembership({ crewId: r.snapshot.id, crewName: r.snapshot.name, memberId: r.snapshot.me, role: 'member' });
            applySnapshot(r.snapshot);
            history.replaceState(null, '', '/');
            toast(`“${r.snapshot.name}” ekibine hoş geldin!`);
            route('/', true);
        } catch (e) {
            toast(e instanceof ApiError ? e.message : 'Katılınamadı', 'error');
        }
    };
    return (
        <>
            <TopBar back="/hosgeldin" />
            <main class="page no-tabbar">
                <div class="card card-pad-lg center">
                    <span class="eyebrow">Ekip daveti</span>
                    <h1 class="display mt-8" style={{ fontSize: '30px' }}>{pv.name}</h1>
                    <p class="muted mt-8">{pv.members.length} üye · {pv.visits} ziyaret</p>
                    <div class="row-wrap mt-16" style={{ justifyContent: 'center' }}>
                        {pv.members.slice(0, 10).map(m => <Avatar key={m.id} p={m} />)}
                    </div>
                </div>
                <div class="section">
                    <Field label="Bu ekipteki adın">
                        <input class="input input-lg" value={name} maxLength={LIMITS.personName} placeholder="Masada görünecek adın" autoFocus onInput={e => setName((e.target as HTMLInputElement).value)} />
                    </Field>
                </div>
                {pv.guests.length > 0 && (
                    <div class="section">
                        <div class="section-head"><h2>Daha önce misafir olarak puan verdin mi?</h2></div>
                        <p class="muted small mb-12">Kendini seçersen geçmiş puanların profiline bağlanır.</p>
                        <div class="row-wrap">
                            {pv.guests.map(g => (
                                <button key={g.key} type="button" class="chip" aria-pressed={guestKey === g.key} onClick={() => pickGuest(g)}>
                                    {guestKey === g.key && <Check />}{g.name}<span class="faint">· {g.visits}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </main>
            <div class="actionbar"><div class="actionbar-inner">
                <AsyncButton class="btn btn-primary btn-lg" disabled={!name.trim()} onClick={submit}>Ekibe katıl</AsyncButton>
            </div></div>
        </>
    );
}

/** Başka cihazdan gelen "bu cihaza bağla" bağlantısı: /bagla#<jeton> */
export function LinkDevice() {
    const { route } = useLocation();
    const [error, setError] = useState<string | null>(null);
    useEffect(() => {
        const token = location.hash.slice(1);
        history.replaceState(null, '', '/bagla');
        if (!/^m1\.c_[\w-]{14}\.m_[\w-]{10}\.[\w-]{20,}$/.test(token)) { setError('Bağlantı geçersiz'); return; }
        request<CrewSnapshot>('GET', '/api/crew', { token })
            .then(s => {
                addMembership({ crewId: s.id, crewName: s.name, memberId: s.me, token });
                applySnapshot(s);
                void syncCrew();
                toast(`Bu cihaz “${s.name}” ekibine bağlandı`);
                route('/', true);
            })
            .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Bağlanılamadı'));
    }, []);
    if (!error) return <Loading label="Cihaz bağlanıyor" />;
    return (
        <main class="page no-tabbar"><div class="empty mt-32">
            <h3 class="display">Cihaz bağlanamadı</h3>
            <p>{error}. Bağlantı yenilenmiş olabilir; diğer cihazdan yenisini oluştur.</p>
            <a class="btn btn-secondary" href="/">Ana sayfa</a>
        </div></main>
    );
}
