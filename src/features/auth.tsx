// Hesap ekranları: karşılama, giriş, kayıt, profil tamamlama, şifre sıfırlama.
import { useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { LIMITS } from '../../shared/validate';
import { personClass } from '../lib/colors';
import { initials } from '../lib/format';
import { authMessage, authUser, googleLogin, login, requestRecovery, setPassword, signup } from '../lib/auth';
import { local } from '../lib/storage';
import { legacyMemberships } from '../state/session';
import { completeProfile, identityHint, loadMe, logout, profileStatus } from '../state/user';
import { toast } from '../state/ui';
import { ArrowLeft, Compass, LogOut, Users } from '../components/icons';
import { AppMark, ScoreRing } from '../components/ScoreRing';
import { AsyncButton, Field, TopBar } from '../components/ui';

// ----- Girişten sonra dönülecek adres (ör. davet bağlantısı) -----

export function rememberReturn(path: string) { local.set('return-to', path); }
export function takeReturn(): string {
    const p = local.get<string | null>('return-to', null);
    local.del('return-to');
    return p && p.startsWith('/') && !p.startsWith('//') ? p : '/';
}

function GoogleIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
        </svg>
    );
}

function GoogleButton() {
    return <button type="button" class="btn btn-secondary btn-lg btn-block" onClick={googleLogin}><GoogleIcon />Google ile devam et</button>;
}

function Divider() {
    return <div class="or-divider"><span>ya da e-postayla</span></div>;
}

function Consent({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: preact.ComponentChildren }) {
    return (
        <label class="consent">
            <input type="checkbox" checked={checked} onChange={e => onChange((e.target as HTMLInputElement).checked)} />
            <span>{children}</span>
        </label>
    );
}

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

// ----- Karşılama -----

export function Welcome() {
    const legacy = legacyMemberships().length > 0;
    return (
        <div class="welcome">
            <div class="brand-word"><AppMark size={32} />Pub Skor</div>
            <div class="welcome-art"><ScoreRing score={8.4} size={176} stroke={16} animate /></div>
            <h1>Masadaki herkesin puanı, <em>tek skor.</em></h1>
            <p>Mekan puanlama uygulaması: arkadaşlarınla gittiğiniz pub, bar, meyhane ve restoranların servisini, ortamını ve temizliğini birlikte puanlayın.</p>
            {legacy && (
                <div class="banner mt-16">
                    <span class="b-icon"><Users /></span>
                    <div class="grow"><b>Ekiplerin bu cihazda</b><div class="small muted">Hesap oluşturunca ya da giriş yapınca hesabına taşınır; başka telefonda da açabilirsin.</div></div>
                </div>
            )}
            <div class="stack gap-12 mt-32">
                <a href="/kayit" class="btn btn-primary btn-lg btn-block">Hesap oluştur</a>
                <a href="/giris" class="btn btn-secondary btn-lg btn-block">Giriş yap</a>
                <a href="/kesfet" class="btn btn-ghost btn-block"><Compass />Önce mekanlara göz at</a>
            </div>
            <p class="tiny faint center mt-24">18+ · Pub Skor alkollü içki satmaz, tanıtmaz, reklamını yapmaz. <a class="link-btn" href="/tanitim/" target="_top">Pub Skor nedir?</a> · <a class="link-btn" href="/iletisim">İletişim</a></p>
        </div>
    );
}

// ----- Giriş -----

export function SignIn() {
    const { route } = useLocation();
    const [email, setEmail] = useState('');
    const [password, setPw] = useState('');
    const [error, setError] = useState<string | null>(null);
    const submit = async () => {
        setError(null);
        try {
            await login(email, password);
            await loadMe();
            route(profileStatus.value === 'none' ? '/hesap/tamamla' : takeReturn(), true);
        } catch (e) { setError(authMessage(e)); }
    };
    return (
        <>
            <TopBar back="/hosgeldin" />
            <main class="page no-tabbar">
                <div class="page-head"><h1 class="display">Giriş yap</h1><p>Ekiplerin ve puanların hesabında; her telefonda aynı.</p></div>
                <GoogleButton />
                <Divider />
                <form onSubmit={e => { e.preventDefault(); void submit(); }}>
                    <Field label="E-posta"><input class="input" type="email" autoComplete="email" inputMode="email" value={email} onInput={e => setEmail((e.target as HTMLInputElement).value)} /></Field>
                    <Field label="Şifre" error={error}><input class="input" type="password" autoComplete="current-password" value={password} onInput={e => setPw((e.target as HTMLInputElement).value)} /></Field>
                    <button type="submit" hidden />
                </form>
                <AsyncButton class="btn btn-primary btn-lg btn-block mt-16" disabled={!email.trim() || !password} onClick={submit}>Giriş yap</AsyncButton>
                <div class="row mt-16" style={{ justifyContent: 'space-between' }}>
                    <a class="link-btn small" href="/sifre">Şifremi unuttum</a>
                    <a class="link-btn small" href="/kayit">Hesabın yok mu? Kayıt ol</a>
                </div>
            </main>
        </>
    );
}

// ----- Kayıt -----

export function SignUp() {
    const { route } = useLocation();
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPw] = useState('');
    const [adult, setAdult] = useState(false);
    const [terms, setTerms] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [sent, setSent] = useState(false);
    const valid = name.trim() && /\S+@\S+\.\S+/.test(email) && password.length >= 8 && adult && terms;

    const submit = async () => {
        setError(null);
        try {
            // Onaylar e-posta doğrulamasından sonra profil oluşturulurken kullanılır
            local.set('pending-profile', { name: name.trim(), color: 0, adult, terms });
            const r = await signup(email, password, name);
            if (r.confirm) { setSent(true); return; }
            await finishSignup();
            route(takeReturn(), true);
        } catch (e) { setError(authMessage(e)); }
    };

    if (sent) {
        return (
            <>
                <TopBar back="/hosgeldin" />
                <main class="page no-tabbar"><div class="empty mt-32">
                    <h3 class="display">E-postanı doğrula</h3>
                    <p><b>{email}</b> adresine bir bağlantı gönderdik. Bağlantıya dokununca hesabın açılır. Gelen kutunda yoksa gereksiz klasörüne bak.</p>
                    <a class="btn btn-secondary mt-16" href="/giris">Giriş ekranına dön</a>
                </div></main>
            </>
        );
    }
    return (
        <>
            <TopBar back="/hosgeldin" />
            <main class="page no-tabbar">
                <div class="page-head"><h1 class="display">Hesap oluştur</h1><p>Ücretsiz. Ekiplerin ve puanların her cihazda seninle.</p></div>
                <GoogleButton />
                <p class="tiny faint mt-8 center">Google ile devam edersen 18 yaş ve koşullar onayı bir sonraki adımda istenir.</p>
                <Divider />
                <form onSubmit={e => { e.preventDefault(); if (valid) void submit(); }}>
                    <Field label="Adın" hint="Ekiplerde görünecek isim"><input class="input" value={name} maxLength={LIMITS.personName} autoComplete="given-name" onInput={e => setName((e.target as HTMLInputElement).value)} /></Field>
                    <Field label="E-posta"><input class="input" type="email" autoComplete="email" inputMode="email" value={email} onInput={e => setEmail((e.target as HTMLInputElement).value)} /></Field>
                    <Field label="Şifre" hint="En az 8 karakter" error={error}><input class="input" type="password" autoComplete="new-password" minLength={8} value={password} onInput={e => setPw((e.target as HTMLInputElement).value)} /></Field>
                    <div class="stack gap-8 mt-16">
                        <Consent checked={adult} onChange={setAdult}>18 yaşından büyüğüm.</Consent>
                        <Consent checked={terms} onChange={setTerms}><a href="/kosullar" target="_blank">Kullanım koşullarını</a> kabul ediyorum, <a href="/gizlilik" target="_blank">aydınlatma metnini</a> okudum.</Consent>
                    </div>
                    <button type="submit" hidden />
                </form>
                <AsyncButton class="btn btn-primary btn-lg btn-block mt-24" disabled={!valid} onClick={submit}>Hesap oluştur</AsyncButton>
                <p class="small muted center mt-16">Hesabın var mı? <a class="link-btn" href="/giris">Giriş yap</a></p>
            </main>
        </>
    );
}

/** Kayıttan (ya da e-posta doğrulamasından) sonra: onaylar alındıysa profil `loadMe` içinde oluşturulur. */
export const finishSignup = () => loadMe();

// ----- Profil tamamlama (Google ile ilk giriş) -----

export function CompleteProfile() {
    const { route } = useLocation();
    const hint = identityHint.value;
    const [name, setName] = useState(hint?.name || authUser.value?.name || '');
    const [color, setColor] = useState(0);
    const [adult, setAdult] = useState(false);
    const [terms, setTerms] = useState(false);
    const valid = name.trim() && adult && terms;
    const submit = async () => {
        try {
            await completeProfile({ name: name.trim(), color, adult, terms });
            toast(`Hoş geldin, ${name.trim()}!`);
            route(takeReturn(), true);
        } catch (e) { toast(e instanceof Error ? e.message : 'Kaydedilemedi', 'error'); }
    };
    return (
        <>
            <TopBar left={<button class="icon-btn" aria-label="Çıkış" onClick={() => void logout().then(() => route('/hosgeldin', true))}><LogOut /></button>} />
            <main class="page no-tabbar">
                <div class="page-head"><h1 class="display">Son bir adım</h1><p>{hint?.email ?? authUser.value?.email} ile giriş yaptın. Ekiplerde görünecek adını seç.</p></div>
                <Field label="Adın"><input class="input input-lg" value={name} maxLength={LIMITS.personName} autoFocus onInput={e => setName((e.target as HTMLInputElement).value)} /></Field>
                <div class="field"><span class="label">Rengin</span><ColorPicker value={color} onChange={setColor} name={name} /></div>
                <div class="stack gap-8 mt-16">
                    <Consent checked={adult} onChange={setAdult}>18 yaşından büyüğüm.</Consent>
                    <Consent checked={terms} onChange={setTerms}><a href="/kosullar" target="_blank">Kullanım koşullarını</a> kabul ediyorum, <a href="/gizlilik" target="_blank">aydınlatma metnini</a> okudum.</Consent>
                </div>
            </main>
            <div class="actionbar"><div class="actionbar-inner">
                <AsyncButton class="btn btn-primary btn-lg" disabled={!valid} onClick={submit}>Devam</AsyncButton>
            </div></div>
        </>
    );
}

// ----- Şifre -----

export function ForgotPassword() {
    const [email, setEmail] = useState('');
    const [sent, setSent] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const submit = async () => {
        setError(null);
        try { await requestRecovery(email); setSent(true); } catch (e) { setError(authMessage(e)); }
    };
    return (
        <>
            <TopBar back="/giris" />
            <main class="page no-tabbar">
                <div class="page-head"><h1 class="display">Şifreni sıfırla</h1><p>Hesabının e-posta adresini yaz; şifreni yenilemen için bir bağlantı gönderelim.</p></div>
                {sent ? (
                    <div class="banner"><div class="grow"><b>Bağlantı gönderildi</b><div class="small muted">{email} adresinin gelen kutusuna (ve gereksiz klasörüne) bak.</div></div></div>
                ) : (
                    <>
                        <Field label="E-posta" error={error}><input class="input" type="email" autoComplete="email" value={email} autoFocus onInput={e => setEmail((e.target as HTMLInputElement).value)} /></Field>
                        <AsyncButton class="btn btn-primary btn-lg btn-block mt-16" disabled={!/\S+@\S+\.\S+/.test(email)} onClick={submit}>Bağlantı gönder</AsyncButton>
                    </>
                )}
                <a class="link-btn small mt-24" style={{ display: 'inline-flex' }} href="/giris"><ArrowLeft size={14} />Girişe dön</a>
            </main>
        </>
    );
}

/** Şifre sıfırlama bağlantısından sonra yeni şifre. */
export function NewPassword() {
    const { route } = useLocation();
    const [pw, setPw] = useState('');
    const [pw2, setPw2] = useState('');
    const [error, setError] = useState<string | null>(null);
    const submit = async () => {
        setError(null);
        try {
            await setPassword(pw);
            toast('Şifren güncellendi');
            await loadMe();
            route(profileStatus.value === 'none' ? '/hesap/tamamla' : '/', true);
        } catch (e) { setError(authMessage(e)); }
    };
    return (
        <>
            <TopBar />
            <main class="page no-tabbar">
                <div class="page-head"><h1 class="display">Yeni şifre</h1><p>{authUser.value?.email}</p></div>
                <Field label="Yeni şifre" hint="En az 8 karakter"><input class="input" type="password" autoComplete="new-password" value={pw} autoFocus onInput={e => setPw((e.target as HTMLInputElement).value)} /></Field>
                <Field label="Tekrar" error={error ?? (pw2 && pw !== pw2 ? 'Şifreler aynı değil' : null)}><input class="input" type="password" autoComplete="new-password" value={pw2} onInput={e => setPw2((e.target as HTMLInputElement).value)} /></Field>
                <AsyncButton class="btn btn-primary btn-lg btn-block mt-16" disabled={pw.length < 8 || pw !== pw2} onClick={submit}>Şifreyi kaydet</AsyncButton>
            </main>
        </>
    );
}
