#!/usr/bin/env node
/* Compila src/LifeOS.jsx -> index.html (un solo archivo autónomo) y sube la versión del service worker */
import { build } from "esbuild";
import { readFileSync, writeFileSync } from "fs";

const result = await build({
  entryPoints: ["src/entry.jsx"],
  bundle: true,
  minify: true,
  format: "iife",
  jsx: "automatic",
  loader: { ".jsx": "jsx" },
  define: { "process.env.NODE_ENV": '"production"' },
  write: false,
  outfile: "bundle.js",
});

const js = result.outputFiles[0].text.replace(/<\/script>/g, "<\\/script>");
const tpl = readFileSync("src/template.html", "utf8");
if (!tpl.includes("/*__BUNDLE__*/")) throw new Error("src/template.html no tiene el marcador /*__BUNDLE__*/");
writeFileSync("index.html", tpl.replace("/*__BUNDLE__*/", js));

// Sube la versión de caché para que la actualización llegue a los celulares
const sw = readFileSync("sw.js", "utf8");
const m = sw.match(/lifeos-v(\d+)/);
if (m) {
  const next = `lifeos-v${+m[1] + 1}`;
  writeFileSync("sw.js", sw.replace(/lifeos-v\d+/g, next));
  console.log(`✓ sw.js -> ${next}`);
}
console.log(`✓ index.html generado (${(js.length / 1024).toFixed(0)} KB de JS)`);
