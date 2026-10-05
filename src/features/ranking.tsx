import { useMemo, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { GROUPS, GROUP_LABEL, METRICS, METRIC_BY_ID, VENUE_TAGS, tagLabel, venueKindLabel, type GroupId, type MetricId } from '../../shared/metrics';
import { rankVenues, type RankKey } from '../../shared/insights';
import { LIMITS } from '../../shared/validate';
import { fmtRelativeDay, fmtScore } from '../lib/format';
import { mutate } from '../state/crew';
import { membersById, venueSummaries, wishlist } from '../state/data';
import { confirmSheet, openSheet, toast, toastError } from '../state/ui';
import { Bookmark, BookmarkPlus, Compass, Plus, Trash2, Trophy } from '../components/icons';
import { Spark } from '../components/charts';
import { Pint } from '../components/Pint';
import { Empty, TopBar } from '../components/ui';
import { VenuePicker, type VenueChoice } from './venue-picker';

type Tab = 'rank' | 'wish';

export function Ranking() {
    const { query, route } = useLocation();
    const [tab, setTab] = useState<Tab>(query.liste === 'gidilecek' ? 'wish' : 'rank');
    const [cat, setCat] = useState<'overall' | GroupId>('overall');
    const [metric, setMetric] = useState<MetricId | null>(null);
    const [tags, setTags] = useState<string[]>([]);
    const [showTags, setShowTags] = useState(false);

    const all = venueSummaries.value;
    const cats = useMemo(() => GROUPS.filter(g => all.some(s => s.groups[g.id] != null)), [all]);
    const metricsInCat = cat === 'overall' ? [] : METRICS.filter(m => m.group === cat && all.some(s => s.metricAvg[m.id] != null));
    const key: RankKey = metric ?? cat;
    const ranked = useMemo(() => {
        const pool = tags.length ? all.filter(s => tags.every(t => (s.venue.tags as string[]).includes(t))) : all;
        return rankVenues(pool, key);
    }, [all, key, tags.join()]);
    const usedTags = VENUE_TAGS.filter(t => all.some(s => (s.venue.tags as string[]).includes(t.id)));
    const title = metric ? METRIC_BY_ID[metric].label : cat === 'overall' ? 'Genel skor' : GROUP_LABEL[cat];
    const top = ranked.slice(0, 3);
    const rest = ranked.slice(3);

    return (
        <>
            <TopBar title="Mekanlar" actions={<a class="btn btn-sm btn-secondary" href="/oneri"><Compass />Nereye gidelim?</a>} />
            <main class="page">
                <div class="segmented mb-16" role="tablist">
                    <button role="tab" aria-pressed={tab === 'rank'} onClick={() => { setTab('rank'); route('/siralama', true); }}><Trophy size={15} style={{ verticalAlign: '-2px', marginRight: '6px' }} />Sıralama</button>
                    <button role="tab" aria-pressed={tab === 'wish'} onClick={() => { setTab('wish'); route('/siralama?liste=gidilecek', true); }}><Bookmark size={15} style={{ verticalAlign: '-2px', marginRight: '6px' }} />Gidilecekler{wishlist.value.length ? ` · ${wishlist.value.length}` : ''}</button>
                </div>

                {tab === 'wish' ? <Wishlist /> : !ranked.length && !tags.length ? (
                    <Empty art={<Pint score={3} size={80} />} title="Sıralama henüz boş" action={<a class="btn btn-primary" href="/yeni"><Plus />Ziyaret ekle</a>}>
                        Puanladığınız mekanlar burada kategorilere göre sıralanır.
                    </Empty>
                ) : (
                    <>
                        <div class="chip-scroll" role="group" aria-label="Kategori">
                            <button class="chip" aria-pressed={cat === 'overall'} onClick={() => { setCat('overall'); setMetric(null); }}>Genel</button>
                            {cats.map(g => <button key={g.id} class="chip" aria-pressed={cat === g.id} onClick={() => { setCat(g.id); setMetric(null); }}>{g.label}</button>)}
                            {usedTags.length > 0 && <button class="chip" aria-pressed={showTags || tags.length > 0} onClick={() => setShowTags(!showTags)}>Özellikler{tags.length ? ` · ${tags.length}` : ''}</button>}
                        </div>
                        {metricsInCat.length > 1 && (
                            <div class="chip-scroll mt-8" role="group" aria-label="Kriter">
                                <button class="chip" aria-pressed={!metric} onClick={() => setMetric(null)}>Tümü</button>
                                {metricsInCat.map(m => <button key={m.id} class="chip" aria-pressed={metric === m.id} onClick={() => setMetric(m.id)}>{m.short}</button>)}
                            </div>
                        )}
                        {showTags && (
                            <div class="row-wrap mt-8">
                                {usedTags.map(t => <button key={t.id} class="chip" aria-pressed={tags.includes(t.id)} onClick={() => setTags(tags.includes(t.id) ? tags.filter(x => x !== t.id) : [...tags, t.id])}>{t.label}</button>)}
                            </div>
                        )}

                        <h2 class="display mt-24" style={{ fontSize: '22px' }}>{title}</h2>
                        {tags.length > 0 && <p class="small faint">{tags.map(tagLabel).join(' · ')}</p>}
                        {!ranked.length ? <p class="muted mt-16">Bu filtreyle eşleşen mekan yok.</p> : (
                            <>
                                {top.length >= 3 && (
                                    <div class="podium mt-16">
                                        {[top[1], top[0], top[2]].map((r, i) => (
                                            <a key={r.s.venue.id} href={`/mekan/${r.s.venue.id}`} class={`podium-item ${['second', 'first', 'third'][i]}`}>
                                                <Pint score={r.value} size={i === 1 ? 46 : 36} />
                                                <div class="p-val">{fmtScore(r.value)}</div>
                                                <div class="p-name">{r.s.venue.name}</div>
                                                <div class="podium-step">{[2, 1, 3][i]}</div>
                                            </a>
                                        ))}
                                    </div>
                                )}
                                <div class="list mt-16">
                                    {(top.length >= 3 ? rest : ranked).map((r, i) => (
                                        <a class="rank-row" key={r.s.venue.id} href={`/mekan/${r.s.venue.id}`}>
                                            <span class="rank-n">{(top.length >= 3 ? 4 : 1) + i}</span>
                                            <div class="grow" style={{ minWidth: 0 }}>
                                                <div class="vrow-title" style={{ fontSize: '16.5px' }}>{r.s.venue.name}</div>
                                                <div class="vrow-meta">{[venueKindLabel(r.s.venue.kind), r.s.venue.area, `${r.s.count} ziyaret`].filter(Boolean).join(' · ')}</div>
                                            </div>
                                            <Spark values={r.s.trend.map(t => t.score)} />
                                            <span class="rank-val">{fmtScore(r.value)}</span>
                                        </a>
                                    ))}
                                </div>
                            </>
                        )}
                    </>
                )}
            </main>
        </>
    );
}

export function addToWishlist(preset?: VenueChoice) {
    let choice: VenueChoice | null = preset ?? null;
    let note = '';
    const save = async (close: () => void) => {
        if (!choice) return;
        try {
            await mutate('POST', '/api/crew/wishlist', choice.venueId ? { venueId: choice.venueId, note } : { venue: choice.venue, note });
            toast('Gidilecekler listesine eklendi');
            close();
        } catch (e) { toastError(e); }
    };
    openSheet({
        title: 'Gidilecekler listesine ekle',
        render: close => <WishForm initial={choice} onChoice={c => { choice = c; }} onNote={n => { note = n; }} onSave={() => save(close)} />
    });
}

function WishForm({ initial, onChoice, onNote, onSave }: { initial: VenueChoice | null; onChoice: (c: VenueChoice) => void; onNote: (n: string) => void; onSave: () => void }) {
    const [choice, setChoice] = useState<VenueChoice | null>(initial);
    if (!choice) return <VenuePicker onPick={c => { setChoice(c); onChoice(c); }} />;
    return (
        <div>
            <div class="card card-pad row">
                <BookmarkPlus style={{ color: 'var(--accent)' }} />
                <b class="grow">{choice.venue.name}</b>
                <button class="link-btn small" onClick={() => setChoice(null)}>Değiştir</button>
            </div>
            <input class="input mt-12" placeholder="Not (örn. Negroni'si övülüyor)" maxLength={LIMITS.wishNote} autoFocus onInput={e => onNote((e.target as HTMLInputElement).value)} />
            <button class="btn btn-primary btn-block mt-16" onClick={onSave}>Listeye ekle</button>
        </div>
    );
}

function Wishlist() {
    const list = wishlist.value;
    if (!list.length) {
        return (
            <Empty art={<Bookmark size={56} style={{ color: 'var(--accent)', margin: '0 auto' }} />} title="Gidilecek yer yok" action={<button class="btn btn-primary" onClick={() => addToWishlist()}><Plus />Mekan ekle</button>}>
                Duyduğunuz, merak ettiğiniz mekanları ekleyin; gidince puanlarsınız ve listeden kendiliğinden düşer.
            </Empty>
        );
    }
    return (
        <>
            <div class="list">
                {list.map(v => {
                    const by = v.wish?.by ? membersById.value.get(v.wish.by)?.name : null;
                    return (
                        <div class="list-item" key={v.id}>
                            <span class="li-icon" style={{ color: 'var(--accent)', background: 'var(--accent-soft)' }}><Bookmark /></span>
                            <a class="li-body" href={`/mekan/${v.id}`}>
                                <span class="li-title">{v.name}</span>
                                <span class="li-sub" style={{ whiteSpace: 'normal' }}>{[venueKindLabel(v.kind), v.area, v.wish?.note ? `“${v.wish.note}”` : null, by ? `${by} ekledi · ${fmtRelativeDay(new Date(v.wish!.at).toISOString().slice(0, 10))}` : null].filter(Boolean).join(' · ')}</span>
                            </a>
                            <a class="btn btn-sm btn-primary" href={`/yeni?mekan=${v.id}`}>Git</a>
                            <button class="icon-btn" aria-label="Listeden çıkar" onClick={async () => {
                                if (!(await confirmSheet({ title: `${v.name} listeden çıkarılsın mı?`, confirm: 'Çıkar', danger: true }))) return;
                                mutate('DELETE', `/api/crew/wishlist/${v.id}`).catch(toastError);
                            }}><Trash2 /></button>
                        </div>
                    );
                })}
            </div>
            <button class="btn btn-secondary btn-block mt-16" onClick={() => addToWishlist()}><Plus />Mekan ekle</button>
        </>
    );
}
