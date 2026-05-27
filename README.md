# Tomás Erdmannsdörffer — Portfolio

Personal portfolio site with three interactive ML demos. Pure static site, no build step. Single repo deploys to any host.

```
portfolio/
├── index.html                              # main portfolio (timeline + demos + CV)
├── cv.pdf                                  # ← drop your CV here
├── README.md
├── .gitignore
└── projects/
    ├── pinn-playground/index.html          # 01 PINN demo (Burgers in browser, TF.js)
    ├── rag-scientific-ml/
    │   ├── index.html                      # 02 RAG over scientific ML papers
    │   └── corpus.json                     # 24 curated chunks
    └── fno-vs-solver/index.html            # 03 Neural operator vs. FD solver race
```

---

# Part 1 — Set up locally (10 minutes)

You only need **a browser**, **VSCode**, and **Git**. That's it.

## 1.1 — Install the basics

If you don't already have these:

- **VSCode:** https://code.visualstudio.com/ (Windows installer or via WSL)
- **Git:** comes with WSL by default; for Windows-native: https://git-scm.com/download/win
- **GitHub account:** https://github.com (you have one — `Terdmannsdorffer`)

> **Working in WSL?** Open a WSL terminal and run `code .` inside your project — VSCode auto-attaches to WSL via its built-in extension. Everything just works.

## 1.2 — Extract the portfolio

Unzip the bundle wherever you keep code. Recommended path:

```bash
# WSL or Linux/macOS
cd ~/projects
unzip ~/Downloads/portfolio.zip
cd portfolio

# Windows PowerShell
cd C:\Users\you\projects
# unzip via Explorer
cd portfolio
```

## 1.3 — Open in VSCode

```bash
code .
```

## 1.4 — Install the "Live Server" extension

In VSCode:

1. Click the Extensions icon in the left sidebar (or `Ctrl+Shift+X`)
2. Search for **"Live Server"** by Ritwick Dey
3. Click Install

## 1.5 — Run the site

- Right-click `index.html` in the file explorer → **"Open with Live Server"**
- Your browser opens at `http://127.0.0.1:5500`
- The three demo cards should be visible. Click each to test.

> **Why a server, not just opening the file?** The RAG demo needs to `fetch('./corpus.json')`, which browsers block on `file://` URLs for security. Any local server fixes it.

## 1.6 — Replace placeholder content

Three things to update before deploying:

1. **CV** — copy your CV PDF into the root folder and name it exactly `cv.pdf`. Delete `cv.pdf.PLACEHOLDER.txt`.
   ```bash
   cp ~/Downloads/Curriculum_2_0__3_.pdf ./cv.pdf
   rm cv.pdf.PLACEHOLDER.txt
   ```
2. **GitHub links** in the journey section currently all point at your profile root. Once you have specific repos for WarpPINN, Turbo Files, etc., update them.
3. (Optional) Adjust the **stat strip numbers** at the top of the hero in `index.html` if you want different metrics.

---

# Part 2 — Try the demos locally

## 2.1 — PINN Playground (Project 01)

Just open it from the main page → Train. No setup. Runs entirely on your GPU via TensorFlow.js / WebGL.

**Best demo settings:**
- Viscosity `0.01/π`, width 32, depth 4, λ = 1.0
- Hit Train, wait ~2 minutes
- A clean shock forms around t ≈ 0.4

## 2.2 — Ask My Research (Project 02 — RAG)

This is the only demo that needs an API key (for the LLM call).

**Quick setup with Groq (free, fastest):**

1. Sign up at https://console.groq.com
2. Go to API Keys → Create API Key → copy it
3. On the RAG page, click ⚙ Configure → pick the "Groq" preset → paste key → Save
4. Try the suggested questions

Groq's free tier has generous rate limits, responses in ~0.5s.

**Other providers** (auto-fill via preset dropdown):
- OpenAI (paid): `gpt-4o-mini` is cheapest
- OpenRouter: free tier on some models
- Together AI: pay-per-use
- Local Ollama: `ollama serve` and use `http://localhost:11434`

**Trade-off note:** Retrieval uses BM25 (lexical), not dense embeddings. This works great on the 24-chunk corpus but wouldn't scale to 10,000+ documents. Documented honestly in the demo's explainer section.

## 2.3 — FNO vs. Solver (Project 03)

No setup. Open the page, hit Race.

**Best demo settings:**
- ν = 0.02, Nx = 256 or 384, K = 24, IC = "smoothed step"
- Watch the FD solver crawl through ~2600 time steps
- The operator finishes in <2ms

The verdict bar shows actual measured wall-clock times — speedup typically lands 5–50× depending on regime. Largest gap is at high viscosity + large grid.

---

# Part 3 — Deploy to tdorffer.com

You'll need:
- A GitHub repo with this code
- The domain `tdorffer.com` (we'll set up purchase if you don't have it)
- A Cloudflare account (free)

## 3.1 — Push to GitHub

In the `portfolio/` folder:

```bash
git init
git add .
git commit -m "Initial portfolio"
git branch -M main
```

Then on GitHub:
1. Go to https://github.com/new
2. Repository name: `portfolio` (or `tdorffer-com`, your call)
3. Keep it Public (Cloudflare Pages supports both, but public means anyone can fork / inspect your work, which is a *plus* for a portfolio)
4. **Don't** initialize with README/gitignore/license — you already have them
5. Click Create

Copy the commands GitHub shows you, or:

```bash
git remote add origin https://github.com/Terdmannsdorffer/portfolio.git
git push -u origin main
```

If prompted for auth, use a **Personal Access Token** instead of password:
- GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate new
- Scope: `repo` (full)
- Use the token where it asks for password

## 3.2 — Buy `tdorffer.com`

If you don't already own it, easiest options (all decent, pick by price):

- **Cloudflare Registrar** (~$10/yr `.com`, no markup): https://dash.cloudflare.com → Domains
- **Porkbun** (~$10/yr): https://porkbun.com
- **Namecheap** (~$12/yr): https://www.namecheap.com

**Recommendation:** Buy through Cloudflare. The domain is auto-managed and connecting to Pages is one click.

If you buy elsewhere, you'll need to point the domain's nameservers to Cloudflare later (a 5-minute step we'll cover below).

## 3.3 — Deploy on Cloudflare Pages

1. Go to https://dash.cloudflare.com
2. Left sidebar → **Workers & Pages**
3. Click **Create application** → **Pages** tab → **Connect to Git**
4. Authorize Cloudflare to access your GitHub (one-time)
5. Select the `portfolio` repo → **Begin setup**
6. Build settings:
   - **Project name:** `tdorffer` (or anything — this becomes `tdorffer.pages.dev`)
   - **Production branch:** `main`
   - **Framework preset:** None
   - **Build command:** (leave empty)
   - **Build output directory:** `/`
   - **Root directory:** (leave empty)
7. Click **Save and Deploy**
8. Wait ~30 seconds. You'll get a `tdorffer.pages.dev` URL — click it.

Your portfolio is live at `https://tdorffer.pages.dev`. Every push to `main` auto-redeploys in ~30 seconds.

## 3.4 — Connect `tdorffer.com`

### Case A — You bought through Cloudflare Registrar

1. In Cloudflare Pages → your project → **Custom domains** tab → **Set up a custom domain**
2. Enter `tdorffer.com` → Continue
3. Cloudflare detects you own the domain → click **Activate domain**
4. Repeat for `www.tdorffer.com` if you want it
5. SSL provisions automatically. Wait 2-5 minutes.

Done. `https://tdorffer.com` now serves your portfolio.

### Case B — You bought elsewhere

1. **Add the domain to Cloudflare DNS:**
   - In Cloudflare dashboard → **Add a site** (top right) → enter `tdorffer.com`
   - Pick **Free plan**
   - Cloudflare scans existing DNS records (probably empty)
   - Cloudflare gives you **2 nameservers** (e.g. `ada.ns.cloudflare.com`, `bob.ns.cloudflare.com`)

2. **Update nameservers at your registrar:**
   - Log in to where you bought the domain
   - Find the DNS / nameservers section
   - Replace existing nameservers with the two Cloudflare gave you
   - Save
   - Propagation usually takes 5-30 minutes (sometimes longer; max 48h)

3. **Connect to Pages** (same as Case A from step 1)

## 3.5 — Verify it works

```bash
# Check DNS
dig tdorffer.com +short
# Should return Cloudflare IP

# Check the site
curl -I https://tdorffer.com
# Should return 200 OK with cloudflare headers
```

Or just open https://tdorffer.com in your browser.

## 3.6 — Set up automatic deploys

Already done — Cloudflare Pages auto-deploys on every push to `main`. To update the site:

```bash
# edit something
git add .
git commit -m "Update bio"
git push
# Cloudflare picks up the push and redeploys in ~30s
```

You can watch the build at Cloudflare dashboard → Workers & Pages → tdorffer → Deployments.

---

# Part 4 — Customization

## 4.1 — Adding a new demo

1. Create `projects/<name>/index.html`
2. Add a `<a class="demo bare">` block to the demos grid in `index.html` (copy an existing one)
3. Commit + push. Auto-deploys.

## 4.2 — Editing the corpus (RAG demo)

`projects/rag-scientific-ml/corpus.json` is plain JSON. Each entry:

```json
{
  "id": "unique-id",
  "paper": "Author Year — Title",
  "arxiv": "arxiv-id-or-source",
  "section": "Section name",
  "tags": ["topic", "method", "domain"],
  "text": "Chunk content, 1-3 sentences."
}
```

Push → re-deploys → live in 30s.

## 4.3 — Custom domain email

Cloudflare Email Routing (free) lets you create `tomas@tdorffer.com` that forwards to your Gmail.

1. Cloudflare dashboard → your domain → **Email** → **Email Routing**
2. Enable → add custom address → set destination
3. Cloudflare adds the MX records automatically
4. Update the `mailto:` link in `index.html` if you want to use the new address

## 4.4 — Analytics

Add Cloudflare Web Analytics (free, privacy-respecting, no GDPR banner needed):

1. Cloudflare dashboard → **Analytics & Logs** → **Web Analytics**
2. Add a site → copy the snippet
3. Paste before `</body>` in `index.html`
4. Push. Stats start collecting immediately.

---

# Part 5 — Troubleshooting

| Problem | Fix |
|---|---|
| "Cannot fetch corpus.json" (RAG demo) | You're opening `index.html` via `file://`. Use Live Server. |
| Live Server doesn't open | In WSL, check that the port 5500 isn't blocked. Try `localhost:5500` manually. |
| `git push` asks for password | Use a Personal Access Token (GitHub Settings → Developer settings). |
| Cloudflare Pages build fails | Make sure build command is **empty** and output dir is `/`. |
| `tdorffer.com` shows "Not Secure" | SSL takes 2-5 minutes to provision after connecting. Be patient. |
| Old version after push | Hard-refresh the browser: `Ctrl+Shift+R`. Cloudflare caches aggressively. |
| RAG demo "401 unauthorized" | Your API key is wrong or expired. Reconfigure in the ⚙ modal. |

---

# Part 6 — Why this stack?

Plain HTML/CSS/JS, no framework. Three reasons:

1. **No build step** = nothing to break in 2 years. The site you ship today still works in 2030.
2. **Recruiters can View Source** and see your code. That's a feature.
3. **Static = free hosting forever.** Cloudflare Pages has unlimited bandwidth on the free tier.

Total operating cost: **$10/year** (the domain). Nothing else.

---

## License

MIT. Fork the structure freely; don't fork the identity.
