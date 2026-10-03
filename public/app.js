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

const state = { server: null, mode: "text", exampleIndex: 0, source: "", lastSummary: "" };

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
      const el = document.createElement("span");
      el.className = "ticker-item";
      const arrow = document.createElement("span");
      arrow.className = item.up ? "up" : "down";
      arrow.textContent = `${item.up ? "▲" : "▼"} ${item.change}%`;
      el.append(`${item.name} `, arrow);
      track.append(el);
    }
  }
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
  $("mode").hidden = !server.extract;
  const ai = server.ai ? `roasts are written by ${server.ai.provider} (${server.ai.model})` : "roasts come from the house collection";
  $("privacy").textContent =
    `Your text is scored in your browser. Links are fetched by your local server, ${ai}. Nothing is stored.`;
}

/* ——— Form ——— */

function setMode(mode) {
  state.mode = mode;
  $("text-field").hidden = mode !== "text";
  $("url-field").hidden = mode !== "url";
  $("example").hidden = mode !== "text";
  showError("");
}

function showError(message, field) {
  $("form-error").textContent = message;
  for (const el of [$("text"), $("url")]) el.removeAttribute("aria-invalid");
  if (message && field) {
    field.setAttribute("aria-invalid", "true");
    field.focus();
  }
}

function setBusy(busy) {
  const btn = $("submit");
  btn.disabled = busy;
  btn.textContent = busy ? (state.mode === "url" ? "Fetching the page…" : "Rating…") : "Rate the hype";
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

  if (state.mode === "url") {
    const url = $("url").value.trim();
    if (!url) return showError("Paste a link first.", $("url"));
    setBusy(true);
    try {
      const page = await postJson("api/extract", { url });
      $("text").value = page.text;
      updateCount();
      state.source = page.title || new URL(page.url).hostname;
      if (page.truncated) state.source += ` · first ${MAX_CHARS.toLocaleString("en")} characters`;
      document.querySelector('input[name="mode"][value="text"]').checked = true;
      setMode("text");
    } catch (err) {
      setBusy(false);
      return showError(err.message, $("url"));
    }
    setBusy(false);
  }

  const text = $("text").value;
  const problem = validateText(text);
  if (problem) return showError(problem, $("text"));
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
  const bands = $("bands");
  bands.replaceChildren(
    ...TIERS.map((t, i) => {
      const width = (TIERS[i + 1]?.min ?? 100) - t.min;
      const band = el("div", { class: "band", title: t.name, style: `flex: ${width}` });
      band.classList.toggle("on", t.id === result.tier.id);
      return band;
    }),
  );
  $("gauge").setAttribute("aria-label", `Gauge: ${result.score} out of 100, tier ${result.tier.name}`);
  const needle = $("needle");
  needle.style.left = "0%";
  requestAnimationFrame(() => requestAnimationFrame(() => (needle.style.left = `${result.score}%`)));
}

function renderAnnotated(text, hits) {
  const out = [];
  let pos = 0;
  for (const h of hits) {
    if (h.start > pos) out.push(text.slice(pos, h.start));
    out.push(el("mark", { "data-cat": h.category, title: `${CATEGORIES[h.category].label} · +${h.weight}` }, h.text));
    pos = h.end;
  }
  out.push(text.slice(pos));
  $("annotated").replaceChildren(...out);
}

function renderBreakdown(result) {
  $("breakdown").hidden = result.hits.length === 0;
  $("offenders").replaceChildren(
    ...result.offenders.slice(0, 6).map((o) =>
      el("li", {}, el("span", { class: "term" }, o.term), el("span", { class: "count" }, `×${o.count} · ${o.points} pts`)),
    ),
  );
  const max = Math.max(1, ...result.categories.map((c) => c.points));
  $("categories").replaceChildren(
    ...result.categories.map((c) =>
      el(
        "li",
        { "data-cat": c.id },
        el("div", { class: "row" }, el("span", {}, c.label), el("span", { class: "pts" }, `${c.points} pts`)),
        el("div", { class: "bar", "aria-hidden": "true" }, el("span", { style: `width: ${(c.points / max) * 100}%` })),
      ),
    ),
  );
  const used = new Set(result.hits.map((h) => h.category));
  $("legend").replaceChildren(
    ...Object.entries(CATEGORIES)
      .filter(([id]) => used.has(id))
      .map(([id, c]) => el("span", { "data-cat": id }, c.label)),
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
  if ($("text").dataset.rendered !== text) return; // a newer rating replaced this one
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
  $("text").dataset.rendered = text;
  $("result").hidden = false;

  countUp($("score"), result.score);
  const delta = $("delta");
  delta.textContent = result.score ? `▲ ${result.score} pts above plain English` : "▬ Unchanged. Remarkable.";
  delta.classList.toggle("calm", result.score < 10);
  $("tier").textContent = result.tier.name;
  $("tagline").textContent = result.tier.tagline;
  renderGauge(result);

  $("stat-words").textContent = result.wordCount.toLocaleString("en");
  $("stat-hits").textContent = result.hits.length;
  $("stat-density").textContent = result.density;
  renderBreakdown(result);
  $("from").textContent = state.source ? `— from ${state.source}` : "";
  renderAnnotated(text, result.hits);

  state.lastSummary = summary(result, houseRoast(result, text));
  renderRoast(result, text);

  $("result").scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
  $("result-heading").focus({ preventScroll: true });
}

/* ——— Wiring ——— */

function updateCount() {
  $("count").textContent = $("text").value.length.toLocaleString("en");
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
  $("mode").addEventListener("change", (e) => setMode(e.target.value));
  $("text").addEventListener("input", () => {
    updateCount();
    state.source = ""; // edited text no longer matches the fetched page
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
    $("text").focus();
  });
  $("copy").addEventListener("click", copyResult);
  $("again").addEventListener("click", () => {
    $("text").value = "";
    $("url").value = "";
    state.source = "";
    updateCount();
    window.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" });
    $(state.mode === "url" ? "url" : "text").focus({ preventScroll: true });
  });
}

init();
