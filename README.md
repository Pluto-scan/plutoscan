# PlutoScan

Beginner crypto course (18 lessons) + live 12-point Research Scanner, served at [plutoscan.com](https://plutoscan.com) via GitHub Pages.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Public landing page, login/sign-up modal and Stripe checkout entry point |
| `plutoscan-modules.html` | The course app (dashboard, lessons, quizzes, data widget, Research Scanner) |
| `plutoscan-auth.js` | Shared Firebase auth, progress/review saving and checkout helpers |
| `og-image.png` | Social share image (1200×630) |
| `refunds.html`, `terms.html`, `privacy.html` | Policy pages, linked from the landing footer, pricing card, FAQ, login modal and the course account menu |
| `404.html`, `legal.css` | Branded not-found page (GitHub Pages serves it for missing URLs) and the shared styles for the policy pages |
| `robots.txt`, `sitemap.xml` | SEO; the course page is excluded from indexing |

## How the paywall works

Lesson text and quizzes are **not** in this repo. `plutoscan-modules.html` calls the `getModuleContent` Cloud Function, which only returns content after verifying the Firebase login and `users/{uid}/paid === true`. That flag is only ever set by the Stripe webhook (`stripeWebhook`). Everything in this repo is public, so never commit lesson content here.

After checkout, Stripe redirects to `plutoscan-modules.html?purchase=success`. The page retries for ~30 seconds while the webhook marks the account as paid, so new buyers aren't bounced back to the landing page.

## Course content format (served by the Cloud Function)

`moduleParts.json`: `{ "<moduleId>": [ { "html": "...", "quiz": [ { "q", "choices", "correct", "explain" } ] } ] }`

- `explain` (optional) is shown after a correct answer.
- Lesson HTML can use these styled blocks: `callout`, `example-box`, `try-box`, `warn-box`, `rule-box`, `mistake-box`, `pro-box`, `summary-card`, `ol.steps`, `table.compare` (wrap in `.table-wrap`), `p.lead`, `p.fine`, and glossary links: `<a class="gloss-link" data-term="seed phrase">…</a>`.
- Every `data-term` must exist in the `GLOSSARY` object in `plutoscan-modules.html`.

## Database rules

Clients may write only `users/{uid}/progress` (cross-device progress) and `users/{uid}/review` (end-of-course rating). `paid` stays server-only.

## Before launch

- Make sure `support@plutoscan.com` receives mail. It's the contact address on every policy page.
- Keep `privacy.html` in step with what the site and the security log (`auditPlutoReport`) collect.

- Swap the Stripe test keys/price for live ones in the Cloud Functions config.
- Keep the course videos somewhere that isn't publicly listed if you want them behind the paywall.
