// Promo/ad slides for the active-ride banner. Pure (no react-native imports)
// so the parser unit-tests in Node. Raw slides come from a config source —
// today the bundled LOCAL_PROMO_SLIDES, later Remote Config or the backend —
// and are validated here: anything malformed or out of its date window is
// dropped rather than rendered.

export type PromoTextTone = "light" | "dark";

export type PromoSlide = {
  id: string;
  title: string;
  subtitle: string | null;
  /** Shown only together with a valid deepLink. */
  cta: { label: string; deepLink: string } | null;
  /** Remote creative (https) or a key into the bundled image registry. */
  image: { kind: "remote"; url: string } | { kind: "local"; key: string };
  bgColor: string;
  textTone: PromoTextTone;
  priority: number;
};

export const MAX_PROMO_SLIDES = 6;
const MAX_TITLE_LENGTH = 40;
const MAX_SUBTITLE_LENGTH = 80;
const MAX_CTA_LENGTH = 20;

const HEX_COLOR = /^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const DEEP_LINK = /^(https:\/\/|sitwego:\/\/)\S+$/;
const HTTPS_URL = /^https:\/\/\S+$/;

type Raw = Record<string, unknown>;

const isRecord = (v: unknown): v is Raw =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const text = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 && t.length <= max ? t : null;
};

/** ISO date → epoch ms; `undefined` when absent, `NaN` when unparseable. */
const time = (v: unknown): number | undefined => {
  if (v === undefined || v === null) return undefined;
  return typeof v === "string" ? Date.parse(v) : Number.NaN;
};

function parseSlide(raw: unknown, nowMs: number): PromoSlide | null {
  if (!isRecord(raw)) return null;
  const id = text(raw.id, 64);
  const title = text(raw.title, MAX_TITLE_LENGTH);
  const bgColor =
    typeof raw.bgColor === "string" && HEX_COLOR.test(raw.bgColor)
      ? raw.bgColor
      : null;
  if (!id || !title || !bgColor) return null;

  let image: PromoSlide["image"] | null = null;
  if (typeof raw.imageUrl === "string" && HTTPS_URL.test(raw.imageUrl)) {
    image = { kind: "remote", url: raw.imageUrl };
  } else if (typeof raw.imageKey === "string" && raw.imageKey.length > 0) {
    image = { kind: "local", key: raw.imageKey };
  }
  if (!image) return null;

  const startsAt = time(raw.startsAt);
  const endsAt = time(raw.endsAt);
  if (Number.isNaN(startsAt) || Number.isNaN(endsAt)) return null;
  if (startsAt !== undefined && nowMs < startsAt) return null;
  if (endsAt !== undefined && nowMs >= endsAt) return null;

  const ctaLabel = text(raw.ctaLabel, MAX_CTA_LENGTH);
  const deepLink =
    typeof raw.deepLink === "string" && DEEP_LINK.test(raw.deepLink)
      ? raw.deepLink
      : null;

  return {
    id,
    title,
    subtitle: text(raw.subtitle, MAX_SUBTITLE_LENGTH),
    cta: ctaLabel && deepLink ? { label: ctaLabel, deepLink } : null,
    image,
    bgColor,
    textTone: raw.textTone === "dark" ? "dark" : "light",
    priority:
      typeof raw.priority === "number" && Number.isFinite(raw.priority)
        ? raw.priority
        : 0,
  };
}

export type ParseResult = { slides: PromoSlide[]; dropped: number };

/**
 * Validates raw slides: drops malformed ones, ones outside their
 * startsAt/endsAt window, duplicate ids and local images the app doesn't
 * bundle; sorts by priority (high first, stable) and caps the count.
 */
export function parsePromoSlides(
  raw: unknown,
  nowMs: number,
  knownImageKeys: ReadonlySet<string>,
): ParseResult {
  if (!Array.isArray(raw)) return { slides: [], dropped: 0 };
  const seen = new Set<string>();
  const valid: PromoSlide[] = [];
  for (const item of raw) {
    const slide = parseSlide(item, nowMs);
    if (!slide || seen.has(slide.id)) continue;
    if (slide.image.kind === "local" && !knownImageKeys.has(slide.image.key)) {
      continue;
    }
    seen.add(slide.id);
    valid.push(slide);
  }
  const slides = valid
    .map((slide, order) => ({ slide, order }))
    .sort((a, b) => b.slide.priority - a.slide.priority || a.order - b.order)
    .slice(0, MAX_PROMO_SLIDES)
    .map(({ slide }) => slide);
  return { slides, dropped: raw.length - valid.length };
}

/**
 * Bundled slides used until a remote source exists. In-house placeholders
 * built from the app's own vehicle art — replace with real campaigns.
 */
export const LOCAL_PROMO_SLIDES: unknown[] = [
  {
    id: "boda-skip-traffic",
    title: "SKIP THE TRAFFIC",
    subtitle: "Book a Boda next time you're in a hurry",
    imageKey: "bike",
    bgColor: "#1F4D3A",
    priority: 30,
  },
  {
    id: "executive-arrive-in-style",
    title: "ARRIVE IN STYLE",
    subtitle: "Executive rides for the meetings that matter",
    imageKey: "executive",
    bgColor: "#18343F",
    priority: 20,
  },
  {
    id: "xl-room-for-everyone",
    title: "ROOM FOR EVERYONE",
    subtitle: "XL fits the whole crew and the luggage",
    imageKey: "xl",
    bgColor: "#3A2F4F",
    priority: 10,
  },
];
