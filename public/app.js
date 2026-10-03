import { analyze, validateText, TIERS, MAX_CHARS } from "./lib/score.js";
import { houseRoast } from "./lib/roasts.js";
import { BUZZWORDS, CATEGORIES } from "./lib/buzzwords.js";

const $ = (id) => document.getElementById(id);
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

const EXAMPLES = [
  `🚀 Thrilled to announce that after an incredible journey, we're launching our AI-powered, cutting-edge platform!

We leverage generative AI to unlock actionable insights and empower teams to move the needle. It's not just a tool — it's a paradigm shift.

Humbled by this team of rockstars. Let that sink in.

Agree? 👇`,
  `Acme is a category-defining, AI-native platform on a mission to democratize procurement. Our agentic workflows streamline the end-to-end journey, delivering a frictionless, best-in-class experience at scale. With strong product-market fit and a robust flywheel, we're poised for hypergrowth as we double down on our north star: 10x value for every stakeholder.`,
  `Hi all — quick update on the outage. The database ran out of disk at 02:14. We added space, restarted the service, and everything was back by 02:40. To stop it happening again we've set up an alert at 80% disk usage. Sorry for the trouble, and thanks for your patience.`,
];

// Only "low" tiers get the calm colour on the gauge.
const CALM_TIERS = new Set(["human", "seasoned"]);
const COUNT_FROM = MAX_CHARS * 0.9;

const state = { server: null, exampleIndex: 0, source: "", lastSummary: "" };

/* ——— Masthead ——— */

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function renderMasthead() {
  const now = new Date();
  const day = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 864e5);
  $("edition").textContent = `No. ${day} · ${now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}`;
  $("dict-size").textContent = BUZZWORDS.length;

  const today = now.toDateString();
  const picks = BUZZWORDS.filter((b) => b.weight >= 2 && /^[\w\s-]+$/.test(b.term))
    .map((b) => ({ b, k: hash(b.term + today) }))
    .sort((x, y) => x.k - y.k)
    .slice(0, 18);
  const items = picks.map(({ b, k }) => ({
    name: b.term.toUpperCase(),
    change: ((k % 2400) / 100 + 0.4).toFixed(1),
    up: k % 7 !== 0, // hype mostly goes up
  }));
  items.splice(6, 0, { name: "PLAIN ENGLISH", change: ((hash(today) % 500) / 100 + 1).toFixed(1), up: false });

  const track = $("ticker");
  for (let copy = 0; copy < 2; copy++) {
    for (const item of items) {
      const arrow = el("span", { class: item.up ? "up" : "down" }, `${item.up ? "▲" : "▼"} ${item.change}%`);
      track.append(el("span", { class: "ticker-item" }, `${item.name} `, arrow));
    }
  }
}

function toggleTicker() {
  const btn = $("ticker-toggle");
  const paused = btn.getAttribute("aria-pressed") !== "true";
  btn.setAttribute("aria-pressed", String(paused));
  btn.setAttribute("aria-label", paused ? "Play ticker" : "Pause ticker");
  btn.textContent = paused ? "▶" : "❚❚";
  btn.closest(".ticker").classList.toggle("paused", paused);
}

/* ——— Server capabilities ——— */

async function detectServer() {
  try {
    const res = await fetch("api/config", { headers: { accept: "application/json" } });
    if (!res.ok || !res.headers.get("content-type")?.includes("json")) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function applyServer(server) {
  state.server = server;
  if (!server) return;
  if (server.extract) $("text").placeholder = "Paste a post, a pitch, a press release — or a link to a public page…";
  const ai = server.ai ? `roasts are written by ${server.ai.provider} (${server.ai.model})` : "roasts come from the house collection";
  $("privacy").textContent =
    `Your text is scored in your browser. Links are fetched by your local server, ${ai}. Nothing is stored.`;
}

/* ——— Form ——— */

// A lone URL (and nothing else) means "fetch this page".
function asLink(input) {
  if (!/^(https?:\/\/|www\.)\S+$/i.test(input)) return null;
  return input.startsWith("www.") ? `https://${input}` : input;
}

function showError(message) {
  $("form-error").textContent = message;
  const text = $("text");
  if (message) {
    text.setAttribute("aria-invalid", "true");
    text.focus();
  } else {
    text.removeAttribute("aria-invalid");
  }
}

function setBusy(label) {
  const btn = $("submit");
  btn.disabled = Boolean(label);
  btn.textContent = label || "Rate the hype";
}

async function postJson(path, body) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "Something went wrong. Please try again.");
  return json;
}

async function onSubmit(event) {
  event.preventDefault();
  showError("");

  const link = asLink($("text").value.trim());
  if (link) {
    if (!state.server?.extract) {
      return showError("This version can't fetch links. Open the page, copy its text and paste it here instead.");
    }
    setBusy("Fetching that link…");
    try {
      const page = await postJson("api/extract", { url: link });
      $("text").value = page.text;
      updateCount();
      state.source = page.title || new URL(page.url).hostname;
      if (page.truncated) state.source += ` · first ${MAX_CHARS.toLocaleString("en")} characters`;
    } catch (err) {
      return showError(err.message);
    } finally {
      setBusy("");
    }
  }

  const text = $("text").value;
  const problem = validateText(text);
  if (problem) return showError(problem);
  render(text);
}

/* ——— Result ——— */

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  node.append(...children);
  return node;
}

function countUp(node, target) {
  if (reducedMotion || target === 0) return void (node.textContent = target);
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / 900);
    node.textContent = Math.round(target * (1 - Math.pow(1 - t, 3)));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function renderGauge(result) {
  const calm = CALM_TIERS.has(result.tier.id);
  $("bands").replaceChildren(
    ...TIERS.map((t, i) => {
      const band = el("div", { class: "band", style: `flex: ${(TIERS[i + 1]?.min ?? 100) - t.min}` });
      if (t.id === result.tier.id) band.classList.add("on", calm ? "calm" : "hype");
      return band;
    }),
  );
  const needle = $("needle");
  needle.style.setProperty("--pos", 0);
  requestAnimationFrame(() => requestAnimationFrame(() => needle.style.setProperty("--pos", result.score / 100)));
}

function renderAnnotated(text, result) {
  const out = [];
  let pos = 0;
  for (const h of result.hits) {
    if (h.start > pos) out.push(text.slice(pos, h.start));
    const label = CATEGORIES[h.category].label;
    out.push(el("mark", { "data-cat": h.category, title: `${label} · +${h.weight}` }, h.text, el("span", { class: "sr-only" }, ` (${label})`)));
    pos = h.end;
  }
  out.push(text.slice(pos));
  $("annotated").replaceChildren(...out);

  // The legend doubles as the category summary.
  $("legend").replaceChildren(
    ...result.categories.map((c) => el("li", { "data-cat": c.id }, `${c.label} `, el("span", { class: "pts" }, `${c.points} pts`))),
  );
}

function renderBreakdown(result) {
  $("stat-words").textContent = result.wordCount.toLocaleString("en");
  $("stat-hits").textContent = result.hits.length;
  $("stat-density").textContent = result.density;
  $("offenders").replaceChildren(
    ...result.offenders.slice(0, 8).map((o) =>
      el("li", {}, el("span", { class: "term" }, o.term), el("span", { class: "count" }, `×${o.count} · ${o.points} pts`)),
    ),
  );
}

async function renderRoast(result, text) {
  const critic = $("critic");
  const roast = $("roast");
  const source = $("source");
  const fallback = () => houseRoast(result, text);

  if (!state.server?.ai) {
    roast.textContent = fallback();
    source.textContent = "House roast";
    return;
  }
  critic.setAttribute("aria-busy", "true");
  roast.textContent = "The critic is sharpening their pen…";
  source.textContent = "";
  let reply;
  try {
    reply = await postJson("api/roast", { text });
  } catch {
    reply = { roast: fallback(), source: "house" };
  }
  if (state.rendered !== text) return; // a newer rating replaced this one
  critic.setAttribute("aria-busy", "false");
  roast.textContent = reply.roast;
  source.textContent = reply.source === "ai" ? `AI critic · ${state.server.ai.model}` : "House roast";
  state.lastSummary = summary(result, reply.roast);
}

function summary(result, roast) {
  return `My text scored ${result.score}/100 on the Buzzword Index — “${result.tier.name}”.\n${roast}`;
}

function render(text) {
  const result = analyze(text);
  const hasHits = result.hits.length > 0;
  state.rendered = text;
  markStale(false);
  $("result").hidden = false;

  $("result-heading").textContent = `Your rating: ${result.score}/100, ${result.tier.name}`;
  countUp($("score"), result.score);
  $("tier").textContent = result.tier.name;
  $("tagline").textContent = result.tier.tagline;
  renderGauge(result);

  $("annotated-section").hidden = !hasHits;
  $("breakdown").hidden = !hasHits;
  $("from").textContent = state.source ? `— from ${state.source}` : "";
  renderAnnotated(text, result);
  renderBreakdown(result);

  state.lastSummary = summary(result, houseRoast(result, text));
  renderRoast(result, text);

  $("result").scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
  $("result-heading").focus({ preventScroll: true });
}

function markStale(stale) {
  $("result").classList.toggle("stale", stale);
  $("stale-note").hidden = !stale;
}

/* ——— Wiring ——— */

function updateCount() {
  const n = $("text").value.length;
  $("count").textContent = n >= COUNT_FROM ? `${n.toLocaleString("en")} / ${MAX_CHARS.toLocaleString("en")} characters` : "";
}

async function copyResult() {
  const status = $("copy-status");
  const btn = $("copy");
  try {
    await navigator.clipboard.writeText(`${state.lastSummary}\n${location.href.split("#")[0]}`);
    btn.textContent = "Copied!";
    status.textContent = "Result copied to clipboard";
  } catch {
    btn.textContent = "Couldn't copy";
    status.textContent = "Copying failed";
  }
  setTimeout(() => (btn.textContent = "Copy result"), 1800);
}

function init() {
  renderMasthead();
  detectServer().then(applyServer);

  $("form").addEventListener("submit", onSubmit);
  $("ticker-toggle").addEventListener("click", toggleTicker);
  $("text").addEventListener("input", () => {
    updateCount();
    state.source = ""; // edited text no longer matches the fetched page
    if (!$("result").hidden) markStale($("text").value !== state.rendered);
  });
  $("form").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) $("form").requestSubmit();
  });
  $("example").addEventListener("click", () => {
    $("text").value = EXAMPLES[state.exampleIndex];
    state.exampleIndex = (state.exampleIndex + 1) % EXAMPLES.length;
    state.source = "";
    updateCount();
    showError("");
    if (!$("result").hidden) markStale($("text").value !== state.rendered);
    $("text").focus();
  });
  $("copy").addEventListener("click", copyResult);
  $("again").addEventListener("click", () => {
    $("text").value = "";
    state.source = "";
    state.rendered = null;
    $("result").hidden = true;
    updateCount();
    showError("");
    window.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" });
    $("text").focus({ preventScroll: true });
  });
}

init();
