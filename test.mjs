// Zero-dependency regression test for the .gitignore tester.
//
// The tool ships as a single index.html with an inline <script> IIFE whose
// pure functions (parseGitignore, compile, evaluate) never touch the DOM.
// This test extracts that script, runs it under Node's built-in vm with a
// minimal document shim, and asserts the engine's verdict and deciding rule
// against a fixture generated from real `git check-ignore` (see
// test/regenerate-ground-truth.sh). No npm install, no dependencies.

import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, "index.html"), "utf8");
const cases = JSON.parse(
  readFileSync(join(here, "test", "git-ground-truth.json"), "utf8"),
);

// Pull the single inline <script> block out of the page.
const m = html.match(/<script>([\s\S]*?)<\/script>/);
assert.ok(m, "could not find the inline <script> block in index.html");
const scriptSource = m[1];

// Minimal DOM shim: the IIFE grabs elements and wires event listeners at load
// time, but the engine itself is pure. Stub nodes absorb that wiring.
function stubNode() {
  return {
    value: "",
    textContent: "",
    innerHTML: "",
    classList: { add() {}, remove() {}, toggle() {} },
    addEventListener() {},
    appendChild() {},
    querySelector() {
      return stubNode();
    },
    style: {},
  };
}

const sandbox = {
  document: {
    getElementById() {
      return stubNode();
    },
    querySelector() {
      return stubNode();
    },
    createElement() {
      return stubNode();
    },
    addEventListener() {},
  },
  window: {},
  location: { hash: "", search: "", href: "" },
  history: { replaceState() {} },
};
sandbox.globalThis = sandbox;
sandbox.window = sandbox;

vm.createContext(sandbox);
vm.runInContext(scriptSource, sandbox, { filename: "index.html#script" });

const api = sandbox.__GITIGNORE;
assert.ok(api && typeof api.evaluate === "function", "__GITIGNORE.evaluate not exported");

// Decider patterns render with leading escape chars stripped in the UI
// (\#literal shows as #literal). Normalize before comparing rule identity.
function normRule(p) {
  return p == null ? null : String(p).replace(/^\\/, "");
}

for (const c of cases) {
  test(`${JSON.stringify(c.gitignore)} vs ${c.path}`, () => {
    const r = api.evaluate(c.gitignore, c.path);

    assert.equal(
      r.ignored,
      c.ignored,
      `verdict mismatch: tool=${r.ignored} git=${c.ignored}`,
    );

    const toolRule =
      r.deciderIdx >= 0 ? r.rules[r.deciderIdx].pattern : null;
    const expectRule =
      c.decidingRule == null ? null : c.decidingRule.replace(/^!/, "");
    assert.equal(
      normRule(toolRule),
      normRule(expectRule),
      `deciding-rule mismatch: tool=${toolRule} git=${c.decidingRule}`,
    );
  });
}

// The load-bearing case this whole tool exists for: an excluded parent
// directory makes a later negation dead. A flat per-pattern matcher gets
// the boolean right by luck and names the negation as the decider; the
// walk model names the directory exclusion and flags the dead negation.
test("dead-negation trap: build/ then !build/keep.txt", () => {
  const r = api.evaluate("build/\n!build/keep.txt", "build/keep.txt");
  assert.equal(r.ignored, true, "file must stay ignored");
  assert.equal(r.rules[r.deciderIdx].pattern, "build/", "decider is the dir exclusion");
  assert.equal(r.deadNegations.length, 1, "the negation must be flagged dead");
  assert.equal(r.deadNegations[0].pattern, "build/keep.txt");
});

// Contrast: ignoring the directory *contents* leaves the negation live.
test("working negation: abc/* then !abc/keep.txt", () => {
  const r = api.evaluate("abc/*\n!abc/keep.txt", "abc/keep.txt");
  assert.equal(r.ignored, false, "file must be re-included");
  assert.equal(r.deadNegations.length, 0, "no dead negation here");
});
