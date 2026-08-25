// src/app/register/layout.js
// Server component — provides metadata for the /register route segment.
// The page itself is a 'use client' redirect helper, so metadata must
// live here in the layout to be compatible with Next.js App Router.

export const metadata = {
  title: 'Enrollment — Hello Trader',
  description: 'Hello Trader enrollment and referral registration.',
  robots: {
    index: false,
    follow: true,
  },
  alternates: {
    canonical: 'https://hellotraderinstitute.com',
  },
};

export default function RegisterLayout({ children }) {
  return children;
}
