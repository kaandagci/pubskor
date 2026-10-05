import { useEffect, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { newId } from '../../shared/ids';
import { fromLegacy } from '../../shared/legacy';
import { GROUP_LABEL, METRIC_BY_ID } from '../../shared/metrics';
import { analyze } from '../../shared/scoring';
import type { CrewSnapshot, Member } from '../../shared/types';
import { LIMITS } from '../../shared/validate';
import { APP_VERSION } from '../config';
import { request } from '../lib/api';
import { personClass } from '../lib/colors';
import { fmtDate, initials } from '../lib/format';
import { copyText, download, shareNative } from '../lib/share';
import { local } from '../lib/storage';
import { forgetCrewCache, mutate, syncCrew } from '../state/crew';
import { consent, setConsent } from '../state/consent';
import { deletedVisits, isOwner, me, snapshot, venueById, venueName } from '../state/data';
import { enqueue, storePhoto } from '../state/outbox';
import { activeMembership, memberships, removeMembership, updateMembership } from '../state/session';
import { applyTheme, confirmSheet, openSheet, themePref, toast, toastError, type ThemePref } from '../state/ui';
import { Avatar } from '../components/Avatar';
import { ChevronRight, Crown, Download, FileText, History, Link as LinkIcon, LogOut, QrCode, RefreshCw, Shield, Smartphone, Trash2, Undo2, Upload, UserPlus, Users } from '../components/icons';
import { QR } from '../components/QR';
import { AsyncButton, Segmented, Spinner, Switch, TopBar } from '../components/ui';
import { openInvite } from './crew';

function Row({ icon, title, sub, onClick, href, danger, right }: { icon: preact.ComponentChildren; title: string; sub?: string; onClick?: () => void; href?: string; danger?: boolean; right?: preact.ComponentChildren }) {
    const body = (<><span class="li-icon">{icon}</span><span class="li-body"><span class="li-title">{title}</span>{sub && <span class="li-sub">{sub}</span>}</span>{right ?? (onClick || href ? <ChevronRight class="chev" /> : null)}</>);
    if (href) return <a class={`list-item ${danger ? 'danger' : ''}`} href={href}>{body}</a>;
    if (onClick) return <button class={`list-item ${danger ? 'danger' : ''}`} onClick={onClick}>{body}</button>;
    return <div class="list-item">{body}</div>;
}

function ProfileSheet({ close }: { close: () => void }) {
    const m = me.value!;
    const [name, setName] = useState(m.name);
    const [color, setColor] = useState(m.color);
    return (
        <div>
            <div class="center mb-16"><span class={`avatar xl ${personClass(color)}`}>{initials(name || '?')}</span></div>
            <input class="input" value={name} maxLength={LIMITS.personName} onInput={e => setName((e.target as HTMLInputElement).value)} aria-label="Adın" />
            <div class="row-wrap mt-16" role="radiogroup" aria-label="Renk">
                {[0, 1, 2, 3, 4, 5, 6, 7].map(c => <button key={c} role="radio" aria-checked={c === color} class={`avatar ${personClass(c)}`} style={{ '--size': '38px', opacity: c === color ? 1 : 0.5 }} onClick={() => setColor(c)} aria-label={`Renk ${c + 1}`} />)}
            </div>
            <AsyncButton class="btn btn-primary btn-block mt-24" disabled={!name.trim()} onClick={async () => {
                try { await mutate('PATCH', '/api/crew/me', { name, color }); toast('Profil güncellendi'); close(); } catch (e) { toastError(e); }
            }}>Kaydet</AsyncButton>
        </div>
    );
}

function DeviceLink() {
    const m = activeMembership.value!;
    const url = `${location.origin}/bagla#${m.token}`;
    return (
        <div class="center">
            <QR value={url} label="Cihaz bağlama QR kodu" />
            <p class="muted small mt-16">Diğer telefonunun kamerasıyla okut; o cihaz da <b>{me.value?.name}</b> olarak ekibe bağlanır. <b>Bu kod sana özel giriş anahtarıdır; kimseyle paylaşma.</b></p>
            <button class="btn btn-secondary btn-block mt-16" onClick={async () => toast((await copyText(url)) ? 'Bağlantı kopyalandı' : 'Kopyalanamadı')}><LinkIcon />Bağlantıyı kopyala</button>
        </div>
    );
}

function MemberRow({ m }: { m: Member }) {
    const meId = me.value?.id;
    const menu = () => openSheet({
        title: m.name,
        render: close => (
            <div class="menu">
                <button class="menu-item" onClick={async () => {
                    close();
                    try {
                        const r = await mutate<{ token: string }>('POST', `/api/crew/members/${m.id}/relink`);
                        const url = `${location.origin}/bagla#${r.token}`;
                        openSheet({ title: `${m.name} için giriş bağlantısı`, render: () => <div class="center"><QR value={url} label="Giriş QR" /><p class="muted small mt-16">Cihazını kaybeden {m.name} bu kodla tekrar girebilir. Eski cihazlarının erişimi kapandı. Yalnızca {m.name} ile paylaş.</p><button class="btn btn-secondary btn-block mt-16" onClick={() => shareNative({ url }).then(ok => { if (!ok) void copyText(url).then(() => toast('Kopyalandı')); })}>Paylaş</button></div> });
                    } catch (e) { toastError(e); }
                }}><QrCode />Yeni giriş bağlantısı üret<span class="mi-sub">Cihazını kaybettiyse</span></button>
                <button class="menu-item" onClick={async () => {
                    close();
                    if (!(await confirmSheet({ title: `${m.name} ekip kurucusu olsun mu?`, body: 'Kurucu yetkileri ona geçer; sen normal üye olursun.', confirm: 'Devret' }))) return;
                    mutate('POST', `/api/crew/members/${m.id}/owner`).then(() => toast('Kuruculuk devredildi')).catch(toastError);
                }}><Crown />Kuruculuğu devret</button>
                <button class="menu-item danger" onClick={async () => {
                    close();
                    if (!(await confirmSheet({ title: `${m.name} ekipten çıkarılsın mı?`, body: 'Cihazlarının erişimi kapanır. Geçmiş puanları ekipte kalır.', confirm: 'Çıkar', danger: true }))) return;
                    mutate('DELETE', `/api/crew/members/${m.id}`).then(() => toast(`${m.name} çıkarıldı`, 'info')).catch(toastError);
                }}><Trash2 />Ekipten çıkar</button>
            </div>
        )
    });
    return (
        <div class="list-item">
            <Avatar p={m} size="sm" />
            <span class="li-body"><span class="li-title">{m.name}{m.id === meId ? ' (sen)' : ''}</span><span class="li-sub">{m.role === 'owner' ? 'Kurucu' : 'Üye'} · {fmtDate(new Date(m.joinedAt).toISOString().slice(0, 10), { short: true })}</span></span>
            {isOwner.value && m.id !== meId && <button class="btn btn-sm btn-ghost" onClick={menu}>Yönet</button>}
        </div>
    );
}

function LegacyImport() {
    const [info, setInfo] = useState<{ available: number; imported: boolean; needsKey: boolean } | null>(null);
    const [key, setKey] = useState('');
    const [progress, setProgress] = useState<string | null>(null);
    const m = activeMembership.value;
    useEffect(() => {
        if (!isOwner.value || !m) return;
        request('GET', '/api/crew/legacy', { token: m.token }).then(setInfo).catch(() => undefined);
    }, [m?.crewId]);
    if (!info || !info.available) return null;
    const run = async () => {
        let cursor: number | null = 0, total = 0;
        try {
            while (cursor != null) {
                setProgress(`${cursor} / ${info.available}`);
                const r: { next: number | null; imported: number; snapshot: CrewSnapshot } = await mutate('POST', '/api/crew/legacy', { cursor, adminKey: key || undefined });
                total += r.imported;
                cursor = r.next;
            }
            toast(`${total} eski kayıt ekibe aktarıldı`);
            setInfo({ ...info, imported: true });
        } catch (e) { toastError(e); }
        setProgress(null);
    };
    return (
        <section class="section" id="eski-arsiv">
            <div class="section-head"><h2>Eski ortak arşiv</h2></div>
            <div class="card card-pad">
                <p class="small muted">v7’deki herkese açık arşivde <b>{info.available}</b> kayıt var{info.imported ? ' ve bu ekibe aktarıldı.' : '. Ekibine aktarabilirsin; katılımcı adları ekip üyelerinin adlarıyla eşleşirse profillere bağlanır.'}</p>
                {info.needsKey && !info.imported && <input class="input mt-12" type="password" placeholder="Yönetici anahtarı (ADMIN_KEY)" value={key} onInput={e => setKey((e.target as HTMLInputElement).value)} autoComplete="off" />}
                <button class="btn btn-secondary btn-block mt-12" onClick={run} disabled={!!progress}>{progress ? <><Spinner small />{progress}</> : <><History />{info.imported ? 'Tekrar dene (yalnızca eksikler)' : 'Ekibe aktar'}</>}</button>
            </div>
        </section>
    );
}

/** Bu tarayıcıda v7'den kalmış (sunucuya hiç gönderilmemiş) kayıtlar. */
function LocalLegacy() {
    // v7 yerel arşivi; "pubskor_migrated" işaretliyse zaten ortak arşive yüklenmişti
    const raw = local.raw<boolean>('pubskor_migrated', false) ? [] : local.raw<unknown[]>('pubskor_archive', []);
    const done = local.get<boolean>('localLegacyDone', false);
    const list = raw.map(fromLegacy).filter((x): x is NonNullable<ReturnType<typeof fromLegacy>> => !!x);
    const s = snapshot.value;
    if (done || !list.length || !s) return null;
    const pending = list.filter(L => !s.visits.some(v => v.id === L.id));
    if (!pending.length) return null;
    const run = async () => {
        const byName = new Map(s.members.map(m => [m.name.toLocaleLowerCase('tr'), m.id]));
        for (const L of pending) {
            const photos = [];
            if (L.photoData) {
                try {
                    const blob = await (await fetch(L.photoData)).blob();
                    const id = newId.photo();
                    await storePhoto(id, blob);
                    photos.push({ id, w: 800, h: 600, type: blob.type || 'image/jpeg', uploaded: false });
                } catch { /* fotoğrafsız */ }
            }
            const participants = L.participants.map(p => ({ ...p, memberId: byName.get(p.name.toLocaleLowerCase('tr')) ?? null }));
            if (analyze({ participants, sheets: L.sheets, metrics: L.metrics }).score == null) continue;
            await enqueue({
                crewId: s.id, method: 'POST', photos,
                visit: { id: L.id, venue: { id: newId.venue(), name: L.name, area: L.location, kind: 'pub' }, date: L.date, participants, sheets: L.sheets, metrics: L.metrics, kinds: ['bira'], notes: L.notes, source: 'legacy' }
            });
        }
        local.set('localLegacyDone', true);
        toast(`${pending.length} yerel kayıt gönderim kuyruğuna alındı`);
    };
    return (
        <section class="section">
            <div class="section-head"><h2>Bu cihazdaki eski kayıtlar</h2></div>
            <div class="card card-pad">
                <p class="small muted">Bu tarayıcıda daha önce hiç paylaşılmamış {pending.length} eski Pub Skor kaydı bulundu.</p>
                <AsyncButton class="btn btn-secondary btn-block mt-12" onClick={run}><Upload />“{s.name}” ekibine aktar</AsyncButton>
            </div>
        </section>
    );
}

function exportJSON() {
    const s = snapshot.value;
    if (!s) return;
    const { invite, ...rest } = s;
    void invite;
    download(new Blob([JSON.stringify({ app: 'pubskor', version: 8, exportedAt: new Date().toISOString(), crew: rest }, null, 2)], { type: 'application/json' }), `pubskor_${s.name.replace(/\W+/g, '_')}_${new Date().toISOString().slice(0, 10)}.json`);
    toast('Yedek indirildi');
}

function exportCSV() {
    const s = snapshot.value;
    if (!s) return;
    const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [['tarih', 'mekan', 'semt', 'kişi', 'kriter', 'grup', 'puan', 'ziyaret_skoru'].join(';')];
    for (const v of s.visits.filter(x => !x.deletedAt)) {
        const ven = venueById.value.get(v.venueId);
        for (const p of v.participants) for (const id of v.metrics) {
            const val = v.sheets[p.id]?.[id];
            rows.push([v.date, q(ven?.name), q(ven?.area), q(p.name), q(METRIC_BY_ID[id].label), q(GROUP_LABEL[METRIC_BY_ID[id].group]), val === 0 ? 'yok' : val ?? '', String(v.score ?? '').replace('.', ',')].join(';'));
        }
    }
    download(new Blob(['﻿' + rows.join('\n')], { type: 'text/csv;charset=utf-8' }), `pubskor_puanlar_${new Date().toISOString().slice(0, 10)}.csv`);
    toast('CSV indirildi');
}

function Trash() {
    const list = deletedVisits.value;
    return (
        <div>
            {!list.length ? <p class="muted">Çöp kutusu boş.</p> : (
                <div class="list">
                    {list.map(v => (
                        <div class="list-item" key={v.id}>
                            <span class="li-body"><span class="li-title">{venueName(v.venueId)}</span><span class="li-sub">{fmtDate(v.date)} · {Math.max(0, 30 - Math.floor((Date.now() - (v.deletedAt ?? 0)) / 86400000))} gün sonra kalıcı silinir</span></span>
                            <button class="btn btn-sm btn-secondary" onClick={() => mutate('POST', `/api/crew/visits/${encodeURIComponent(v.id)}/restore`).then(() => toast('Geri alındı')).catch(toastError)}><Undo2 />Geri al</button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export function Settings() {
    const { route } = useLocation();
    const s = snapshot.value;
    const m = activeMembership.value;
    const owner = isOwner.value;
    const [crewName, setCrewName] = useState(s?.name ?? '');
    // Ekip verisi sayfa açıldıktan sonra gelirse alanı doldur
    useEffect(() => { if (s?.name) setCrewName(s.name); }, [s?.name]);

    const leaveDevice = async () => {
        if (!m) return;
        if (!(await confirmSheet({ title: 'Bu cihazdan çıkılsın mı?', body: `“${m.crewName}” bu cihazdan kaldırılır. Ekip ve verileri silinmez; başka cihazdan ya da yeni bir davetle geri dönebilirsin.`, confirm: 'Çık', danger: true }))) return;
        removeMembership(m.crewId);
        forgetCrewCache(m.crewId);
        toast('Bu cihazdan çıkıldı', 'info');
        route(memberships.value.length ? '/' : '/hosgeldin', true);
    };
    const leaveCrew = async () => {
        if (!m || !me.value) return;
        if (!(await confirmSheet({ title: 'Ekipten ayrılmak istiyor musun?', body: 'Tüm cihazlarının erişimi kapanır. Geçmiş puanların ekipte kalır.', confirm: 'Ekipten ayrıl', danger: true }))) return;
        try {
            await mutate('DELETE', `/api/crew/members/${me.value.id}`);
            removeMembership(m.crewId); forgetCrewCache(m.crewId);
            toast('Ekipten ayrıldın', 'info');
            route(memberships.value.length ? '/' : '/hosgeldin', true);
        } catch (e) { toastError(e); }
    };
    const logoutEverywhere = async () => {
        if (!(await confirmSheet({ title: 'Diğer tüm cihazlardan çıkılsın mı?', body: 'Bu cihaz bağlı kalır; diğer cihazlarının erişimi kapanır.', confirm: 'Çıkış yap' }))) return;
        try {
            const r = await mutate<{ token: string }>('POST', '/api/crew/me/token');
            if (m) updateMembership(m.crewId, { token: r.token });
            toast('Diğer cihazların erişimi kapatıldı');
        } catch (e) { toastError(e); }
    };
    const deleteCrew = () => {
        let typed = '';
        openSheet({
            title: 'Ekibi kalıcı olarak sil',
            render: close => (
                <div>
                    <p class="muted">Tüm ziyaretler, fotoğraflar ve paylaşım bağlantıları herkes için kalıcı olarak silinir. Geri alınamaz. Onaylamak için ekip adını yaz: <b>{s?.name}</b></p>
                    <input class="input mt-12" onInput={e => { typed = (e.target as HTMLInputElement).value; }} />
                    <AsyncButton class="btn btn-danger solid btn-block mt-16" onClick={async () => {
                        try {
                            await request('DELETE', '/api/crew', { token: m!.token, body: { confirm: typed } });
                            removeMembership(m!.crewId); forgetCrewCache(m!.crewId);
                            close(); toast('Ekip silindi', 'info');
                            route(memberships.value.length ? '/' : '/hosgeldin', true);
                        } catch (e) { toastError(e); }
                    }}><Trash2 />Ekibi sil</AsyncButton>
                </div>
            )
        });
    };

    return (
        <>
            <TopBar title="Ayarlar" back="/" />
            <main class="page">
                {me.value && (
                    <button class="card card-pad row" style={{ width: '100%', textAlign: 'left' }} onClick={() => openSheet({ title: 'Profilin', render: c => <ProfileSheet close={c} /> })}>
                        <Avatar p={me.value} size="lg" />
                        <span class="grow"><b style={{ fontSize: '17px' }}>{me.value.name}</b><span class="small muted" style={{ display: 'block' }}>{s?.name} · {owner ? 'Kurucu' : 'Üye'}</span></span>
                        <ChevronRight class="faint" />
                    </button>
                )}

                <section class="section">
                    <div class="section-head"><h2>Görünüm</h2></div>
                    <Segmented label="Tema" value={themePref.value} onChange={(v: ThemePref) => applyTheme(v)} options={[{ value: 'system', label: 'Sistem' }, { value: 'dark', label: 'Koyu' }, { value: 'light', label: 'Açık' }]} />
                </section>

                {s && (
                    <section class="section">
                        <div class="section-head"><h2>Ekip</h2></div>
                        {owner && (
                            <form class="row mb-12" onSubmit={e => { e.preventDefault(); mutate('PATCH', '/api/crew', { name: crewName }).then(() => toast('Ekip adı güncellendi')).catch(toastError); }}>
                                <input class="input grow" value={crewName} maxLength={LIMITS.crewName} onInput={e => setCrewName((e.target as HTMLInputElement).value)} aria-label="Ekip adı" />
                                <button class="btn btn-secondary" type="submit" disabled={!crewName.trim() || crewName === s.name}>Kaydet</button>
                            </form>
                        )}
                        <div class="list">
                            <Row icon={<UserPlus />} title="Davet et" sub="QR kod ya da bağlantı" onClick={openInvite} />
                            {s.members.filter(x => !x.removed).map(x => <MemberRow key={x.id} m={x} />)}
                        </div>
                    </section>
                )}

                <section class="section">
                    <div class="section-head"><h2>Bu cihaz</h2></div>
                    <div class="list">
                        {m && <Row icon={<Smartphone />} title="Başka cihazda aç" sub="Tabletin ya da diğer telefonun için QR" onClick={() => openSheet({ title: 'Başka cihazda aç', render: () => <DeviceLink /> })} />}
                        {m && <Row icon={<RefreshCw />} title="Diğer cihazlardan çıkış yap" sub="Kaybolan bir cihaz varsa" onClick={logoutEverywhere} />}
                        <Row icon={<Users />} title="Ekip değiştir / ekle" sub={`${memberships.value.length} ekip bu cihazda`} href="/" />
                        {m && <Row icon={<LogOut />} title="Bu cihazdan çık" onClick={leaveDevice} danger />}
                    </div>
                </section>

                {s && (
                    <section class="section">
                        <div class="section-head"><h2>Veriler</h2></div>
                        <div class="list">
                            <Row icon={<Download />} title="Yedekle (JSON)" sub="Ekibin tüm verileri" onClick={exportJSON} />
                            <Row icon={<FileText />} title="Puanları dışa aktar (CSV)" sub="Excel / Sheets için" onClick={exportCSV} />
                            <Row icon={<Trash2 />} title="Çöp kutusu" sub={`${deletedVisits.value.length} silinmiş ziyaret`} onClick={() => openSheet({ title: 'Çöp kutusu', render: () => <Trash /> })} />
                            <Row icon={<RefreshCw />} title="Şimdi eşitle" onClick={() => syncCrew({ force: true }).then(() => toast('Eşitlendi'))} />
                        </div>
                    </section>
                )}

                <LegacyImport />
                <LocalLegacy />

                <section class="section">
                    <div class="section-head"><h2>Gizlilik</h2></div>
                    <div class="list">
                        <div class="list-item">
                            <span class="li-icon"><Shield /></span>
                            <span class="li-body"><span class="li-title">Kişiselleştirilmiş reklam</span><span class="li-sub" style={{ whiteSpace: 'normal' }}>Şu an reklam yok. Eklenirse yalnızca izin verirsen kişiselleştirilir.</span></span>
                            <Switch checked={consent.value.ads} onChange={v => setConsent({ ads: v })} label="Kişiselleştirilmiş reklam" />
                        </div>
                        <div class="list-item">
                            <span class="li-icon"><Shield /></span>
                            <span class="li-body"><span class="li-title">Anonim kullanım istatistiği</span><span class="li-sub" style={{ whiteSpace: 'normal' }}>Şu an toplanmıyor.</span></span>
                            <Switch checked={consent.value.analytics} onChange={v => setConsent({ analytics: v })} label="Anonim kullanım istatistiği" />
                        </div>
                        <Row icon={<FileText />} title="Gizlilik ve KVKK aydınlatma metni" href="/gizlilik" />
                        <Row icon={<FileText />} title="Kullanım koşulları" href="/kosullar" />
                        <Row icon={<FileText />} title="Yasal bilgiler ve sorumlu tüketim" href="/yasal" />
                    </div>
                </section>

                {s && (owner ? (
                    <section class="section">
                        <div class="list"><Row icon={<Trash2 />} title="Ekibi kalıcı olarak sil" onClick={deleteCrew} danger /></div>
                    </section>
                ) : me.value && (
                    <section class="section">
                        <div class="list"><Row icon={<LogOut />} title="Ekipten ayrıl" onClick={leaveCrew} danger /></div>
                    </section>
                ))}

                <p class="tiny faint center mt-32">Pub Skor {APP_VERSION} · 18+ · Lütfen sorumlu tüketin · Bağımlılık desteği: YEDAM 115</p>
            </main>
        </>
    );
}
