// Scores a text for buzzword density. Pure and deterministic: the same text
// always gets the same score, and every point traces back to a highlighted hit.

import { BUZZWORDS, CATEGORIES } from "./buzzwords.js";

export const MIN_WORDS = 10;
export const MAX_CHARS = 20000;

// Higher K = gentler curve. At K=25: 4 points per 100 words ≈ 15, 17 ≈ 50, 50 ≈ 86.
// Short texts have naturally high density, so a steeper curve over-punishes them.
const K = 25;

export const TIERS = [
  { id: "human", min: 0, name: "Refreshingly Human", tagline: "Plain words, doing honest work." },
  { id: "seasoned", min: 10, name: "Lightly Seasoned", tagline: "A pinch of jargon. Nobody was harmed." },
  { id: "casual", min: 25, name: "Business Casual", tagline: "Fluent in meeting." },
  { id: "thought", min: 45, name: "Thought Leadership Lite", tagline: "Somewhere, a keynote is forming." },
  { id: "keynote", min: 65, name: "Full Keynote", tagline: "Lanyards detected. Fog machine on standby." },
  { id: "singularity", min: 85, name: "Synergy Singularity", tagline: "Meaning has left the building." },
];

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const sourceFor = (b) => b.pattern ?? b.term.split(/[\s-]+/).map(escape).join("[\\s-]+");

const MATCHERS = BUZZWORDS.map((b) => ({
  ...b,
  re: new RegExp(`(?<![\\p{L}\\p{N}])(?:${sourceFor(b)})(?![\\p{L}\\p{N}])`, "giu"),
}));

const WORD_RE = /[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu;

export function validateText(text) {
  const trimmed = (text ?? "").trim();
  if (!trimmed) return "Paste some text first — the Index can't rate silence (though it's very on-brand).";
  if (trimmed.length > MAX_CHARS) return `That's a bit long. Keep it under ${MAX_CHARS.toLocaleString("en")} characters.`;
  if ((trimmed.match(WORD_RE) ?? []).length < MIN_WORDS) {
    return `Give us at least ${MIN_WORDS} words. Even "synergy" needs context.`;
  }
  return null;
}

function findHits(text) {
  const all = [];
  for (const m of MATCHERS) {
    m.re.lastIndex = 0;
    for (const match of text.matchAll(m.re)) {
      all.push({
        start: match.index,
        end: match.index + match[0].length,
        text: match[0],
        term: m.term,
        category: m.category,
        weight: m.weight,
      });
    }
  }
  // Leftmost first, longest first; then drop anything overlapping a kept hit.
  all.sort((a, b) => a.start - b.start || b.end - a.end);
  const hits = [];
  let lastEnd = -1;
  for (const h of all) {
    if (h.start >= lastEnd) {
      hits.push(h);
      lastEnd = h.end;
    }
  }
  return hits;
}

export function tierFor(score) {
  return TIERS.findLast((t) => score >= t.min);
}

export function analyze(text) {
  const hits = findHits(text);
  const wordCount = (text.match(WORD_RE) ?? []).length;
  const points = hits.reduce((s, h) => s + h.weight, 0);
  const density = wordCount ? (points / wordCount) * 100 : 0;
  const score = Math.round(100 * (1 - Math.exp(-density / K)));

  const byTerm = new Map();
  const byCategory = new Map();
  for (const h of hits) {
    const o = byTerm.get(h.term) ?? { term: h.term, category: h.category, count: 0, points: 0 };
    o.count += 1;
    o.points += h.weight;
    byTerm.set(h.term, o);
    const c = byCategory.get(h.category) ?? { id: h.category, label: CATEGORIES[h.category].label, count: 0, points: 0 };
    c.count += 1;
    c.points += h.weight;
    byCategory.set(h.category, c);
  }
  const rank = (a, b) => b.points - a.points || b.count - a.count;

  return {
    score,
    tier: tierFor(score),
    wordCount,
    points,
    density: Math.round(density * 10) / 10,
    hits,
    offenders: [...byTerm.values()].sort((a, b) => rank(a, b) || a.term.localeCompare(b.term)),
    categories: [...byCategory.values()].sort((a, b) => rank(a, b) || a.id.localeCompare(b.id)),
  };
}
