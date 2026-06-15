#!/usr/bin/env node
// Removes re-exports from api-zod types/index.ts that conflict with
// same-named zod schemas in api.ts (happens when an endpoint has both
// path params AND query params — orval generates GetXxxParams in both places).
const fs = require("fs");
const indexPath = require("path").resolve(__dirname, "../api-zod/src/generated/types/index.ts");
if (!fs.existsSync(indexPath)) process.exit(0);

const CONFLICTING = ["getFirmaEkstreParams"];

const lines = fs.readFileSync(indexPath, "utf8").split("\n");
const patched = lines.filter(
  (l) => !CONFLICTING.some((name) => l.includes(`'./${name}'`))
);
fs.writeFileSync(indexPath, patched.join("\n"));
console.log("patch-zod-types: removed conflicting re-exports:", CONFLICTING);
