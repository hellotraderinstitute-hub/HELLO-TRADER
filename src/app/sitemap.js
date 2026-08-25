// src/app/sitemap.js
// Next.js App Router dynamic sitemap — served at /sitemap.xml
// Only includes canonical, indexable public pages.
// /register is excluded — it is a client-side redirect, not indexable content.

export default function sitemap() {
  const baseUrl = 'https://hellotraderinstitute.com';

  // Use a fixed date reflecting the last significant content/schema update.
  // Do NOT use new Date() — this makes the page appear "modified" on every
  // deployment and wastes crawl budget with no real content change.
  const lastModified = '2026-08-16';

  return [
    {
      url: baseUrl,
      lastModified,
      changeFrequency: 'monthly',
      priority: 1.0,
    },
  ];
}
