// Topluluk parçaları: diğer ekiplerin puan satırı ve ekip etiketi (ekip adı ya da takma ad).
import { tierOf } from '../../shared/metrics';
import type { PublicCrew, PublicVisit } from '../../shared/public';
import { fmtRelativeDay } from '../lib/format';
import { Users, VenetianMask } from './icons';
import { PlaceEmblem } from './PlaceEmblem';
import { ScoreRing } from './ScoreRing';

/** Ekip adı (ya da ekip adını göstermemeyi seçtiyse takma adı); kendi ekibinse "siz". */
export function CrewTag({ crew }: { crew: PublicCrew }) {
    const Icon = crew.anon ? VenetianMask : Users;
    return (
        <span class={`crew-tag${crew.anon ? ' anon' : ''}${crew.mine ? ' mine' : ''}`} title={crew.anon ? 'Takma ad: ekip adını göstermemeyi seçti' : 'Ekip'}>
            <Icon aria-hidden="true" />
            <span class="truncate">{crew.label}</span>
            {crew.mine && <span class="crew-tag-you">siz</span>}
        </span>
    );
}

/** Topluluk akışı satırı: mekan simgesi, ad, semt ve gün, ekip etiketi, skor halkası. Dokununca mekan sayfası. */
export function PublicRow({ v }: { v: PublicVisit }) {
    const t = tierOf(v.score);
    return (
        <a class="vrow" href={`/yer/${v.placeId}`}>
            <div class="vrow-thumb"><PlaceEmblem place={v} size={52} /></div>
            <div class="vrow-body">
                <div class="vrow-title">{v.name}</div>
                <div class="vrow-meta">{[v.district, fmtRelativeDay(v.date)].filter(Boolean).join(' · ')}</div>
                <div class="vrow-foot">
                    <CrewTag crew={v.crew} />
                    <span class={`vrow-tier tier-${t.id}`}>{t.label}</span>
                </div>
            </div>
            <ScoreRing score={v.score} size={46} stroke={4.5} />
        </a>
    );
}
