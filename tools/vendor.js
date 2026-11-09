// Copies browser builds of third-party libraries into public/vendor.
// Run after `npm install` when upgrading PeerJS or the QR generator.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const out = path.join(root, 'public', 'vendor');
fs.mkdirSync(out, { recursive: true });
const files = [
  ['node_modules/peerjs/dist/peerjs.min.js', 'peerjs.min.js'],
  ['node_modules/qrcode-generator/qrcode.js', 'qrcode.js'],
];
for (const [from, to] of files) {
  fs.copyFileSync(path.join(root, from), path.join(out, to));
  console.log(`vendored ${from} → public/vendor/${to}`);
}
