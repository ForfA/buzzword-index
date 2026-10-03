import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, TIERS } from "../public/lib/score.js";
import { houseRoast } from "../public/lib/roasts.js";

test("house roast is deterministic for the same text", () => {
  const text = "We leverage synergy to unlock a paradigm shift. Thrilled to announce it!";
  assert.equal(houseRoast(analyze(text), text), houseRoast(analyze(text), text));
});

test("every tier has roasts, with and without an offender to name", () => {
  const offender = { term: "synergy", category: "corporate", count: 1, points: 3 };
  for (const tier of TIERS) {
    for (let seed = 0; seed < 8; seed++) {
      const offenders = tier.id === "human" && seed % 2 ? [] : [offender];
      const roast = houseRoast({ tier, offenders, categories: [] }, `text ${seed}`);
      assert.ok(roast.length > 20, `${tier.id}: ${roast}`);
      assert.doesNotMatch(roast, /\{|\}|undefined/);
    }
  }
});

test("house roast calls out the worst offender by name", () => {
  const text = "Synergy synergy synergy. We are thrilled. Synergy everywhere, all the synergy.";
  const r = analyze(text);
  assert.match(houseRoast(r, text), /synergy/i);
});
