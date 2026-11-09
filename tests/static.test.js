// Every local script/stylesheet referenced by the HTML pages must exist,
// so the static (Vercel) deployment never ships a broken page.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const pub = path.join(__dirname, '..', 'public');

for (const page of ['index.html', 'tv.html', 'phone.html', 'demo.html']) {
  test(`${page} references only existing files`, () => {
    const html = fs.readFileSync(path.join(pub, page), 'utf8');
    const refs = [...html.matchAll(/(?:src|href)="([^"#:]+)"/g)].map((m) => m[1]).filter((r) => !r.startsWith('/') || r.length > 1);
    for (const ref of refs) {
      if (/^\/(tv|phone|demo)?$/.test(ref)) continue; // clean URLs
      assert.ok(fs.existsSync(path.join(pub, ref.replace(/^\//, ''))), `${page} → ${ref}`);
    }
  });
}
