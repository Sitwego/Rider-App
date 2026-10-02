import { describe, expect, it } from "@jest/globals";

import {
  LOCAL_PROMO_SLIDES,
  MAX_PROMO_SLIDES,
  parsePromoSlides,
} from "../promo/promoSlides";

const NOW = Date.parse("2026-10-01T12:00:00Z");
const KEYS = new Set(["bike", "executive", "xl"]);

const base = {
  id: "a",
  title: "Hello",
  imageKey: "bike",
  bgColor: "#112233",
};

describe("parsePromoSlides", () => {
  it("returns nothing for a non-array source", () => {
    expect(parsePromoSlides(undefined, NOW, KEYS)).toEqual({
      slides: [],
      dropped: 0,
    });
    expect(parsePromoSlides({ id: "x" }, NOW, KEYS).slides).toEqual([]);
  });

  it("parses a minimal slide with defaults", () => {
    const [slide] = parsePromoSlides([base], NOW, KEYS).slides;
    expect(slide).toEqual({
      id: "a",
      title: "Hello",
      subtitle: null,
      cta: null,
      image: { kind: "local", key: "bike" },
      bgColor: "#112233",
      textTone: "light",
      priority: 0,
    });
  });

  it("drops malformed slides and counts them", () => {
    const result = parsePromoSlides(
      [
        base,
        { ...base, id: "" },
        { ...base, id: "b", title: "   " },
        { ...base, id: "c", bgColor: "red" },
        { ...base, id: "d", imageKey: undefined },
        { ...base, id: "e", imageKey: "unknown-art" },
        {
          ...base,
          id: "f",
          imageKey: undefined,
          imageUrl: "http://x.io/a.png",
        },
        { ...base, id: "g", title: "x".repeat(41) },
        "not an object",
      ],
      NOW,
      KEYS,
    );
    expect(result.slides.map((s) => s.id)).toEqual(["a"]);
    expect(result.dropped).toBe(8);
  });

  it("accepts https creatives", () => {
    const [slide] = parsePromoSlides(
      [{ ...base, imageKey: undefined, imageUrl: "https://cdn.x/a.png" }],
      NOW,
      KEYS,
    ).slides;
    expect(slide.image).toEqual({ kind: "remote", url: "https://cdn.x/a.png" });
  });

  it("keeps the CTA only with a valid deep link", () => {
    const parse = (extra: object) =>
      parsePromoSlides([{ ...base, ...extra }], NOW, KEYS).slides[0].cta;
    expect(parse({ ctaLabel: "Shop now" })).toBeNull();
    expect(
      parse({ ctaLabel: "Shop now", deepLink: "javascript:x" }),
    ).toBeNull();
    expect(parse({ ctaLabel: "Shop now", deepLink: "https://s.go/a" })).toEqual(
      { label: "Shop now", deepLink: "https://s.go/a" },
    );
    expect(parse({ ctaLabel: "Book", deepLink: "sitwego://book" })).toEqual({
      label: "Book",
      deepLink: "sitwego://book",
    });
  });

  it("respects the date window", () => {
    const ids = parsePromoSlides(
      [
        { ...base, id: "future", startsAt: "2026-10-02T00:00:00Z" },
        { ...base, id: "expired", endsAt: "2026-10-01T11:59:59Z" },
        { ...base, id: "bad-date", endsAt: "next week" },
        {
          ...base,
          id: "live",
          startsAt: "2026-09-01T00:00:00Z",
          endsAt: "2026-10-31T00:00:00Z",
        },
      ],
      NOW,
      KEYS,
    ).slides.map((s) => s.id);
    expect(ids).toEqual(["live"]);
  });

  it("dedupes ids, sorts by priority (stable) and caps the count", () => {
    const raw = [
      { ...base, id: "low", priority: 1 },
      { ...base, id: "high", priority: 5 },
      { ...base, id: "low", priority: 99 },
      { ...base, id: "tie", priority: 1 },
      ...Array.from({ length: 10 }, (_, i) => ({ ...base, id: `n${i}` })),
    ];
    const ids = parsePromoSlides(raw, NOW, KEYS).slides.map((s) => s.id);
    expect(ids.slice(0, 3)).toEqual(["high", "low", "tie"]);
    expect(ids).toHaveLength(MAX_PROMO_SLIDES);
  });

  it("accepts every bundled local slide", () => {
    const { slides, dropped } = parsePromoSlides(LOCAL_PROMO_SLIDES, NOW, KEYS);
    expect(dropped).toBe(0);
    expect(slides.length).toBe(LOCAL_PROMO_SLIDES.length);
  });
});
