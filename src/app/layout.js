import "./globals.css";
import Script from "next/script";
import { MarketProviderLayer } from "../context/MarketProviderContext";
import { TradingProvider } from "../context/TradingContext";
import { ReferralProvider } from "../context/ReferralContext";
import ErrorBoundary from "../components/ErrorBoundary";
import GlobalLoader from "../components/GlobalLoader";
import StructuredData from "../components/StructuredData";

const BASE_URL = "https://hellotraderinstitute.com";

export const viewport = {
  themeColor: "#0B0E14",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export const metadata = {
  metadataBase: new URL(BASE_URL),
  manifest: "/manifest.json",
  title: {
    default: "HELLO TRADER - India's Premium Stock Market Education & Trading Technology Platform",
    template: "%s | Hello Trader",
  },
  description:
    "Master the stock market with India's premium stock market education institute. Structured courses in technical analysis, equity, commodity & derivative trading — combined with AI-powered market tools, paper trading, algo trading & copy trading.",
  keywords: [
    "Hello Trader",
    "Hello Trader Institute",
    "Stock Market Course India",
    "Stock Market Education",
    "Stock Market Institute",
    "Technical Analysis Course",
    "Equity Trading Course",
    "Derivative Trading Course",
    "Commodity Market Course",
    "Paper Trading Platform",
    "AI-Powered Trading",
    "Algo Trading India",
    "Copy Trading",
    "Trading Platform India",
    "CFMT Program",
    "Certified Financial Market Trader",
    "Online Trading Course",
  ],
  authors: [{ name: "Hello Trader Institute", url: BASE_URL }],
  creator: "Hello Trader",
  publisher: "Hello Trader Institute",
  category: "Education",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  alternates: {
    canonical: BASE_URL,
  },
  icons: {
    icon: [
      { url: "/logo.png", type: "image/png" },
      { url: "/favicon.ico" },
    ],
    shortcut: "/logo.png",
    apple: "/logo.png",
  },
  openGraph: {
    title: "HELLO TRADER - India's Premium Stock Market Education & Trading Technology Platform",
    description:
      "Master the stock market with India's premium stock market education institute. Structured courses in technical analysis, equity, commodity & derivative trading — combined with AI-powered market tools, paper trading, algo trading & copy trading.",
    url: BASE_URL,
    siteName: "Hello Trader",
    images: [
      {
        url: `${BASE_URL}/logo.png`,
        width: 800,
        height: 800,
        alt: "Hello Trader — India's Premium Stock Market Education & Trading Technology Platform",
      },
    ],
    locale: "en_IN",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "HELLO TRADER - India's Premium Stock Market Education & Trading Technology Platform",
    description:
      "Master the stock market with India's premium stock market education institute. Structured courses in technical analysis, equity, commodity & derivative trading — combined with AI-powered market tools, paper trading, algo trading & copy trading.",
    images: [`${BASE_URL}/logo.png`],
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en-IN">
      <head>
        {/* Google tag (gtag.js) - Google Ads: AW-18112591783 */}
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=AW-18112591783"
          strategy="beforeInteractive"
        />
        <Script id="google-ads-gtag" strategy="beforeInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'AW-18112591783');
          `}
        </Script>
        <StructuredData />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body className="antialiased bg-[#0B0E14] text-white selection:bg-[#00D4FF] selection:text-black">
        <ErrorBoundary>
          <MarketProviderLayer>
            <TradingProvider>
              <ReferralProvider>
                <GlobalLoader>
                  {children}
                </GlobalLoader>
              </ReferralProvider>
            </TradingProvider>
          </MarketProviderLayer>
        </ErrorBoundary>

        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.getRegistrations().then(function(regs) {
                    for (let reg of regs) { reg.update(); }
                  });
                  navigator.serviceWorker.register('/sw.js?v=2').then(function(reg) {
                    if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
                  }).catch(function(err) { console.warn('[PWA] SW register error:', err); });
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
