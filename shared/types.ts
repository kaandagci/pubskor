import type { KindId, MetricId, VenueKind, VenueTag } from './metrics';

/** Bir kişinin bir ziyaretteki puan kağıdı. 1-10 puan; 0 = "yok / fikrim yok". */
export type Sheet = Partial<Record<MetricId, number>>;

export interface Participant {
    id: string;
    name: string;
    color: number;
    /** Ekip üyesiyse üye kimliği; misafirse boş. */
    memberId?: string | null;
}

export interface Photo {
    id: string;
    w: number;
    h: number;
}

export interface Venue {
    id: string;
    name: string;
    kind: VenueKind;
    area: string;
    address?: string;
    lat?: number | null;
    lng?: number | null;
    /** OpenStreetMap kaynağı (ör. "node/123"), yinelenen mekanları önlemek için. */
    osm?: string | null;
    /** Mekan özellikleri (canlı müzik, teras…), ekip ortak düzenler. */
    tags: VenueTag[];
    /** "Gidilecekler" listesinde mi? */
    wish?: { by: string | null; at: number; note: string } | null;
    createdAt: number;
    createdBy?: string | null;
}

export type Verdict = 'top' | 'ok' | 'bad';

/** Sipariş defteri: masada ne içildi / yendi. */
export interface OrderItem {
    id: string;
    name: string;
    kind: KindId;
    price: number | null;
    verdict: Verdict | null;
}

export type VisitSource = 'single' | 'live' | 'legacy';

export interface Visit {
    id: string;
    venueId: string;
    date: string;
    participants: Participant[];
    sheets: Record<string, Sheet>;
    /** Bu ziyarette puanlanan kriterler (katalog sırasında). */
    metrics: MetricId[];
    /** Masada ne içildi / yendi. */
    kinds: KindId[];
    items: OrderItem[];
    notes: string;
    photos: Photo[];
    /** Kişi başı harcama (₺), isteğe bağlı. */
    spend?: number | null;
    score: number | null;
    source?: VisitSource;
    createdAt: number;
    createdBy?: string | null;
    updatedAt: number;
    updatedBy?: string | null;
    deletedAt?: number | null;
    shareId?: string | null;
}

export type Role = 'owner' | 'member';

export interface Member {
    id: string;
    name: string;
    color: number;
    role: Role;
    joinedAt: number;
    removed?: boolean;
}

export interface TableRef {
    code: string;
    venueName: string;
    hostId: string;
    createdAt: number;
    expiresAt: number;
}

/** İstemciye giden ekip görüntüsü (gizli alanlar ayıklanmış). */
export interface CrewSnapshot {
    id: string;
    name: string;
    createdAt: number;
    rev: number;
    invite: string;
    me: string;
    members: Member[];
    venues: Venue[];
    visits: Visit[];
    tables: TableRef[];
    legacyImported?: boolean;
}

export interface VenueInput {
    id: string;
    name: string;
    kind?: VenueKind;
    area?: string;
    address?: string;
    lat?: number | null;
    lng?: number | null;
    osm?: string | null;
}

export interface VisitInput {
    id: string;
    venueId?: string;
    /** Yeni mekan; venueId yerine gönderilir, sunucu oluşturur. */
    venue?: VenueInput;
    date: string;
    participants: Participant[];
    sheets: Record<string, Sheet>;
    metrics: MetricId[];
    kinds?: KindId[];
    items?: OrderItem[];
    notes?: string;
    photos?: Photo[];
    spend?: number | null;
    source?: VisitSource;
    /** Düzenlemede: istemcinin bildiği son sürüm. Uyuşmazsa 409 döner. */
    baseUpdatedAt?: number;
}

// ----- Canlı masa -----

export type TableStatus = 'open' | 'closed' | 'cancelled';

export interface TableSetup {
    venue: VenueInput;
    /** Mekan ekipte zaten varsa kimliği. */
    venueId?: string | null;
    date: string;
    participants: Participant[];
    metrics: MetricId[];
    kinds: KindId[];
    /** Açıkken puanlar masa kapanana kadar kimseye görünmez. */
    blind: boolean;
    /** Açıkken QR ile gelen kişi kendini masaya ekleyebilir. */
    openSeats: boolean;
}

export interface SeatProgress {
    pid: string;
    claimed: boolean;
    filled: number;
    done: boolean;
    updatedAt: number;
}

export interface TableView {
    code: string;
    crewId: string;
    crewName: string;
    hostId: string;
    status: TableStatus;
    createdAt: number;
    expiresAt: number;
    setup: TableSetup;
    seats: SeatProgress[];
    /** İsteği yapanın koltuğu (varsa). */
    mySeat: string | null;
    isHost: boolean;
    /** Kör puanlama kapalıysa ya da masa kapandıysa tüm kağıtlar. */
    sheets: Record<string, Sheet> | null;
    /** İsteği yapanın düzenleyebildiği kağıtlar: kendi koltuğu ve (kurucuysa) telefonu olmayanlarınki. */
    mine: Record<string, Sheet>;
    visitId: string | null;
    result: { score: number | null; venueName: string } | null;
}

export interface SharedVisit {
    crewName: string;
    venue: Venue;
    visit: Visit;
}
