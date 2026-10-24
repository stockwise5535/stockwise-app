# SEO and Search Console setup

Build generates crawlable English `/en` and Japanese `/ja` HTML from shared copy, not machine translations. Both remain functional without JavaScript. Titles, descriptions, Open Graph metadata, localized internal links and alternate language links are generated. The current site's useful branding/assets are retained; the separate existing homepage repository was not modified.

Set `VITE_PUBLIC_SITE_URL` to the **actual approved HTTPS origin** before the build. Do not use a guessed domain or a preview URL as production canonical. With a valid origin, the build adds locale canonical/alternate links, Open Graph URL and `/sitemap.xml`. Without it, landing pages are noindex and robots disallows all crawling. Authenticated/private/demo routes stay noindex; invitation tokens must not enter indexed pages or analytics URLs. No canonical production domain is configured now.

1. Review English/Japanese copy, free-access terms, privacy contact/retention, signup and consultation routing.
2. Configure the approved origin and rebuild (`npm run build`). Inspect dist/en/index.html, dist/ja/index.html, robots.txt and sitemap.xml.
3. Test localized paths, canonical URLs and assets on a nonproduction staging host. Confirm the host serves the generated localized HTML; adapt rewrite rules only if staging evidence requires it.
4. Add the domain property in Google Search Console using an owner-controlled Google account.
5. Complete the provided DNS TXT verification at the domain provider. Do not invent a verification token or claim verification from a generated sitemap.
6. Submit the generated sitemap, inspect `/en` and `/ja`, and review indexing/canonical reports.
7. Publish only through a separately authorized deployment. This task has not deployed or verified Search Console.

Privacy/Terms are clearly labeled draft review pages. Search indexing and campaign launch should wait for approved public policies and backend verification. Do not add thin locale pages or automatic translations merely to target more countries.
