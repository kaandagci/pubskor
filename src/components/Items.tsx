import { useMemo, useState } from 'preact/hooks';
import { KINDS, type KindId } from '../../shared/metrics';
import { secret } from '../../shared/ids';
import { foldKey } from '../../shared/text';
import type { OrderItem, Verdict } from '../../shared/types';
import { LIMITS } from '../../shared/validate';
import { fmtMoney } from '../lib/format';
import { visits } from '../state/data';
import { toast } from '../state/ui';
import { KIND_ICONS, Plus, ThumbsDown, ThumbsUp, X } from './icons';

const VERDICTS: { id: Verdict; label: string }[] = [
    { id: 'top', label: 'Harika' },
    { id: 'ok', label: 'İyi' },
    { id: 'bad', label: 'Kötü' }
];

export function VerdictIcon({ v }: { v: Verdict | null }) {
    if (v === 'top') return <ThumbsUp size={15} style={{ color: 'var(--ok)' }} aria-label="Harika" />;
    if (v === 'bad') return <ThumbsDown size={15} style={{ color: 'var(--danger)' }} aria-label="Kötü" />;
    return null;
}

/** Sipariş defteri: masada ne içildi / yendi, fiyatı ve masanın kararı. */
export function ItemsEditor({ items, kinds, venueId, onChange }: { items: OrderItem[]; kinds: KindId[]; venueId: string | null; onChange: (items: OrderItem[]) => void }) {
    const [name, setName] = useState('');
    const [price, setPrice] = useState('');
    const [kind, setKind] = useState<KindId>(kinds[0] ?? 'bira');
    const kindOptions = KINDS.filter(k => kinds.includes(k.id)).length ? KINDS.filter(k => kinds.includes(k.id)) : KINDS;

    // Bu mekanda daha önce sipariş edilenler (hızlı ekleme)
    const past = useMemo(() => {
        if (!venueId) return [];
        const seen = new Map<string, OrderItem>();
        for (const v of visits.value) if (v.venueId === venueId) for (const it of v.items ?? []) if (!seen.has(foldKey(it.name))) seen.set(foldKey(it.name), it);
        const have = new Set(items.map(i => foldKey(i.name)));
        return [...seen.values()].filter(i => !have.has(foldKey(i.name))).slice(0, 8);
    }, [venueId, items, visits.value]);

    const add = (n: string, k: KindId, p: number | null) => {
        const nm = n.trim().slice(0, LIMITS.itemName);
        if (!nm) return;
        if (items.length >= LIMITS.items) { toast(`En fazla ${LIMITS.items} kalem eklenebilir`, 'error'); return; }
        onChange([...items, { id: 'i_' + secret(10), name: nm, kind: k, price: p, verdict: null }]);
        setName(''); setPrice('');
    };
    const patch = (id: string, p: Partial<OrderItem>) => onChange(items.map(i => (i.id === id ? { ...i, ...p } : i)));

    return (
        <div>
            {items.length > 0 && (
                <div class="list mb-12">
                    {items.map(it => {
                        const Icon = KIND_ICONS[it.kind];
                        return (
                            <div class="list-item" key={it.id} style={{ flexWrap: 'wrap', rowGap: '10px' }}>
                                <span class="li-icon"><Icon /></span>
                                <span class="li-body">
                                    <span class="li-title">{it.name}</span>
                                    <span class="li-sub">{it.price != null ? fmtMoney(it.price) : 'Fiyat yok'}</span>
                                </span>
                                <button class="icon-btn" aria-label={`${it.name} kalemini sil`} onClick={() => onChange(items.filter(i => i.id !== it.id))}><X /></button>
                                <div class="segmented" style={{ padding: '3px', flex: '1 0 100%' }} role="group" aria-label={`${it.name} için karar`}>
                                    {VERDICTS.map(v => (
                                        <button key={v.id} type="button" aria-pressed={it.verdict === v.id} style={{ minHeight: '32px', fontSize: '13px' }}
                                            onClick={() => patch(it.id, { verdict: it.verdict === v.id ? null : v.id })}>{v.label}</button>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
            <form class="card card-pad" onSubmit={e => { e.preventDefault(); add(name, kind, price === '' ? null : Math.max(0, Math.round(Number(price)))); }}>
                <div class="row-wrap mb-12" role="radiogroup" aria-label="Tür">
                    {kindOptions.map(k => {
                        const Icon = KIND_ICONS[k.id];
                        return <button type="button" key={k.id} class="chip" role="radio" aria-checked={kind === k.id} aria-pressed={kind === k.id} onClick={() => setKind(k.id)}><Icon />{k.label}</button>;
                    })}
                </div>
                <div class="row">
                    <input class="input grow" placeholder="Ne söylediniz? (örn. Negroni)" value={name} maxLength={LIMITS.itemName} onInput={e => setName((e.target as HTMLInputElement).value)} />
                    <input class="input" style={{ width: '84px', flexShrink: 0 }} type="number" inputMode="numeric" min={0} placeholder="₺" value={price} onInput={e => setPrice((e.target as HTMLInputElement).value)} aria-label="Fiyat" />
                    <button class="btn btn-secondary" type="submit" disabled={!name.trim()} aria-label="Ekle"><Plus /></button>
                </div>
                {past.length > 0 && (
                    <div class="row-wrap mt-12">
                        <span class="small faint">Geçen sefer:</span>
                        {past.map(p => <button type="button" key={p.id} class="chip" onClick={() => add(p.name, p.kind, p.price)}><Plus />{p.name}</button>)}
                    </div>
                )}
            </form>
        </div>
    );
}

/** Salt okunur sipariş listesi (ziyaret detayı). */
export function ItemsList({ items }: { items: OrderItem[] }) {
    if (!items.length) return null;
    return (
        <div class="list">
            {items.map(it => {
                const Icon = KIND_ICONS[it.kind];
                return (
                    <div class="list-item" key={it.id}>
                        <span class="li-icon"><Icon /></span>
                        <span class="li-body"><span class="li-title">{it.name}</span></span>
                        <VerdictIcon v={it.verdict} />
                        {it.verdict === 'ok' && <span class="small faint">İyi</span>}
                        {it.price != null && <span class="num small muted">{fmtMoney(it.price)}</span>}
                    </div>
                );
            })}
        </div>
    );
}
