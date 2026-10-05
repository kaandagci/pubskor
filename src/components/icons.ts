// Uygulamada kullanılan simgeler tek yerden (ağaç sallama ile yalnızca bunlar pakete girer).
import {
    Armchair, Beer, Snowflake, Timer, Receipt, MessagesSquare, Wind, Users, Sparkles, UtensilsCrossed, Smile,
    Martini, Wine, GlassWater, CupSoda, Hop, Citrus, BookOpenText, Grape, Soup, Salad, Store, Popcorn
} from 'lucide-preact';
import type { KindId, MetricId } from '../../shared/metrics';

export {
    ArrowLeft, Award, Beer, Bookmark, BookmarkPlus, Calendar, Camera, Check, ChevronDown, ChevronLeft, ChevronRight, CircleCheck,
    ClipboardList, Clock, CloudOff, Compass, Copy, Crown, Download, Ellipsis, Eye, EyeOff, FileText, Flame, Gavel, Handshake,
    History, House, Image, ImagePlus, Info, KeyRound, Link, ListOrdered, LocateFixed, Lock, LogOut, Map, MapPin, Medal, Megaphone,
    MessageCircle, Monitor, Moon, Navigation, NotebookPen, Pencil, Plus, QrCode, Radio, RefreshCw, Search, Settings, Share2,
    Shield, ShieldCheck, Shuffle, SlidersHorizontal, Smartphone, Sparkles, Split, Star, Sun, Swords, Tag, ThumbsDown, ThumbsUp,
    Timer, Trash2, TrendingDown, TrendingUp, TriangleAlert, Trophy, Undo2, Upload, UserPlus, Users, Wallet, X, Zap
} from 'lucide-preact';

type Icon = typeof Beer;

export const METRIC_ICONS: Record<MetricId, Icon> = {
    service_speed: Timer,
    price_transparency: Receipt,
    snacks_food: Popcorn,
    acoustics_talk: MessagesSquare,
    interior_design: Armchair,
    ambiance_air: Wind,
    vibe_comfort: Smile,
    restroom_queue: Users,
    restroom_hygiene: Sparkles,
    beer_temp_gas: Snowflake,
    draft_lacing: Beer,
    beer_selection: Hop,
    cocktail_taste: Martini,
    cocktail_craft: Citrus,
    cocktail_menu: BookOpenText,
    wine_selection: Grape,
    wine_service: Wine,
    spirit_selection: GlassWater,
    spirit_service: Snowflake,
    nonalc_options: CupSoda,
    food_taste: UtensilsCrossed,
    food_variety: Salad,
    food_portion: Soup
};

export const KIND_ICONS: Record<KindId, Icon> = {
    bira: Beer,
    kokteyl: Martini,
    sarap: Wine,
    sert: GlassWater,
    alkolsuz: CupSoda,
    yemek: UtensilsCrossed
};

export const VenueIcon = Store;
