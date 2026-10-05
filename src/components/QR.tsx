import { useMemo } from 'preact/hooks';
import { encode } from 'uqr';

/** Tarayıcıda üretilen QR kod (dışarıya istek yok). */
export function QR({ value, label }: { value: string; label: string }) {
    const { size, d } = useMemo(() => {
        const qr = encode(value, { ecc: 'M', border: 2 });
        let path = '';
        qr.data.forEach((row, y) => row.forEach((on, x) => { if (on) path += `M${x} ${y}h1v1h-1z`; }));
        return { size: qr.size, d: path };
    }, [value]);
    return (
        <div class="qr">
            <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} shape-rendering="crispEdges">
                <path d={d} fill="#14100c" />
            </svg>
        </div>
    );
}
