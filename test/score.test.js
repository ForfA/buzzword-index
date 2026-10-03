import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, validateText, MIN_WORDS, MAX_CHARS } from "../public/lib/score.js";

const PLAIN =
  "We fixed the login bug on Tuesday. Pages now load in half the time, " +
  "and the export button finally works on Safari. Thanks to everyone who reported it.";

const HYPE =
  "Thrilled to announce our AI-powered, cutting-edge platform that leverages synergy " +
  "to unlock a paradigm shift in best-in-class, end-to-end solutions. We are disrupting " +
  "the ecosystem with a 10x, game-changing, seamless experience. Agree? 🚀";

test("empty text scores zero", () => {
  const r = analyze("");
  assert.equal(r.score, 0);
  assert.equal(r.hits.length, 0);
  assert.equal(r.wordCount, 0);
});

test("plain, concrete writing is refreshingly human", () => {
  const r = analyze(PLAIN);
  assert.equal(r.hits.length, 0);
  assert.equal(r.score, 0);
  assert.equal(r.tier.id, "human");
});

test("hype-laden writing lands in the top tiers", () => {
  const r = analyze(HYPE);
  assert.ok(r.score >= 85, `expected >= 85, got ${r.score}`);
  assert.equal(r.tier.id, "singularity");
});

test("a single buzzword in an otherwise plain text scores low", () => {
  const r = analyze(PLAIN + " We also made the dashboard more robust.");
  assert.equal(r.hits.length, 1);
  assert.ok(r.score > 0 && r.score < 25, `got ${r.score}`);
});

test("matches are case-insensitive and accept hyphen/space variants", () => {
  const terms = analyze("Cutting edge. CUTTING-EDGE. cutting-edge.").hits.map((h) => h.term);
  assert.deepEqual(terms, ["cutting-edge", "cutting-edge", "cutting-edge"]);
});

test("does not match buzzwords inside other words", () => {
  const r = analyze("The pivotal said explainers were unsynergetic campaigns.");
  assert.equal(r.hits.length, 0, JSON.stringify(r.hits));
});

test("overlapping matches keep the longest phrase only", () => {
  const r = analyze("Our AI-powered toaster.");
  assert.deepEqual(r.hits.map((h) => h.term), ["AI-powered"]);
});

test("hit offsets point at the original text", () => {
  const text = "Let's leverage our synergies.";
  for (const h of analyze(text).hits) {
    assert.equal(text.slice(h.start, h.end), h.text);
  }
});

test("offenders are aggregated and ranked by points", () => {
  const r = analyze("Synergy, synergy, synergy. Our solution is robust and holistic.");
  assert.equal(r.offenders[0].term, "synergy");
  assert.equal(r.offenders[0].count, 3);
  for (let i = 1; i < r.offenders.length; i++) {
    assert.ok(r.offenders[i - 1].points >= r.offenders[i].points);
  }
});

test("category breakdown sums to total points", () => {
  const r = analyze(HYPE);
  const sum = r.categories.reduce((s, c) => s + c.points, 0);
  assert.equal(sum, r.points);
  assert.ok(r.categories.every((c) => c.points > 0));
});

test("scoring is deterministic", () => {
  assert.deepEqual(analyze(HYPE), analyze(HYPE));
});

test("validateText rejects empty, too short and too long input", () => {
  assert.match(validateText("   "), /paste/i);
  assert.match(validateText("too short to judge"), new RegExp(String(MIN_WORDS)));
  assert.match(validateText("word ".repeat(MAX_CHARS)), /long/i);
  assert.equal(validateText(PLAIN), null);
});
