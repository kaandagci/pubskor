import { scoreWord } from '../../shared/metrics';
import { NA } from '../../shared/scoring';
import { heat } from '../lib/colors';
import { haptic } from '../state/ui';

interface Props {
    value: number | undefined;
    onChange: (v: number | undefined) => void;
    label: string;
}

/** 1-10 puan seçici: büyük dokunma alanları, kırmızıdan yeşile ısı şeridi, "fikrim yok" seçeneği. */
export function ScaleInput({ value, onChange, label }: Props) {
    const pick = (v: number) => { haptic(); onChange(value === v ? undefined : v); };
    return (
        <div>
            <div class="rate-readout" aria-live="polite">
                {value == null ? <span class="placeholder">Bir puan seç</span>
                    : value === NA ? <span class="w" style={{ fontSize: '24px', color: 'var(--text-1)' }}>Fikrim yok</span>
                    : <><span class="n">{value}</span><span class="w">{scoreWord(value)}</span></>}
            </div>
            <div class="scale" role="radiogroup" aria-label={label}>
                {Array.from({ length: 10 }, (_, i) => i + 1).map(v => {
                    const h = heat(v);
                    return (
                        <button
                            key={v} type="button" role="radio" aria-checked={value === v} aria-pressed={value === v}
                            aria-label={`${v} – ${scoreWord(v)}`}
                            style={{ '--heat': h.bg, '--heat-ink': h.ink }}
                            onClick={() => pick(v)}
                        >{v}</button>
                    );
                })}
            </div>
            <button type="button" class="btn btn-ghost btn-block rate-na" aria-pressed={value === NA} onClick={() => pick(NA)}>
                Fikrim yok / deneyimlemedim
            </button>
        </div>
    );
}
