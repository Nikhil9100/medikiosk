import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p) => fs.readFileSync(`${process.cwd()}/${p}`, "utf8");

test("anatomy selector supports dual-method selection (SVG diagram + text list)", () => {
  const page = read("app/patient/anatomy/page.tsx");
  // Visual body map with SVG
  assert.match(page, /<div className="body-map">/);
  assert.match(page, /<svg[^>]*viewBox="0 0 160 320"/);
  // Textual region choices list
  assert.match(page, /<div className="body-region-list"/);
  assert.match(page, /className="body-region-choice"/);
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
