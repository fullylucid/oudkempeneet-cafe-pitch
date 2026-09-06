# DEPLOY.md — how this site actually goes live

_Written 2026-08-20 after an hour was lost assuming otherwise. Read this before touching anything
about publishing._

## ⚠ Pushing to GitHub does NOT update the live site

`git push` updates the repo and rebuilds GitHub Pages at
`https://fullylucid.github.io/oudkempeneet-cafe-pitch/`. That address is the **pitch
artifact**. It is *not* what the client's customers see, and for a long time the registry listed
it as "live", which is exactly what caused the confusion.

**The client's real site is `https://www.oudkempeneetcafe.nl/`** and it is served by a **Cloudflare
Worker** in Dave's account:

```
worker:   aged-mountain-afcf        (Workers static assets)
domains:  oudkempeneetcafe.nl, www.oudkempeneetcafe.nl   (Worker custom domains)
account:  DAVE_CF_ACCOUNT   token: DAVE_CF_TOKEN   (~/.config/shmorganism/secrets.env)
```

Because both hostnames are **Worker custom domains**, there is no proxied origin. Consequences
that wasted a lot of time and will waste yours:

- Zone **cache purge does nothing** — there is no zone cache in front of this.
- **Development mode does nothing**, for the same reason.
- A cache-busting query string returns the *old* page, because it is not a caching problem at all.
- `dig` shows `AAAA -> 100::`, Cloudflare's placeholder address. **That record is the tell**: it
  means a Worker or Pages custom domain serves the hostname, never a proxied origin.

## ⚠ Internal docs must never ship as public assets

`wrangler deploy` uploads **everything** in the assets directory. On 2026-08-24 this file itself
was published to the client's domain and served at `https://www.oudkempeneetcafe.nl/DEPLOY.md`
until it was noticed — it names the Cloudflare account and token variables, the worker name and our
internal process. Strip internal files from the staging copy before deploying:

```sh
rm -f /tmp/cafe/site/DEPLOY.md
# Leave .assetsignore alone. The file committed at the repo root IS the guard, and `git archive`
# has just copied it here. This line used to be `printf 'DEPLOY.md\n*.md\n' > …/.assetsignore`,
# which narrowed the guard back to the two patterns that had already failed once — ROOM.json
# matched neither and shipped. Widen the committed file instead; never rewrite it at deploy time.
```

The publish snippet below does the same `rm`. **After every deploy, check that it worked:**

```sh
curl -s -o /dev/null -w '%{http_code}\n' https://www.oudkempeneetcafe.nl/DEPLOY.md   # must be 404
```

## To publish

```sh
set -a; . ~/.config/shmorganism/secrets.env; set +a
export CLOUDFLARE_API_TOKEN="$DAVE_CF_TOKEN" CLOUDFLARE_ACCOUNT_ID="$DAVE_CF_ACCOUNT"

mkdir -p /tmp/cafe/site && git archive HEAD | tar -x -C /tmp/cafe/site
cat > /tmp/cafe/wrangler.toml <<'TOML'
name = "aged-mountain-afcf"
compatibility_date = "2026-08-01"
[assets]
directory = "./site"
not_found_handling = "404-page"
TOML
cd /tmp/cafe && rm -f /tmp/cafe/site/DEPLOY.md                      # never ship internal docs
# Leave .assetsignore alone. The file committed at the repo root IS the guard, and `git archive`
# has just copied it here. This line used to be `printf 'DEPLOY.md\n*.md\n' > …/.assetsignore`,
# which narrowed the guard back to the two patterns that had already failed once — ROOM.json
# matched neither and shipped. Widen the committed file instead; never rewrite it at deploy time.
npx --yes wrangler@latest deploy
```

Takes effect **immediately** — no cache wait. Wrangler only uploads changed files.

**Rollback**: previous versions are retained on the Worker; roll back with
`wrangler rollback` or via the Cloudflare dashboard. Check before assuming a bad deploy is fatal.

## Verify after publishing — on the real domain, not localhost

An HTTP `200` proves bytes exist, not that the page is right. Compare content:

```sh
curl -sL https://www.oudkempeneetcafe.nl/menu -o /tmp/live.html
md5sum /tmp/live.html menu.html      # must match
```

Then load it in a browser at 390px and count what actually renders. On 2026-08-20 the menu was
verified at **110 prices visible in each of nl/de/en**, no overflow, no JS errors.

## Menu content rules

The menus come from the client as **per-language PDFs** (Menukaart + Drankenkaart). Latest set and
extracted text: `~/shmorganism/soma/state/merritt/assets/oudkempen-menus-2026-08-19/`.

- Every item and price comes from the PDF **verbatim, per language**. Never translate — each
  language page carries the client's own wording.
- **Dutch and German use a comma** (`€ 25,95`); **English uses a point** (`€ 25.95`). Keep each
  language's own convention; do not normalise.
- Verify **mechanically**, never by eye: extract every price from each language and diff against
  that language's PDF, both directions — zero mismatches and zero orphans. These are real prices in
  front of a customer at a table.
- All three languages live in the `I18N` object in `menu.html`; the inline markup is only the
  default rendering, so counting inline prices undercounts badly.

## Ordering menu: D1 is the truth, `menu.html` is not (from the first seed onward)

The takeaway ordering backend reads the menu from **D1**, seeded from `data/menu.json`, which
`tools/extract-menu.py` produces from `menu.html`. From the moment the seed is applied, **editing
`menu.html` does not change what customers can order or what they pay.** Until the menu manager
(Part Two) exists, a menu change is:

1. update `menu.html` per the rules above (still the printed-card truth for the website);
2. `python3 tools/extract-menu.py data/menu.json`;
3. `python3 tools/gen-seed.py data/menu.json migrations/000N_seed_menu.sql` — a NEW migration
   number, never an edit of an applied one;
4. `python3 tests/test_menu.py` (must pass) and apply the migration to D1.

Per-item VAT (`vat_rate`) and `orderable` are **client-signed values** (`tools/gen-vat-sheet.py`
makes the sheet). Do not change them in code because a category rule says so; change them because
the signed sheet says so. Gate: merritt-studio `oudkempeneet-ordering-PHASE1-GATE.md`, condition 8.
