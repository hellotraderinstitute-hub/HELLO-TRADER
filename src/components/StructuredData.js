// src/components/StructuredData.js
// Google-compatible JSON-LD structured data for Hello Trader
// Organization + EducationalOrganization + WebSite schema

export default function StructuredData() {
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
    "description": "India's premium stock market education and trading technology platform. Expert-led courses in technical analysis, equity, commodity, and derivative trading, combined with AI-powered market tools, paper trading, algo trading and copy trading.",
    "foundingDate": "2020",
    "address": {
      "@type": "PostalAddress",
      "addressCountry": "IN"
    },
    "contactPoint": [
      {
        "@type": "ContactPoint",
        "telephone": "+91-94773-04939",
        "contactType": "customer support",
        "availableLanguage": ["English", "Hindi"]
      }
    ],
    "sameAs": [
      "https://t.me/Hellotrader7272"
    ],
    "email": "hellotraderinstitute@gmail.com"
  };

  const websiteSchema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": "https://hellotraderinstitute.com/#website",
    "url": "https://hellotraderinstitute.com",
    "name": "Hello Trader",
    "description": "India's Premium Stock Market Education & Trading Technology Platform",
    "publisher": {
      "@id": "https://hellotraderinstitute.com/#organization"
    },
    "potentialAction": {
      "@type": "SearchAction",
      "target": {
        "@type": "EntryPoint",
        "urlTemplate": "https://hellotraderinstitute.com/?q={search_term_string}"
      },
      "query-input": "required name=search_term_string"
    }
  };

  const coursesSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": "Hello Trader Stock Market Courses",
    "description": "Structured stock market education courses by Hello Trader Institute",
    "url": "https://hellotraderinstitute.com",
    "itemListElement": [
      {
        "@type": "ListItem",
        "position": 1,
        "item": {
          "@type": "Course",
          "name": "Technical Analysis Course",
          "description": "Master chart reading, indicators, and technical trading strategies for Indian stock markets.",
          "provider": {
            "@id": "https://hellotraderinstitute.com/#organization"
          },
          "offers": {
            "@type": "Offer",
            "price": "8000",
            "priceCurrency": "INR",
            "availability": "https://schema.org/InStock"
          },
          "timeRequired": "P2M",
          "courseMode": "blended"
        }
      },
      {
        "@type": "ListItem",
        "position": 2,
        "item": {
          "@type": "Course",
          "name": "Equity Trading Course",
          "description": "Learn equity market fundamentals, stock selection and portfolio management for Indian markets.",
          "provider": {
            "@id": "https://hellotraderinstitute.com/#organization"
          },
          "offers": {
            "@type": "Offer",
            "price": "12000",
            "priceCurrency": "INR",
            "availability": "https://schema.org/InStock"
          },
          "timeRequired": "P2M",
          "courseMode": "blended"
        }
      },
      {
        "@type": "ListItem",
        "position": 3,
        "item": {
          "@type": "Course",
          "name": "Commodity Market Course",
          "description": "Comprehensive commodity trading course covering MCX, NCDEX, gold, silver, crude oil and agri commodities.",
          "provider": {
            "@id": "https://hellotraderinstitute.com/#organization"
          },
          "offers": {
            "@type": "Offer",
            "price": "15000",
            "priceCurrency": "INR",
            "availability": "https://schema.org/InStock"
          },
          "timeRequired": "P3M",
          "courseMode": "blended"
        }
      },
      {
        "@type": "ListItem",
        "position": 4,
        "item": {
          "@type": "Course",
          "name": "Derivative Trading Course",
          "description": "Advanced options and futures trading strategies for NSE derivatives market.",
          "provider": {
            "@id": "https://hellotraderinstitute.com/#organization"
          },
          "offers": {
            "@type": "Offer",
            "price": "24000",
            "priceCurrency": "INR",
            "availability": "https://schema.org/InStock"
          },
          "timeRequired": "P3M",
          "courseMode": "blended"
        }
      },
      {
        "@type": "ListItem",
        "position": 5,
        "item": {
          "@type": "Course",
          "name": "CFMT Program — Certified Financial Market Trader",
          "description": "Flagship 6-month comprehensive financial market trading certification covering all asset classes, algo trading and professional trading tools.",
          "provider": {
            "@id": "https://hellotraderinstitute.com/#organization"
          },
          "offers": {
            "@type": "Offer",
            "price": "54000",
            "priceCurrency": "INR",
            "availability": "https://schema.org/InStock"
          },
          "timeRequired": "P6M",
          "courseMode": "blended"
        }
      }
    ]
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(coursesSchema) }}
      />
    </>
  );
}
