import { personClass } from '../lib/colors';
import { initials } from '../lib/format';

/** Ekip simgesi: ekip adının baş harfleri, ekibe göre sabit renkli yuvarlak karoda. */
export function CrewMark({ name, id, size = 32 }: { name: string; id: string; size?: number }) {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return (
        <span class={`crew-mark ${personClass(h % 8)}`} style={{ width: `${size}px`, height: `${size}px`, fontSize: `${Math.round(size * 0.4)}px` }} aria-hidden="true">
            {initials(name)}
        </span>
    );
}
