import { personClass } from '../lib/colors';
import { initials } from '../lib/format';

interface Person { name: string; color: number; memberId?: string | null }

export function Avatar({ p, size = '', guest }: { p: Person; size?: '' | 'sm' | 'lg' | 'xl'; guest?: boolean }) {
    return (
        <span class={`avatar ${size} ${guest ? 'guest' : personClass(p.color)}`} title={p.name} aria-hidden="true">
            {initials(p.name)}
        </span>
    );
}

export function AvatarStack({ people, max = 4 }: { people: Person[]; max?: number }) {
    const shown = people.slice(0, max);
    const rest = people.length - shown.length;
    return (
        <span class="avatar-stack" aria-label={people.map(p => p.name).join(', ')}>
            {shown.map((p, i) => <Avatar key={i} p={p} size="sm" />)}
            {rest > 0 && <span class="avatar more">+{rest}</span>}
        </span>
    );
}
