#!/usr/bin/env node
/**
 * build.mjs — Comet build script.
 *
 * Uses esbuild directly. No Vite, no crxjs, no webpack.
 * A browser extension is not a web app — it doesn't need HMR or a dev server.
 *
 * Outputs a ready-to-load /dist directory.
 * Run: node scripts/build.mjs [--watch]
 */

import esbuild from "esbuild";
import fs      from "node:fs";
import path    from "node:path";

const watch = process.argv.includes("--watch");
const OUT   = "dist";

// ---------- helpers ----------

function copy(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else copy(s, d);
  }
}

function clean() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
}

// ---------- build ----------

const sharedOptions = {
  bundle:    true,
  sourcemap: false,
  target:    "es2020",
  format:    "iife",
};

async function build() {
  clean();

  // 1. Content script — bundled into a single IIFE.
  await esbuild.build({
    ...sharedOptions,
    entryPoints: ["src/content/main.ts"],
    outfile:     `${OUT}/src/content/main.js`,
    // No import() calls in content scripts — IIFE is safest.
  });

  // 2. Popup script — bundled into a single IIFE.
  await esbuild.build({
    ...sharedOptions,
    entryPoints: ["src/popup/popup.ts"],
    outfile:     `${OUT}/src/popup/popup.js`,
  });

  // 3. Static files — copied verbatim.
  copy("manifest.json",               `${OUT}/manifest.json`);
  copy("src/content/cursor.css",      `${OUT}/src/content/cursor.css`);
  copy("src/popup/popup.html",        `${OUT}/src/popup/popup.html`);
  copy("src/popup/popup.css",         `${OUT}/src/popup/popup.css`);
  copyDir("src/assets",               `${OUT}/src/assets`);

  console.log("✓ Build complete →", OUT);
}

if (watch) {
  // esbuild watch mode — rebuilds content + popup on change.
  const ctx1 = await esbuild.context({
    ...sharedOptions,
    entryPoints: ["src/content/main.ts"],
    outfile:     `${OUT}/src/content/main.js`,
  });
  const ctx2 = await esbuild.context({
    ...sharedOptions,
    entryPoints: ["src/popup/popup.ts"],
    outfile:     `${OUT}/src/popup/popup.js`,
  });

  // Copy statics once up front.
  clean();
  copy("manifest.json",               `${OUT}/manifest.json`);
  copy("src/content/cursor.css",      `${OUT}/src/content/cursor.css`);
  copy("src/popup/popup.html",        `${OUT}/src/popup/popup.html`);
  copy("src/popup/popup.css",         `${OUT}/src/popup/popup.css`);
  copyDir("src/assets",               `${OUT}/src/assets`);

  await Promise.all([ctx1.watch(), ctx2.watch()]);
  console.log("⏳ Watching for changes…");
} else {
  await build();
}
