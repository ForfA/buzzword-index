// Turns an HTML page into readable text. Deliberately simple: no DOM, just
// enough structure-awareness to drop chrome and keep paragraphs apart.

const NAMED = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  mdash: "—", ndash: "–", hellip: "…", rsquo: "’", lsquo: "‘",
  rdquo: "”", ldquo: "“", copy: "©", reg: "®", trade: "™", bull: "•",
};

function decode(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") {
      const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    }
    return NAMED[e.toLowerCase()] ?? m;
  });
}

const BLOCK = /<\/?(?:p|div|br|h[1-6]|li|ul|ol|section|article|header|footer|blockquote|tr|table|pre|hr)\b[^>]*>/gi;

function findTitle(html) {
  const og =
    html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i) ??
    html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:title["']/i);
  const title = og?.[1] ?? html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "";
  return decode(title).replace(/\s+/g, " ").trim();
}

export function htmlToText(html) {
  const title = findTitle(html);
  let body = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|noscript|svg|head|template|iframe)\b[\s\S]*?<\/\1>/gi, "");

  const article = body.match(/<article\b[\s\S]*<\/article>/i) ?? body.match(/<main\b[\s\S]*<\/main>/i);
  if (article) body = article[0];
  else body = body.replace(/<(nav|footer|aside)\b[\s\S]*?<\/\1>/gi, "");

  const text = decode(body.replace(BLOCK, "\n").replace(/<[^>]+>/g, ""))
    .split("\n")
    .map((line) => line.replace(/[ \t\f\v ]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");

  return { title, text };
}
