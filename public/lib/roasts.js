// Built-in roasts: used when no AI provider is configured (or it fails).
// Picks are seeded by the text, so the same text always gets the same roast.

// Lines with {top} name the worst offender. Only "human" can score without any
// offenders, so it is the only tier that needs lines without {top}.
const TIER_LINES = {
  human: [
    "This reads like a person wrote it for other people. Bold. Unscalable. We love it.",
    "Our analysts found zero synergies and are now on paid leave.",
    "Clear, concrete, and suspiciously free of value propositions. Is this even business?",
    'A lone "{top}" wandered in, looked around, and felt deeply out of place.',
  ],
  seasoned: [
    'Mostly human. One "{top}" slipped through, but we\'ll let it go with a warning.',
    'A pinch of "{top}", like parmesan on an otherwise honest pasta.',
    'You\'re one offsite away from going full "{top}". Stay strong.',
  ],
  casual: [
    'Fluent in meeting. "{top}" is doing a lot of heavy lifting here.',
    'Readable, but "{top}" suggests there\'s a slide deck somewhere.',
    'This text owns a quarter-zip fleece, and "{top}" is embroidered on it.',
  ],
  thought: [
    'Someone is building a personal brand, and "{top}" is the cornerstone.',
    'We sense a TEDx application in the drafts folder, titled "Rethinking {top}".',
    'This text has a podcast, and every episode is about "{top}".',
  ],
  keynote: [
    'Ready to be read aloud on a stage with a fog machine. "{top}" would get applause.',
    'The words are moving; the meaning is circling the airport. "{top}" is the pilot.',
    'Somewhere a VP read "{top}" and felt a strange, warm tingle.',
  ],
  singularity: [
    'Peak hype. "{top}" has achieved sentience and is asking for equity.',
    'We read this three times and are now 10x more confused about "{top}", at scale.',
    'This could raise a Series B on "{top}" alone, without containing a single fact.',
  ],
};

const CATEGORY_QUIPS = {
  ai: "Somewhere, a GPU just blushed.",
  corporate: "Please print this and laminate it for the break room.",
  marketing: "*Results not typical. Meaning sold separately.",
  startup: "Burn rate: high. Runway: vibes.",
  linkedin: "Agree? 👇",
  web3: "Bold of you to bring this back. Respect.",
};

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function houseRoast(result, text) {
  const top = result.offenders[0]?.term;
  const seed = hash(text);
  const lines = TIER_LINES[result.tier.id].filter((l) => Boolean(top) === l.includes("{top}"));
  const line = lines[seed % lines.length].replace("{top}", top);
  const quip = CATEGORY_QUIPS[result.categories[0]?.id];
  return quip && result.tier.id !== "human" ? `${line} ${quip}` : line;
}
