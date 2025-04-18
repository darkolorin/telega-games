# Telegram Survivors

A minimalist Vampire‑Survivors‑style auto‑shooter that runs in the browser and can be embedded as a Telegram game.

## Local play
Just open `index.html` in any modern browser or use a simple HTTP server:
```bash
npx serve .
```

## Deploying to GitHub Pages
### 1. Create a new GitHub repository
```
# From project root
git init
# (Optionally) add your GitHub remote
# git remote add origin https://github.com/<your‑user>/<repo>.git
```

### 2. Commit & push
```
git add index.html README.md
# add other assets if you create them

git commit -m "Initial commit – Telegram Survivors"

# Push main branch
git branch -M main
git push -u origin main
```

### 3. Enable GitHub Pages
1. On GitHub → *Settings* → *Pages*.
2. Source: **Deploy from a branch**.
3. Branch: `main`, folder `/` (root).
4. Save. GitHub will publish the site at `https://<your‑user>.github.io/<repo>/` within minutes.

### Optional: Automatic deployment via GitHub Actions
If you prefer to push to any branch (e.g. `main`) and let an action publish to `gh‑pages`, copy the workflow below into `.github/workflows/deploy.yml`:
```yaml
name: Deploy to GitHub Pages
on:
  push:
    branches: [main]

permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup Pages
        uses: actions/configure-pages@v4
      - name: Upload artifact
        uses: actions/upload-pages-artifact@v2
        with:
          path: '.'
  deploy:
    needs: build
    runs-on: ubuntu-latest
    permissions:
      pages: write
      id-token: write
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v2
```
Commit this workflow and GitHub will automatically publish on each `main` push.

---
Enjoy slaying on GitHub Pages! Feel free to open PRs with enhancements, graphics, or new mechanics. 