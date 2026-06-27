# IMPROVS2 Sample Packs

Public sample-pack store for the IMPROVS2 app. The app reads `packs.json` at runtime,
so **adding a pack here makes it appear in the app with no app update**.

## How it works

- Manifest from **raw** (always current):
  `https://raw.githubusercontent.com/trickishxsham/samplepacks/main/packs.json`
- Each pack's `.pack.js` loaded from **jsDelivr** (CDN) by `<script>`:
  `https://cdn.jsdelivr.net/gh/trickishxsham/samplepacks@main/packs/<file>.pack.js`

This mirrors the app's existing local `wav.pack/packs.js` mechanism — same `.pack.js`
format, just served remotely.

## Add a sample pack

1. Put the `.pack.js` file in `packs/`. Keep each file under ~15 MB (jsDelivr caps at 20 MB).
2. Add one entry to the `packs` array in `packs.json`:

   ```json
   {
     "id": "lofi-kit-1",
     "title": "Lo-Fi Kit Vol. 1",
     "genre": "lofi",
     "count": 12,
     "file": "packs/lofi_kit_1.pack.js"
   }
   ```

3. Commit and push. New pack shows in the app within minutes.

## Rules
- Keep the existing `.pack.js` structure the app expects.
- Under 20 MB per file. Split large kits into multiple packs.
- Only upload samples you own or have the right to distribute.
- Do NOT use a No-Derivatives license here — samples must be remixable.

## License
See `LICENSE` (CC0 or CC BY recommended).
