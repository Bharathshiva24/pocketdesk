// Bundles public/demo.html (TV + phone linked in one page) into a single
// self-contained file: dist/pocketdesk-demo.html. Handy for sharing offline.
const fs = require('fs');
const path = require('path');
const pub = path.join(__dirname, '..', 'public');
let html = fs.readFileSync(path.join(pub, 'demo.html'), 'utf8');
html = html.replace(/<link rel="stylesheet" href="(css\/[^"]+)">/g, (_, f) => `<style>\n${fs.readFileSync(path.join(pub, f), 'utf8')}\n</style>`);
html = html.replace(/<script src="([^"]+)"><\/script>/g, (_, f) => `<script>\n${fs.readFileSync(path.join(pub, f), 'utf8').replace(/<\/script/gi, '<\\/script')}\n</script>`);
html = html.replace(/href="icon\.svg"/, `href="data:image/svg+xml;base64,${fs.readFileSync(path.join(pub, 'icon.svg')).toString('base64')}"`);
fs.mkdirSync(path.join(__dirname, '..', 'dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, '..', 'dist', 'pocketdesk-demo.html'), html);
console.log(`dist/pocketdesk-demo.html (${(html.length / 1024).toFixed(0)} KB)`);
