import { test } from "node:test";
import assert from "node:assert/strict";
import { htmlToText } from "../lib/html-to-text.js";

test("strips scripts, styles and tags, keeps visible text", () => {
  const { text } = htmlToText(
    "<html><head><style>p{}</style></head><body><script>alert(1)</script>" +
      "<p>Hello <b>world</b></p><noscript>enable js</noscript></body></html>",
  );
  assert.equal(text, "Hello world");
});

test("block elements become line breaks", () => {
  const { text } = htmlToText("<body><h1>Title</h1><p>One</p><p>Two<br>Three</p></body>");
  assert.equal(text, "Title\nOne\nTwo\nThree");
});

test("decodes named and numeric entities", () => {
  const { text } = htmlToText("<p>Tom &amp; Jerry &mdash; &quot;hi&quot; &#8217;s &#x1F680;</p>");
  assert.equal(text, "Tom & Jerry — \"hi\" ’s 🚀");
});

test("prefers <article> over surrounding chrome", () => {
  const { text } = htmlToText(
    "<body><nav>Home About</nav><article><p>The real post.</p></article><footer>© Co</footer></body>",
  );
  assert.equal(text, "The real post.");
});

test("title comes from og:title, then <title>", () => {
  assert.equal(
    htmlToText('<head><meta property="og:title" content="OG &amp; Co"><title>Plain</title></head>').title,
    "OG & Co",
  );
  assert.equal(htmlToText("<head><title> Plain </title></head>").title, "Plain");
  assert.equal(htmlToText("<p>no title</p>").title, "");
});
