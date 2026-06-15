---
name: pdfmake v0.3 server-side usage
description: Correct API for pdfmake 0.3.x in Node.js ESM — singleton + createPdf().getStream(), not PdfPrinter class
---

## Rule
Use the exported pdfmake singleton, NOT `new PdfPrinter()` directly.

```ts
const _req = createRequire(import.meta.url);
const _pdfmake = _req("pdfmake") as any;
const _pdfmakeDir = path.dirname(_req.resolve("pdfmake/package.json"));
_pdfmake.fonts = {
  Roboto: {
    normal:      path.join(_pdfmakeDir, "fonts/Roboto/Roboto-Regular.ttf"),
    bold:        path.join(_pdfmakeDir, "fonts/Roboto/Roboto-Medium.ttf"),
    italics:     path.join(_pdfmakeDir, "fonts/Roboto/Roboto-Italic.ttf"),
    bolditalics: path.join(_pdfmakeDir, "fonts/Roboto/Roboto-MediumItalic.ttf"),
  },
};
_pdfmake.setLocalAccessPolicy(() => true);

// In the route handler:
const pdfStream: NodeJS.ReadableStream & { end(): void } =
  await _pdfmake.createPdf(docDefinition).getStream();
res.setHeader("Content-Type", "application/pdf");
pdfStream.pipe(res);
pdfStream.end();
```

**Why:** `new PdfPrinter(fonts)` requires a `urlResolver` 4th param in v0.3.x — omitting it crashes with "Cannot read properties of undefined (reading 'resolve')". The singleton handles all internal wiring. `createPdf().getStream()` is async and returns a readable stream.

**How to apply:** Any time pdfmake PDF generation is needed server-side in this project. Keep `pdfmake` in esbuild `external` list (build.mjs).
