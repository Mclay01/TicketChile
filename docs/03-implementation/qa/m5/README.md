# M5 local visual and interaction evidence

Environment: isolated headless Chrome via loopback CDP, Next development preview, PostgreSQL 18.1 on `127.0.0.1:55439`. Each preview/test creates a new synthetic database and retains it. No application env credentials, production data, provider/Wallet calls or actual email delivery were used. Next reports env-file discovery, but the preview/build helpers override their keys before launch.

`browser-report.json` records **90 page/viewport combinations**: Home, catalog, search, no-results, category, event detail/selection, sign-in, sign-up, recovery, reset, FAQ, legal, contact, simulator, profile, My Tickets, ticket detail and purchase history, each at **390, 430, 768, 1024, 1440**. Checks: no horizontal overflow, visible page title, labels and no broken images. Native buyer credentials login, dialog focus/Escape, reduced-motion behavior and quantity-only navigation to M4 checkout also pass.

`state-report.json` records browser checks for an injected inventory failure (retry feedback and disabled continuation), actual M3 registration and recovery (queued encrypted messages, no email worker), and safe invalid-reset feedback. This is additional behavior evidence, not screenshots-only testing.

Representative mobile/desktop screenshots are committed for Home, catalog, event detail, sign-in, My Tickets and ticket detail, plus the inventory error. QR/account data in captures are synthetic and use a local-only signing key. The Next development indicator may appear. Existing fixture artwork is intentionally reused only in the disposable database; its printed dates/prices differ from the synthetic event data and must not be interpreted as live product content.

Reproduce from `apps/web`:

1. `node scripts/local-db.mjs start`
2. Start Chrome headless with a separate `.local/m5-chrome` profile, `--remote-debugging-address=127.0.0.1 --remote-debugging-port=9335`, without using a personal browser profile. On Windows launch hidden.
3. `node scripts/m5-preview.mjs` — loopback listener, inert provider configuration, synthetic security key and a newly named database. Use **http://localhost:3005**, matching M3 origin checks and configured NextAuth URLs.
4. `node scripts/m5-visual-qa.mjs` and `node scripts/m5-state-qa.mjs`.
5. Stop only this preview/isolated Chrome and `node scripts/local-db.mjs stop`. Fixture files/databases are retained.

Temporary failures corrected before the final pass: Tailwind auto-scanning generated artifacts (now source-only), missing synthetic rate-limit data key, and IP/localhost origin mismatch in the test harness. No production security guard was relaxed for QA.

Limits: browser matrix ran in Chrome development mode; the production build was verified separately with inert credentials/unreachable DB. This is not a mobile-device, cross-browser, assistive-technology or formal performance/accessibility certification. No external merchant, Google OAuth, Wallet or mail delivery end-to-end was executed.
