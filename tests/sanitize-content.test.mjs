/**
 * Study Up — input sanitization unit tests.
 *
 * Imports the actual src/lib/sanitize-content.ts module (Node's
 * --experimental-strip-types handles the plain type annotations directly —
 * this file has no JSX/React dependency, so no bundler is needed).
 *
 *   node --experimental-strip-types tests/sanitize-content.test.mjs
 */
import {
  sanitizeText,
  assertMaxLength,
  MESSAGE_MAX_LENGTH,
} from "../src/lib/sanitize-content.ts";

let passed = 0;
let failed = 0;
const results = [];
function check(name, fn) {
  try {
    fn();
    results.push(["PASS", name, ""]);
    passed++;
  } catch (err) {
    results.push(["FAIL", name, err.message]);
    failed++;
  }
}
const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

check("strips a NUL byte", () => {
  const input = "hello" + String.fromCharCode(0) + "world";
  assert(sanitizeText(input) === "helloworld", `got ${JSON.stringify(sanitizeText(input))}`);
});

check("strips other C0 control characters (bell, vertical tab, form feed)", () => {
  const input = "a" + String.fromCharCode(7) + "b" + String.fromCharCode(11) + "c" + String.fromCharCode(12) + "d";
  assert(sanitizeText(input) === "abcd", `got ${JSON.stringify(sanitizeText(input))}`);
});

check("strips DEL and C1 control characters", () => {
  const input = "x" + String.fromCharCode(127) + "y" + String.fromCharCode(150) + "z";
  assert(sanitizeText(input) === "xyz", `got ${JSON.stringify(sanitizeText(input))}`);
});

check("keeps newline, carriage return, and tab", () => {
  const input = "line1\nline2\r\nline3\ttabbed";
  assert(sanitizeText(input) === input, `got ${JSON.stringify(sanitizeText(input))}`);
});

check("keeps emoji and other multi-byte codepoints intact", () => {
  const input = "party 🎉 time";
  assert(sanitizeText(input) === input, `got ${JSON.stringify(sanitizeText(input))}`);
});

check("keeps a mention token intact", () => {
  const input = "hey @Alice Smith check this out";
  assert(sanitizeText(input) === input, `got ${JSON.stringify(sanitizeText(input))}`);
});

check("trims leading/trailing whitespace", () => {
  assert(sanitizeText("   padded   ") === "padded");
});

check("empty-after-trim input becomes an empty string, not thrown here", () => {
  assert(sanitizeText("   \t\n   ") === "");
});

check("assertMaxLength passes at exactly the limit", () => {
  assertMaxLength("a".repeat(MESSAGE_MAX_LENGTH), MESSAGE_MAX_LENGTH, "Message");
});

check("assertMaxLength throws one character over the limit", () => {
  let threw = false;
  try {
    assertMaxLength("a".repeat(MESSAGE_MAX_LENGTH + 1), MESSAGE_MAX_LENGTH, "Message");
  } catch (err) {
    threw = /Message must be \d+ characters or fewer\./.test(err.message);
  }
  assert(threw, "assertMaxLength did not throw a clear error over the limit");
});

console.log("");
for (const [status, name, detail] of results) {
  console.log(`  ${status}  ${name}${detail ? `\n        ↳ ${detail}` : ""}`);
}
console.log(`\n  ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
