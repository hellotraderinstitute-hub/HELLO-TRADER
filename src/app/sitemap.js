// src/app/sitemap.js
// Next.js App Router dynamic sitemap — served at /sitemap.xml

export default function sitemap() {
  const baseUrl = 'https://hellotraderinstitute.com';
  const lastModified = new Date().toISOString();

  return [
    {
      url: baseUrl,
      lastModified,
      changeFrequency: 'weekly',
      priority: 1.0,
    },
    {
      url: `${baseUrl}/register`,
      lastModified,
      changeFrequency: 'monthly',
      priority: 0.6,
    },
  ];
}
