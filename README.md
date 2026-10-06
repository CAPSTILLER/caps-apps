# CAP Apps

Simple mobile-first web launcher for CAPSTILLER's gearup.wtf apps.
Tap an icon to open that site. No wallet connect. PWA-ready so you can add it to your home screen.

Theme matched to **Pump It Dry** (`pid.gearup.wtf` / local `punctuation-it-dry`): dark arcade shell, gold title, blue borders, peach letter tiles.

## Live domain

`https://capsapps.gearup.wtf` (Cloudflare CNAME → Vercel). Cap imports and deploys on Vercel.

## Edit the app list

[`apps.json`](apps.json) — same shape as the Android CAP Apps launcher.

```json
{ "label": "CAPs Mind", "url": "https://capsmind.gearup.wtf/", "icon": "capsmind.png" }
```

1. Drop a square PNG (about 256×256, the site's own icon) into `icons/`.
2. Add a line to `apps.json`. Leave out `"icon"` for a peach letter tile.
3. `"enabled": false` hides an entry without deleting it. Only `https` links are shown.

## Local preview

Any static file server from this folder (index.html at the root):

```sh
python3 -m http.server 5173
```

## Vercel

Import `CAPSTILLER/caps-apps` as a static project (no build command, output = `.`).
Add domain `capsapps.gearup.wtf` after Cloudflare DNS is pointing at `cname.vercel-dns.com`.

## Never commit

`node_modules/`, `.vercel/`, `.env`, build caches. See GITHUB-UPLOAD.txt.
