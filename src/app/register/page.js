'use client';

import { useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

// This page is a client-side redirect helper for referral links (?ref=CODE).
// It has no standalone content and should not appear in search results.
// Noindex is set at the layout level via generateMetadata below — but since
// this is a 'use client' page, we export metadata from a sibling server file.
// The noindex is handled via the meta tag approach compatible with Next.js App Router.


function RegisterRedirectContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const ref = searchParams.get('ref');
    if (ref) {
      router.push(`/?ref=${ref}`);
    } else {
      router.push('/');
    }
  }, [router, searchParams]);

  return (
    <div className="min-h-screen bg-[#0b0e14] flex items-center justify-center font-mono text-xs text-gray-400">
      <div className="text-center space-y-2">
        <div className="w-6 h-6 border-2 border-[#00d4ff] border-t-transparent rounded-full animate-spin mx-auto"></div>
        <span>Redirecting to terminal enrollment desk...</span>
      </div>
    </div>
  );
}

export default function RegisterRedirect() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0b0e14] flex items-center justify-center font-mono text-xs text-gray-400">
        <div className="text-center space-y-2">
          <div className="w-6 h-6 border-2 border-[#00d4ff] border-t-transparent rounded-full animate-spin mx-auto"></div>
          <span>Loading redirect parameters...</span>
        </div>
      </div>
    }>
      <RegisterRedirectContent />
    </Suspense>
  );
}
