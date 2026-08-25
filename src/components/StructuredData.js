// src/components/StructuredData.js
// JSON-LD Structured Data for Hello Trader
// Schemas: Organization, EducationalOrganization, WebSite,
//          BreadcrumbList, Course (ItemList), FAQPage
//
// All information is factually sourced from the existing website content.
// FAQPage schema matches the visible FAQ section on the landing page.
// FAQPage is supporting structured data only — not a rich-result guarantee.
// Google has deprecated FAQ rich results for most websites.

export default function StructuredData() {

  // Organization / EducationalOrganization
  const organizationSchema = {
    "@context": "https://schema.org",
    "@type": ["Organization", "EducationalOrganization"],
    "@id": "https://hellotraderinstitute.com/#organization",
    "name": "Hello Trader",
    "alternateName": "Hello Trader Institute",
    "url": "https://hellotraderinstitute.com",
    "logo": {
      "@type": "ImageObject",
      "url": "https://hellotraderinstitute.com/logo.png",
      "width": 800,
      "height": 800
    },
    "image": "https://hellotraderinstitute.com/logo.png",
    "description": "Hello Trader is a stock market education institute and trading technology platform based in India. Offering structured courses in technical analysis, equity, commodity, and derivative trading, combined with paper trading, algo trading, copy trading, and AI-powered market tools.",
    "foundingDate": "2020",
    "areaServed": { "@type": "Country", "name": "India" },
    "knowsAbout": [
      "Stock Market Education", "Technical Analysis", "Equity Trading",
      "Commodity Trading", "Derivative Trading", "Options Trading",
      "Algo Trading", "Paper Trading", "Copy Trading",
      "Risk Management", "Trading Psychology", "Price Action"
    ],
    "address": { "@type": "PostalAddress", "addressCountry": "IN" },
    "contactPoint": [{
      "@type": "ContactPoint",
      "telephone": "+91-94773-04939",
      "contactType": "customer support",
      "availableLanguage": ["English", "Hindi"]
    }],
    "email": "hellotraderinstitute@gmail.com",
    "sameAs": [
      "https://t.me/Hellotrader7272",
      "https://www.instagram.com/hello.trader/",
      "https://www.facebook.com/share/1acmR3qpes/",
      "https://whatsapp.com/channel/0029VbCouJAA89MiZysFsS2S"
    ]
  };

  // WebSite
  const websiteSchema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": "https://hellotraderinstitute.com/#website",
    "url": "https://hellotraderinstitute.com",
    "name": "Hello Trader",
    "description": "Stock Market Education & Trading Technology Platform — Hello Trader Institute",
    "inLanguage": "en-IN",
    "publisher": { "@id": "https://hellotraderinstitute.com/#organization" },
    "potentialAction": {
      "@type": "SearchAction",
      "target": { "@type": "EntryPoint", "urlTemplate": "https://hellotraderinstitute.com/?q={search_term_string}" },
      "query-input": "required name=search_term_string"
    }
  };

  // BreadcrumbList
  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [{ "@type": "ListItem", "position": 1, "name": "Home", "item": "https://hellotraderinstitute.com" }]
  };

  // Courses
  const coursesSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": "Hello Trader Stock Market Courses",
    "description": "Structured stock market education courses offered by Hello Trader Institute, India.",
    "url": "https://hellotraderinstitute.com",
    "itemListElement": [
      {
        "@type": "ListItem", "position": 1,
        "item": {
          "@type": "Course",
          "name": "Technical Analysis Course",
          "description": "Master chart reading, candlestick patterns, support and resistance, price action, and technical trading strategies for Indian stock markets.",
          "provider": { "@id": "https://hellotraderinstitute.com/#organization" },
          "teaches": ["Candlestick Patterns", "Price Action", "Support and Resistance", "Live Market Execution", "Risk-Reward Setup"],
          "educationalLevel": "Beginner to Intermediate",
          "courseMode": "blended", "timeRequired": "P2M",
          "offers": { "@type": "Offer", "price": "8000", "priceCurrency": "INR", "availability": "https://schema.org/InStock" }
        }
      },
      {
        "@type": "ListItem", "position": 2,
        "item": {
          "@type": "Course",
          "name": "Equity Trading Course",
          "description": "Learn equity market fundamentals, stock selection, intraday and swing trading strategies, and portfolio management for Indian markets.",
          "provider": { "@id": "https://hellotraderinstitute.com/#organization" },
          "teaches": ["Stock Selection Framework", "Intraday Trading", "Swing Trading", "Fundamental and Technical Blend", "Portfolio Allocation"],
          "educationalLevel": "Beginner to Intermediate",
          "courseMode": "blended", "timeRequired": "P2M",
          "offers": { "@type": "Offer", "price": "12000", "priceCurrency": "INR", "availability": "https://schema.org/InStock" }
        }
      },
      {
        "@type": "ListItem", "position": 3,
        "item": {
          "@type": "Course",
          "name": "Commodity Market Course",
          "description": "Comprehensive commodity trading course covering MCX gold, silver, crude oil, and agri commodities with global economic drivers and risk management.",
          "provider": { "@id": "https://hellotraderinstitute.com/#organization" },
          "teaches": ["MCX Gold and Silver Trading", "Crude Oil Trading", "Global Economic Drivers", "Commodity Cycle Timing", "Practical Risk Management"],
          "educationalLevel": "Intermediate",
          "courseMode": "blended", "timeRequired": "P3M",
          "offers": { "@type": "Offer", "price": "15000", "priceCurrency": "INR", "availability": "https://schema.org/InStock" }
        }
      },
      {
        "@type": "ListItem", "position": 4,
        "item": {
          "@type": "Course",
          "name": "Derivative Trading Course",
          "description": "Advanced options and futures trading course covering option Greeks, option chains, hedging strategies, and volatility management for NSE derivatives.",
          "provider": { "@id": "https://hellotraderinstitute.com/#organization" },
          "teaches": ["Futures and Options Fundamentals", "Option Greeks", "Option Chain Analysis", "Hedging and Spread Strategies", "Volatility Management"],
          "educationalLevel": "Advanced",
          "courseMode": "blended", "timeRequired": "P3M",
          "offers": { "@type": "Offer", "price": "24000", "priceCurrency": "INR", "availability": "https://schema.org/InStock" }
        }
      },
      {
        "@type": "ListItem", "position": 5,
        "item": {
          "@type": "Course",
          "name": "CFMT Program — Certified Financial Market Trader",
          "description": "Flagship 6-month comprehensive financial market training program covering equity, futures and options, MCX, algo trading, and professional trading tools with 1-on-1 mentorship.",
          "provider": { "@id": "https://hellotraderinstitute.com/#organization" },
          "teaches": ["Complete Equity and FnO Masterclass", "MCX Commodity Trading", "Algo Trading", "Trading Psychology", "Live Market Practice", "Professional Trading Tools"],
          "educationalLevel": "Beginner to Advanced",
          "courseMode": "blended", "timeRequired": "P6M",
          "offers": { "@type": "Offer", "price": "54000", "priceCurrency": "INR", "availability": "https://schema.org/InStock" }
        }
      }
    ]
  };

  // FAQPage
  // All Q&As match the visible FAQ section on the landing page.
  // Content is factually sourced from existing website information only.
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      {
        "@type": "Question", "name": "What is Hello Trader?",
        "acceptedAnswer": { "@type": "Answer", "text": "Hello Trader is a stock market education institute and trading technology platform based in India. It offers structured courses in technical analysis, equity, commodity, and derivative trading, combined with a paper trading simulator, algo trading tools, copy trading, and AI-powered market analytics through the Hello Trader Pro platform." }
      },
      {
        "@type": "Question", "name": "What stock market courses does Hello Trader offer?",
        "acceptedAnswer": { "@type": "Answer", "text": "Hello Trader offers five structured courses: Technical Analysis Course (8000 INR / 2 months), Equity Trading Course (12000 INR / 2 months), Commodity Market Course (15000 INR / 3 months), Derivative Trading Course (24000 INR / 3 months), and the flagship CFMT Program — Certified Financial Market Trader (54000 INR / 6 months) covering all asset classes including algo trading." }
      },
      {
        "@type": "Question", "name": "Is a free demo class available?",
        "acceptedAnswer": { "@type": "Answer", "text": "Yes. Hello Trader offers a free demo class before enrollment. You can book a free demo class by filling the enquiry form on the website or by contacting the team on WhatsApp at +91 94773 04939." }
      },
      {
        "@type": "Question", "name": "What is the CFMT Program?",
        "acceptedAnswer": { "@type": "Answer", "text": "The CFMT Program (Certified Financial Market Trader) is Hello Trader's flagship 6-month comprehensive training program. It covers equity, futures and options, MCX commodity trading, algo trading, live market practice, and professional trading tools, with 1-on-1 dedicated mentorship and lifetime community access. Course fee is 54000 INR." }
      },
      {
        "@type": "Question", "name": "What is Hello Trader Pro?",
        "acceptedAnswer": { "@type": "Answer", "text": "Hello Trader Pro is a trading technology platform provided to enrolled students. It includes a paper trading simulator with real-time market data, AI-powered market tools, algo trading, copy trading, a live trading terminal, option chain analytics, market scanner, trader dashboard, and market intelligence tools — all in one place." }
      },
      {
        "@type": "Question", "name": "What is paper trading and how does it help beginners?",
        "acceptedAnswer": { "@type": "Answer", "text": "Paper trading is a risk-free market simulation where you practice trading strategies using real market data without using real money. Hello Trader Pro provides a paper trading environment with simulated capital, allowing students to test strategies, build discipline, and understand market dynamics before deploying real capital." }
      },
      {
        "@type": "Question", "name": "How do I contact Hello Trader?",
        "acceptedAnswer": { "@type": "Answer", "text": "You can contact Hello Trader through: WhatsApp / Phone: +91 94773 04939, Email: hellotraderinstitute@gmail.com, Telegram: @Hellotrader7272, or by filling the enquiry form on the website at hellotraderinstitute.com." }
      },
      {
        "@type": "Question", "name": "Does Hello Trader teach algo trading?",
        "acceptedAnswer": { "@type": "Answer", "text": "Yes. Hello Trader covers algo trading as part of its curriculum, particularly in the CFMT Program. The Hello Trader Pro platform also includes algo trading tools that allow students to formulate, backtest, and automate rule-based trading strategies." }
      },
      {
        "@type": "Question", "name": "What is the teaching format at Hello Trader?",
        "acceptedAnswer": { "@type": "Answer", "text": "Hello Trader uses a 1 batch, 1 student model — meaning each batch has individual personalized guidance rather than large group classes. Teaching includes live market charting sessions, practical strategy application, and dedicated mentor support throughout the course." }
      }
    ]
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(coursesSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
    </>
  );
}
