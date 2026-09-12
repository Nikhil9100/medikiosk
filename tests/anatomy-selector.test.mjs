import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { parseAnatomyVoice, getLocaleForLanguage } from "../lib/anatomy-voice.ts";

const read = (p) => fs.readFileSync(`${process.cwd()}/${p}`, "utf8");

test("anatomy selector supports dual-method selection (SVG diagram + text list)", () => {
  const page = read("app/patient/anatomy/page.tsx");
  // Visual body map with SVG
  assert.match(page, /<div className="body-map">/);
  assert.match(page, /<svg[^>]*viewBox="0 0 160 320"/);
  // Textual region choices list
  assert.match(page, /<div className="body-region-list"/);
  assert.match(page, /className=\{`body-region-choice/);
  // Both call toggleRegion
  assert.match(page, /onClick=\{\(\) => toggleRegion\("head"\)\}/);
  assert.match(page, /onClick=\{\(\) => toggleRegion\(key\)\}/);
});

test("anatomy selector maps all canonical body regions", () => {
  const page = read("app/patient/anatomy/page.tsx");
  const canonicalRegions = ["head", "chest", "abdomen", "back", "arm", "leg", "skin", "other"];
  for (const r of canonicalRegions) {
    assert.match(page, new RegExp(`\\["${r}",`));
  }
});

test("SVG body parts have full keyboard accessibility", () => {
  const page = read("app/patient/anatomy/page.tsx");
  // role="button", tabIndex={0}, aria-pressed, onKeyDown
  assert.match(page, /role="button"/);
  assert.match(page, /tabIndex=\{0\}/);
  assert.match(page, /aria-pressed=\{region ===/);
  assert.match(page, /onKeyDown=\{\(e\) => handleKey\(e,/);
  // Space and Enter key handling
  assert.match(page, /e\.key === "Enter" \|\| e\.key === " "/);
});

test("anatomy selector provides front/back view toggle and auto-switching", () => {
  const page = read("app/patient/anatomy/page.tsx");
  assert.match(page, /className="body-map-view-toggle"/);
  assert.match(page, /role="tablist"/);
  assert.match(page, /role="tab"/);
  assert.match(page, /onClick=\{\(\) => setView\("front"\)\}/);
  assert.match(page, /onClick=\{\(\) => setView\("back"\)\}/);
  // Auto-switch view when selecting back or chest/abdomen
  assert.match(page, /if \(key === "back"\) setView\("back"\)/);
  assert.match(page, /if \(key === "chest" \|\| key === "abdomen"\) setView\("front"\)/);
});

test("severity scale offers numeric pain ratings 0-10", () => {
  const page = read("app/patient/anatomy/page.tsx");
  assert.match(page, /className="severity-reference none"/);
  assert.match(page, /<span>0<\/span>/);
  assert.match(page, /\["MILD", "mild", "Mild", "1–3"\]/);
  assert.match(page, /\["MODERATE", "moderate", "Moderate", "4–6"\]/);
  assert.match(page, /\["SEVERE", "severe", "Severe", "7–8"\]/);
  assert.match(page, /\["VERY_SEVERE", "verySevere", "Very severe", "9–10"\]/);
});

test("selection syncs to patient complaints API and workflow persistence", () => {
  const page = read("app/patient/anatomy/page.tsx");
  assert.match(page, /mutate\("\/api\/patient\/complaints",\s*"PATCH",\s*\{/);
  assert.match(page, /bodyRegion:\s*region/);
  assert.match(page, /severity/);
  assert.match(page, /sync\(\{\s*bodyRegion:\s*region,\s*workflowStep:\s*"symptoms"\s*\}\)/);
  assert.match(page, /router\.push\("\/patient\/symptoms"\)/);
});

/* ====================================================================
   VOICE ANATOMY SELECTION REGRESSION SUITE
==================================================================== */

test("voice trigger mic button renders and has accessible labels", () => {
  const page = read("app/patient/anatomy/page.tsx");
  assert.match(page, /className=\{`anatomy-voice-trigger/);
  assert.match(page, /aria-label=\{listening \? /);
  assert.match(page, /aria-pressed=\{listening\}/);
  assert.match(page, /onClick=\{toggleVoice\}/);
});

test("voice parsing matches single region deterministically across languages", () => {
  // English
  const enChest = parseAnatomyVoice("chest pain", "en");
  assert.equal(enChest.isMatched, true);
  assert.deepEqual(enChest.matchedRegions, ["chest"]);

  // Hindi
  const hiBack = parseAnatomyVoice("पीठ में दर्द है", "hi");
  assert.equal(hiBack.isMatched, true);
  assert.deepEqual(hiBack.matchedRegions, ["back"]);

  // Bengali
  const bnHead = parseAnatomyVoice("মাথা ব্যথা করছে", "bn");
  assert.equal(bnHead.isMatched, true);
  assert.deepEqual(bnHead.matchedRegions, ["head"]);

  // Telugu
  const teAbdomen = parseAnatomyVoice("కడుపు నొప్పి ఉంది", "te");
  assert.equal(teAbdomen.isMatched, true);
  assert.deepEqual(teAbdomen.matchedRegions, ["abdomen"]);

  // Tamil
  const taChest = parseAnatomyVoice("நெஞ்சு வலி", "ta");
  assert.equal(taChest.isMatched, true);
  assert.deepEqual(taChest.matchedRegions, ["chest"]);

  // Marathi
  const mrBack = parseAnatomyVoice("कंबरदुखी त्रास आहे", "mr");
  assert.equal(mrBack.isMatched, true);
  assert.deepEqual(mrBack.matchedRegions, ["back"]);
});

test("voice parsing matches multi-region utterances in a single sentence", () => {
  // English: chest and stomach
  const enMulti = parseAnatomyVoice("chest and stomach", "en");
  assert.equal(enMulti.isMatched, true);
  assert.ok(enMulti.matchedRegions.includes("chest"));
  assert.ok(enMulti.matchedRegions.includes("abdomen"));

  // Hindi: छाती और पेट
  const hiMulti = parseAnatomyVoice("छाती और पेट में दर्द", "hi");
  assert.equal(hiMulti.isMatched, true);
  assert.ok(hiMulti.matchedRegions.includes("chest"));
  assert.ok(hiMulti.matchedRegions.includes("abdomen"));

  // Mixed/Transliterated: pet dard aur kamar
  const mixed = parseAnatomyVoice("pet dard aur kamar", "hi");
  assert.equal(mixed.isMatched, true);
  assert.ok(mixed.matchedRegions.includes("abdomen"));
  assert.ok(mixed.matchedRegions.includes("back"));
});

test("voice parsing captures subregions where unambiguous", () => {
  const lowerBack = parseAnatomyVoice("lower back pain", "en");
  assert.equal(lowerBack.isMatched, true);
  assert.ok(lowerBack.matchedRegions.includes("back"));
  assert.deepEqual(lowerBack.matchedSubregions.back, ["subregionLowerBack"]);

  const throat = parseAnatomyVoice("throat irritation", "en");
  assert.equal(throat.isMatched, true);
  assert.ok(throat.matchedRegions.includes("head"));
  assert.deepEqual(throat.matchedSubregions.head, ["subregionThroat"]);
});

test("unmatched or unclear speech yields graceful no-match without guessing", () => {
  const result = parseAnatomyVoice("xyz blablabla completely unrelated 123", "en");
  assert.equal(result.isMatched, false);
  assert.deepEqual(result.matchedRegions, []);
  assert.deepEqual(result.matchedSubregions, {});
});

test("proposed state is visually distinct from confirmed state on SVG and checklist", () => {
  const page = read("app/patient/anatomy/page.tsx");
  const css = read("app/globals.css");

  // Page classes
  assert.match(page, /proposedRegions\.includes\("head"\) \? "proposed" : ""/);
  assert.match(page, /isProposed \? "proposed" : ""/);
  assert.match(page, /className="proposed-badge"/);

  // CSS dashed amber styling for proposed SVG
  assert.match(css, /\.body-part\.proposed/);
  assert.match(css, /stroke-dasharray/);
  assert.match(css, /#d97706/);
  assert.match(css, /\.body-region-choice\.proposed/);
  assert.match(css, /\.proposed-badge/);
});

test("mandatory confirmation strip exists with aria-live and explicit actions", () => {
  const page = read("app/patient/anatomy/page.tsx");
  // Rendered conditionally on proposedRegions.length > 0
  assert.match(page, /proposedRegions\.length > 0 && \(/);
  assert.match(page, /className="voice-confirmation-strip"/);
  assert.match(page, /aria-live="polite"/);

  // Both Confirm and Edit manually buttons
  assert.match(page, /className="voice-confirm-btn"/);
  assert.match(page, /onClick=\{confirmProposed\}/);
  assert.match(page, /className="voice-edit-btn"/);
  assert.match(page, /onClick=\{discardProposed\}/);
});

test("confirmProposed commits proposed regions non-destructively to canonical state", () => {
  const page = read("app/patient/anatomy/page.tsx");
  // Merges into Set
  assert.match(page, /setSelectedRegions\(\(prev\) => Array\.from\(new Set\(\[\.\.\.prev, \.\.\.proposedRegions\]\)\)\)/);
  // Auto switch orientation if back was confirmed
  assert.match(page, /if \(proposedRegions\.includes\("back"\)\) \{\s*setView\("back"\);/);
});

test("discardProposed clears proposed state without committing", () => {
  const page = read("app/patient/anatomy/page.tsx");
  assert.match(page, /function discardProposed\(\) \{\s*setProposedRegions\(\[\]\);\s*setProposedSubregions\(\{\}\);/);
});

test("manual tapping discards any active proposed voice state", () => {
  const page = read("app/patient/anatomy/page.tsx");
  assert.match(page, /if \(proposedRegions\.length > 0\) \{\s*discardProposed\(\);\s*\}/);
});

test("locale configuration matches all 6 languages for Web Speech API", () => {
  assert.equal(getLocaleForLanguage("en"), "en-IN");
  assert.equal(getLocaleForLanguage("hi"), "hi-IN");
  assert.equal(getLocaleForLanguage("bn"), "bn-IN");
  assert.equal(getLocaleForLanguage("te"), "te-IN");
  assert.equal(getLocaleForLanguage("ta"), "ta-IN");
  assert.equal(getLocaleForLanguage("mr"), "mr-IN");
});
