// Downloads Wireshark manuf file and converts it to a compact JSON OUI lookup.
// Run: node scripts/build-oui.mjs
// Output: src/data/oui.json — a flat object mapping "AA:BB:CC" → "Vendor Name"

import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(__dirname, '..', 'src', 'data', 'oui.json');
const MANUF_URL = 'https://www.wireshark.org/download/automated/data/manuf';

async function build() {
  console.log('[build-oui] Downloading Wireshark manuf file...');
  const resp = await fetch(MANUF_URL);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const text = await resp.text();

  const db = {};
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const parts = trimmed.split('\t');
    if (parts.length < 2) continue;

    const prefix = parts[0].trim();
    // Only keep standard 24-bit OUI prefixes (AA:BB:CC format, 8 chars)
    // Skip 28-bit and 36-bit entries (contain '/')
    if (prefix.length !== 8 || prefix.includes('/')) continue;

    const vendor = (parts[2] || parts[1])?.trim();
    if (vendor) {
      db[prefix.toUpperCase()] = vendor;
    }
  }

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(db));
  console.log(`[build-oui] Wrote ${Object.keys(db).length} OUI entries to src/data/oui.json`);
}

build().catch((err) => {
  console.error('[build-oui] Failed:', err.message);
  // Non-fatal: don't block build if Wireshark CDN is unreachable
  process.exit(0);
});
