import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BUZZWORDS, CATEGORIES } from "../public/lib/buzzwords.js";
import { analyze, TIERS } from "../public/lib/score.js";
import { houseRoast } from "../public/lib/roasts.js";

const terms = (text) => analyze(text).hits.map((h) => h.term);

// Ordinary writing that must stay in the "human" tier. Several of these used to
// trip the dictionary (disrupted, journey, Uber for, to the Moon, pivot table…).
const PLAIN_CORPUS = {
  "bug report":
    "When I click Export on the reports page, the app freezes for about ten seconds and then downloads an empty CSV. " +
    "This started after Monday's update. Steps: open Reports, pick last month, click Export. I expected a file with " +
    "around 200 rows. The pivot table view still works. Firefox 128 on Windows 11.",
  "recipe step":
    "Peel the onion and chop it finely. Heat two tablespoons of oil in a large pan over a medium heat, add the onion " +
    "with a pinch of salt and cook for eight minutes until soft. Stir in the garlic and a teaspoon of authentic smoked " +
    "paprika, then add the tomatoes and simmer for twenty minutes.",
  "school notice":
    "Dear parents, the Year 2 trip to the science museum is on Friday 14 March. The coach leaves at 8:30, so please " +
    "make sure your child arrives by 8:15 with a packed lunch and a waterproof coat. The journey takes about an hour " +
    "each way. Disruptive behaviour on the coach will be reported to the class teacher. Thank you for your support.",
  "news report":
    "Heavy snow disrupted rail services across the north of England on Tuesday, and several schools closed early. " +
    "Engineers worked through the night to clear the lines, and most routes reopened by the morning. The Met Office " +
    "expects more snow later in the week and has asked people to plan their journeys carefully.",
  "casual message":
    "Hey, are we still on for dinner on Saturday? I can pick you up around seven. I've booked an Uber for the way back " +
    "so nobody has to drive. Let me know if you want to invite Sam too, and whether you have any thoughts on the " +
    "restaurant. The traffic was moving fast on the bridge last time so we should be fine.",
  "space news":
    "NASA plans to send astronauts back to the Moon in 2027. The mission to the Moon will test a new landing system " +
    "near the south pole, where scientists hope to find ice. The agency said the next generation of spacesuits is " +
    "also ready, after delays caused by supply problems.",
  "meeting notes":
    "Meeting notes, 3 June. We agreed to move the release to the 17th because the payment tests are still failing on " +
    "staging. Ben will look at the timeout in the checkout service. Priya will email the two customers who reported " +
    "duplicate charges. We decided to keep the old API until the end of the year.",
  "commute moan":
    "My journey to work took two hours today because the train was cancelled. I had to unlock my bike, ride to the " +
    "next station and wait in the rain. The hustle and bustle of the platform was too much, so next time I will just " +
    "work from home.",
};

for (const [name, text] of Object.entries(PLAIN_CORPUS)) {
  test(`plain writing stays human: ${name}`, () => {
    const r = analyze(text);
    assert.ok(r.score < 10, `${name} scored ${r.score}: ${r.hits.map((h) => h.text).join(", ")}`);
    assert.equal(r.tier.id, "human");
  });
}

test("every entry is well-formed", () => {
  const seen = new Set();
  for (const b of BUZZWORDS) {
    assert.ok(CATEGORIES[b.category], `${b.term}: unknown category ${b.category}`);
    assert.ok([1, 2, 3].includes(b.weight), `${b.term}: weight ${b.weight}`);
    assert.ok(!seen.has(b.term.toLowerCase()), `duplicate term ${b.term}`);
    seen.add(b.term.toLowerCase());
    if (b.pattern) {
      const re = new RegExp(`^(?:${b.pattern})$`, "iu");
      assert.ok(!re.test(""), `${b.term}: pattern matches the empty string`);
    }
  }
});

test("every category is styled and has a quip", () => {
  const css = readFileSync(new URL("../public/styles.css", import.meta.url), "utf8");
  const keynote = TIERS.find((t) => t.id === "keynote");
  const offenders = [{ term: "synergy", category: "corporate", count: 1, points: 3 }];
  const bare = houseRoast({ tier: keynote, offenders, categories: [] }, "x");
  for (const id of Object.keys(CATEGORIES)) {
    assert.equal(css.split(`--hl-${id}:`).length - 1, 2, `${id}: needs a light and a dark highlight colour`);
    assert.ok(css.includes(`[data-cat="${id}"]`), `${id}: needs a [data-cat] swatch rule`);
    assert.ok(BUZZWORDS.some((b) => b.category === id), `${id}: has no entries`);
    const withQuip = houseRoast({ tier: keynote, offenders, categories: [{ id }] }, "x");
    assert.notEqual(withQuip, bare, `${id}: no quip in CATEGORY_QUIPS`);
  }
});

test("new patterns match their inflections and spelling variants", () => {
  const cases = [
    ["We deep-dived, then doubled-down on the low-hanging fruits.", ["deep dive", "double down", "low-hanging fruit"]],
    ["GenAI, Gen AI and gen-AI.", ["GenAI", "GenAI", "GenAI"]],
    ["He vibe-coded it; she is vibecoding; they are vibe coders.", ["vibe coding", "vibe coding", "vibe coding"]],
    ["Agentic AI and agentic workflows.", ["agentic AI", "agentic"]],
    ["Meet your new AI teammates.", ["digital workers"]],
    ["Operationalisation, rightsized and right-sizing.", ["operationalize", "rightsizing", "rightsizing"]],
    ["We reimagined it, re-imagining everything.", ["reimagine", "reimagine"]],
    ["Hyper-personalised and hyperpersonalization.", ["hyper-personalized", "hyper-personalized"]],
    ["Next-gen, nextgen and next-generation tools.", ["next-gen", "next-gen", "next-gen"]],
    ["Thought leadership from thought leaders.", ["thought leader", "thought leader"]],
    ["Web 3.0 is just web3.", ["web3", "web3"]],
    ["We are disrupting the insurance industry, like all disruptors.", ["disrupt", "disrupt"]],
    ["Unlock your full potential.", ["unlock"]],
    ["We're the Uber for dog walking.", ["Uber for"]],
    ["They reached unicorn status.", ["unicorn"]],
    ["Grateful for my journey.", ["journey"]],
    ["To the moon! 🚀", ["to the moon", "🚀"]],
    ["Our marketing ninja met a growth guru.", ["ninja", "guru"]],
    ["Let's take this offline and circle back.", ["take this offline", "circle back"]],
    ["It's not just a tool — it's a mindset.", ["it's not just X — it's Y"]],
    ["What my toddler taught me about B2B sales.", ["what X taught me about B2B sales"]],
    ["♻️ Repost if you agree.", ["♻️", "repost if you agree"]],
    ["In today's fast-paced world, we delve into the ever-evolving landscape.", ["in today's fast-paced world", "delve into", "ever-evolving landscape"]],
    ["Take your brand to the next level.", ["next level"]],
  ];
  for (const [text, expected] of cases) assert.deepEqual(terms(text), expected, text);
});

test("plain senses and words-inside-words do not match", () => {
  const clean = [
    "The pivot table broke again.",
    "Please unlock the back door.",
    "Snow disrupted trains, and disruptive pupils were sent home.",
    "I took an Uber for the airport and booked the Uber for 6pm.",
    "Our daughter loves unicorns.",
    "The journey to work took an hour.",
    "NASA's mission to the Moon slipped again.",
    "Guru Nanak was born in 1469, and the evangelist preached on Sunday.",
    "Training the next generation of farmers.",
    "The hustle and bustle of the market.",
    "A camera with 10x zoom and a 10x10 grid.",
    "The Revolutionary War ended in 1783.",
    "Authentic Italian pasta.",
    "Unleashed dogs must be kept on the path.",
    "The agile team met a famous hustler and detokenized the data.",
    "Few understand the offside rule, so I explained it.",
    "Lower the oven and drop the temperature below 150C.",
  ];
  for (const text of clean) assert.deepEqual(analyze(text).hits, [], text);
});
