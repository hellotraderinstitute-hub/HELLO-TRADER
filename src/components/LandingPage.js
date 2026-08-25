'use client';

import React, { useState, useEffect } from 'react';
import { 
  BookOpen, 
  Cpu, 
  TrendingUp, 
  ShieldCheck, 
  Award, 
  Users, 
  Clock, 
  Headphones, 
  ArrowRight, 
  CheckCircle2, 
  MessageSquare, 
  Send, 
  Menu, 
  X, 
  BarChart3, 
  Zap, 
  Copy, 
  Activity, 
  Terminal, 
  PieChart, 
  LineChart, 
  Sparkles,
  Lock,
  ChevronRight,
  Globe
} from 'lucide-react';
import InstallPwaModal from './InstallPwaModal';

// ─── FAQ Section Component ──────────────────────────────────────────────────
// Provides visible Q&A content that backs the FAQPage structured data schema.
// All answers are factually sourced from the existing Hello Trader website.
// No invented claims. No financial guarantees.
const FAQ_ITEMS = [
  {
    q: 'What is Hello Trader?',
    a: 'Hello Trader is a stock market education institute and trading technology platform based in India. It offers structured courses in technical analysis, equity, commodity, and derivative trading — combined with a paper trading simulator, algo trading tools, copy trading, and AI-powered market analytics through the Hello Trader Pro platform.'
  },
  {
    q: 'What stock market courses does Hello Trader offer?',
    a: 'Hello Trader offers five structured programs: Technical Analysis Course (₹8,000 · 2 months), Equity Trading Course (₹12,000 · 2 months), Commodity Market Course (₹15,000 · 3 months), Derivative Trading Course (₹24,000 · 3 months), and the flagship CFMT Program — Certified Financial Market Trader (₹54,000 · 6 months) covering all asset classes including algo trading.'
  },
  {
    q: 'Is a free demo class available?',
    a: 'Yes. Hello Trader offers a free demo class before any enrollment decision. You can book it by filling the enquiry form on the website or by contacting the team directly on WhatsApp at +91 94773 04939.'
  },
  {
    q: 'What is the CFMT Program?',
    a: 'The CFMT Program (Certified Financial Market Trader) is Hello Trader\'s flagship 6-month comprehensive program. It covers equity, futures and options, MCX commodity trading, algo trading, live market practice, and professional trading tools — with 1-on-1 dedicated mentorship and lifetime community access. Course fee: ₹54,000.'
  },
  {
    q: 'What is Hello Trader Pro?',
    a: 'Hello Trader Pro is a trading technology platform available to enrolled students. It includes a paper trading simulator with real-time market data, AI-powered market tools, algo trading, copy trading, a live trading terminal, option chain analytics, market scanner, trader dashboard, and market intelligence tools — all in one place.'
  },
  {
    q: 'What is paper trading and how does it help beginners?',
    a: 'Paper trading is a risk-free simulation where you practice strategies using real market data without deploying real capital. Hello Trader Pro\'s paper trading environment allows students to test setups, build discipline, and understand market dynamics safely before trading with real money.'
  },
  {
    q: 'Does Hello Trader teach algo trading?',
    a: 'Yes. Algo trading is covered as part of the CFMT Program curriculum. The Hello Trader Pro platform also provides algo trading tools that allow students to formulate, backtest, and automate rule-based trading strategies.'
  },
  {
    q: 'What is the teaching format at Hello Trader?',
    a: 'Hello Trader follows a 1 batch · 1 student model — meaning each batch receives individual personalized guidance rather than large group sessions. Teaching includes live market charting, practical strategy sessions, and dedicated mentor support throughout the duration of the course.'
  },
  {
    q: 'How do I contact Hello Trader?',
    a: 'WhatsApp / Phone: +91 94773 04939 · Email: hellotraderinstitute@gmail.com · Telegram: @Hellotrader7272. You can also fill the enquiry form directly on the website to request a callback or book a free demo class.'
  }
];

function FAQSection() {
  const [openIndex, setOpenIndex] = useState(null);
  const toggle = (i) => setOpenIndex(prev => prev === i ? null : i);

  return (
    <section id="faq" className="py-20 bg-[#0B0E14] border-t border-[#D4AF37]/20" aria-label="Frequently Asked Questions">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <span className="px-3.5 py-1.5 rounded-full bg-[#161B26] border border-[#D4AF37]/40 text-xs font-bold text-[#D4AF37]">
            FAQ
          </span>
          <h2 className="text-3xl sm:text-4xl font-black text-white mt-4">
            Frequently Asked Questions
          </h2>
          <p className="text-sm text-gray-400 mt-3">
            Common questions about Hello Trader courses, platform, and enrollment.
          </p>
        </div>

        <div className="space-y-3">
          {FAQ_ITEMS.map((item, i) => (
            <div
              key={i}
              className="bg-[#10131A] border border-[#D4AF37]/20 rounded-2xl overflow-hidden hover:border-[#D4AF37]/50 transition-colors"
            >
              <button
                onClick={() => toggle(i)}
                className="w-full flex items-center justify-between px-6 py-5 text-left gap-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]/50 rounded-2xl"
                aria-expanded={openIndex === i}
              >
                <span className="text-sm font-bold text-white leading-snug">{item.q}</span>
                <span
                  className={`shrink-0 w-6 h-6 rounded-full border border-[#D4AF37]/40 flex items-center justify-center text-[#D4AF37] transition-transform duration-300 ${openIndex === i ? 'rotate-45' : ''}`}
                  aria-hidden="true"
                >
                  +
                </span>
              </button>
              {openIndex === i && (
                <div className="px-6 pb-5">
                  <p className="text-sm text-gray-300 leading-relaxed border-t border-white/5 pt-4">
                    {item.a}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="mt-10 text-center">
          <p className="text-xs text-gray-500">
            Have more questions?{' '}
            <a
              href="https://wa.me/919477304939?text=Hi%20Hello%20Trader,%20I%20have%20a%20question."
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#D4AF37] hover:underline font-bold"
            >
              WhatsApp us directly →
            </a>
          </p>
          <p className="text-[10px] text-gray-600 mt-2">
            Disclaimer: Hello Trader provides stock market education and technology tools. Trading in financial markets involves risk. Educational content is for learning purposes only.
          </p>
        </div>
      </div>
    </section>
  );
}

export default function LandingPage({ onOpenLogin, onOpenSignup, isAuthenticated, onEnterTerminal }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [enquiryModalOpen, setEnquiryModalOpen] = useState(false);
  const [leadFormType, setLeadFormType] = useState('ENQUIRY'); // 'ENQUIRY' | 'DEMO'
  const [leadFormData, setLeadFormData] = useState({ name: '', phone: '', email: '', interest: 'Technical Analysis', message: '' });
  const [leadSubmitting, setLeadSubmitting] = useState(false);
  const [leadStatus, setLeadStatus] = useState(null);

  const handleOpenLeadModal = (type = 'ENQUIRY', courseTitle = '') => {
    setLeadFormType(type);
    if (courseTitle) {
      setLeadFormData(prev => ({ ...prev, interest: courseTitle }));
    }
    setLeadStatus(null);
    setEnquiryModalOpen(true);
  };

  const triggerContactConversion = () => {
    if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
      window.gtag('event', 'conversion', { 'send_to': 'AW-18112591783/E3gzCNWB96AcEKfv4LxD' });
    }
  };

  const handleLeadSubmit = async (e) => {
    e.preventDefault();
    if (!leadFormData.name || !leadFormData.phone) return;
    setLeadSubmitting(true);
    setLeadStatus(null);
    try {
      const endpoint = leadFormType === 'DEMO' ? '/api/leads/demo' : '/api/leads/enquiry';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(leadFormData)
      });
      const data = await res.json();
      if (data.success) {
        setLeadStatus({ success: true, message: data.message || 'Submitted successfully!' });
        triggerContactConversion();
        setLeadFormData({ name: '', phone: '', email: '', interest: 'Technical Analysis', message: '' });
        setTimeout(() => setEnquiryModalOpen(false), 2000);
      } else {
        setLeadStatus({ success: false, message: data.error || 'Failed to submit request.' });
      }
    } catch (err) {
      setLeadStatus({ success: false, message: 'Connection error. Please try again.' });
    } finally {
      setLeadSubmitting(false);
    }
  };

  // ─── Scroll Observer for Reveal Animations ───
  useEffect(() => {
    const observerCallback = (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
        }
      });
    };

    const observerOptions = {
      threshold: 0.12,
      rootMargin: '0px 0px -40px 0px'
    };

    const observer = new IntersectionObserver(observerCallback, observerOptions);
    const elements = document.querySelectorAll('.scroll-reveal');
    elements.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, []);

  const courses = [
    {
      id: 'ta',
      title: 'Technical Analysis',
      tagline: 'Chart patterns, candlesticks, support resistance and live market execution.',
      fee: '₹8,000',
      duration: '2 Months',
      highlights: ['Candlestick Patterns', 'Price Action & Support/Resistance', 'Live Market Execution', 'Risk-Reward Setup'],
      whatsappText: 'Hi Hello Trader, I want to enroll in your Technical Analysis course.'
    },
    {
      id: 'eq',
      title: 'Equity Trading',
      tagline: 'Professional equity market learning with practical strategies.',
      fee: '₹12,000',
      duration: '2 Months',
      highlights: ['Stock Selection Framework', 'Intraday & Swing Trading', 'Fundamental & Technical Blend', 'Portfolio Allocation'],
      whatsappText: 'Hi Hello Trader, I want to enroll in your Equity Trading course.'
    },
    {
      id: 'cm',
      title: 'Commodity Market',
      tagline: 'Gold, Silver, Crude Oil and commodity market training.',
      fee: '₹15,000',
      duration: '3 Months',
      highlights: ['MCX Gold, Silver & Crude Oil', 'Global Economic Drivers', 'Timing Commodity Cycles', 'Practical Risk Rules'],
      whatsappText: 'Hi Hello Trader, I want to enroll in your Commodity Market course.'
    },
    {
      id: 'dt',
      title: 'Derivative Trading',
      tagline: 'Master Futures & Options trading professionally.',
      fee: '₹24,000',
      duration: '3 Months',
      highlights: ['Futures & Options Fundamentals', 'Option Greeks & Option Chains', 'Hedging & Spread Strategies', 'Volatilty Management'],
      whatsappText: 'Hi Hello Trader, I want to enroll in your Derivative Trading course.'
    },
    {
      id: 'cfmt',
      title: 'CFMT Program',
      tagline: 'Complete Financial Market Training Program.',
      fee: '₹54,000',
      duration: '6 Months',
      badge: 'MOST COMPREHENSIVE',
      highlights: ['Complete Equity, F&O & MCX Masterclass', '1-on-1 Dedicated Mentorship', 'Live Market Practice & Psychology', 'Lifetime Community Access'],
      whatsappText: 'Hi Hello Trader, I want to enroll in your CFMT Program.'
    }
  ];

  const categories = [
    'Technical Analysis',
    'Equity',
    'Derivatives',
    'Commodity',
    'Trading Psychology',
    'Risk Management',
    'Price Action',
    'Practical Trading',
    'Live Market Learning'
  ];

  const whyUs = [
    { title: 'Practical Market Learning', desc: 'Real market charting and hands-on strategy application rather than pure theory.' },
    { title: 'Live Trading Sessions', desc: 'Observe and learn market structure analysis during live market hours.' },
    { title: 'Professional Risk Management', desc: 'Strict focus on capital protection, position sizing, and drawdown limits.' },
    { title: 'Beginner To Advanced Mentorship', desc: 'Step-by-step guidance tailored for complete beginners up to advanced traders.' },
    { title: 'Daily Market Updates', desc: 'Curated daily analysis, key market levels, and institutional activity insights.' },
    { title: 'Lifetime Community Support', desc: 'Continuous access to student discussion channels and mentor Q&A.' },
    { title: 'Separate Class • 1 Batch • 1 Student', desc: 'Personalized 1-on-1 guidance ensuring focused individual attention.' },
    { title: 'Free Demo Class Available', desc: 'Experience our teaching quality before making any enrollment decision.' }
  ];

  const proFeatures = [
    {
      id: 'paper-trading',
      title: 'Paper Trading',
      icon: LineChart,
      color: 'from-amber-500 to-yellow-500',
      desc: 'Practice strategies with real-time market data in a risk-free simulated environment before deploying capital.'
    },
    {
      id: 'ai-tools',
      title: 'AI-Powered Market Tools',
      icon: Sparkles,
      color: 'from-amber-400 to-yellow-600',
      desc: 'Smart market pattern recognition, sentiment analytics, and automated market scanning assistance.'
    },
    {
      id: 'algo-trading',
      title: 'Algo Trading',
      icon: Cpu,
      color: 'from-[#D4AF37] to-[#AA7C11]',
      desc: 'Formulate, backtest, and automate custom rule-based strategy execution with high-precision tools.'
    },
    {
      id: 'copy-trading',
      title: 'Copy Trading',
      icon: Copy,
      color: 'from-amber-500 to-yellow-400',
      desc: 'Explore, analyze, and replicate proven trading strategies transparently across connected accounts.'
    },
    {
      id: 'terminal',
      title: 'Trading Terminal',
      icon: Terminal,
      color: 'from-yellow-400 to-amber-600',
      desc: 'High-speed charting engine, multi-index tracking, live order book, and responsive execution interface.'
    },
    {
      id: 'analysis',
      title: 'Market Analysis',
      icon: BarChart3,
      color: 'from-amber-300 to-yellow-500',
      desc: 'Comprehensive technical indicators, Option Chain Greeks, FII/DII data tracking, and sector momentum.'
    },
    {
      id: 'dashboard',
      title: 'Trader Dashboard',
      icon: PieChart,
      color: 'from-yellow-500 to-amber-500',
      desc: 'Unified P&L analytics, win-rate tracking, equity curve visualization, and trading journal insights.'
    }
  ];

  const scrollTo = (id) => {
    setMobileMenuOpen(false);
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="min-h-screen bg-[#0B0E14] text-white font-sans selection:bg-[#D4AF37]/30 selection:text-[#FFD700]">
      {/* ─── NAVIGATION BAR ─── */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-[#0B0E14]/90 backdrop-blur-xl border-b border-[#D4AF37]/20 shadow-2xl transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          
          {/* Logo & Brand */}
          <a href="#hero" onClick={() => scrollTo('hero')} className="flex items-center gap-3 group">
            <img 
              src="/logo.png" 
              alt="Hello Trader Logo" 
              className="h-11 w-auto object-contain drop-shadow-[0_0_15px_rgba(212,175,55,0.4)] group-hover:scale-105 transition-transform duration-300"
              onError={(e) => { e.target.style.display = 'none'; }}
            />
            <div className="flex flex-col">
              <span className="font-black text-xl tracking-wider text-white flex items-center gap-1.5">
                HELLO <span className="text-[#D4AF37] group-hover:text-[#FFD700] transition-colors">TRADER</span>
              </span>
              <span className="text-[9px] font-semibold text-[#D4AF37]/90 tracking-widest uppercase">
                Stock Market Education & Tech
              </span>
            </div>
          </a>

          {/* Desktop Nav Items */}
          <nav className="hidden lg:flex items-center gap-3 xl:gap-5 text-xs font-semibold text-gray-300">
            <button onClick={() => scrollTo('hero')} className="hover:text-[#D4AF37] transition-colors whitespace-nowrap">Home</button>
            <button onClick={() => scrollTo('courses')} className="hover:text-[#D4AF37] transition-colors whitespace-nowrap">Courses</button>
            <button onClick={() => scrollTo('pro')} className="hover:text-[#D4AF37] transition-colors whitespace-nowrap">Hello Trader Pro</button>
            
            {/* Full links on xl (1280px+), collapsed into More menu on lg (1024-1279px) */}
            <button onClick={() => scrollTo('paper-trading')} className="hidden xl:block hover:text-[#D4AF37] transition-colors whitespace-nowrap">Paper Trading</button>
            <button onClick={() => scrollTo('algo-trading')} className="hidden xl:block hover:text-[#D4AF37] transition-colors whitespace-nowrap">Algo Trading</button>
            <button onClick={() => scrollTo('copy-trading')} className="hidden xl:block hover:text-[#D4AF37] transition-colors whitespace-nowrap">Copy Trading</button>
            <button onClick={() => scrollTo('about')} className="hidden xl:block hover:text-[#D4AF37] transition-colors whitespace-nowrap">About</button>
            <button onClick={() => scrollTo('contact')} className="hidden xl:block hover:text-[#D4AF37] transition-colors whitespace-nowrap">Contact</button>

            {/* Dropdown menu for lg screens (1024px to 1279px) */}
            <div className="relative xl:hidden">
              <button 
                onClick={() => setMoreMenuOpen(!moreMenuOpen)}
                className="flex items-center gap-1 hover:text-[#D4AF37] transition-colors py-1 focus:outline-none whitespace-nowrap"
              >
                <span>More</span>
                <ChevronRight className={`w-3.5 h-3.5 transition-transform ${moreMenuOpen ? 'rotate-90 text-[#D4AF37]' : ''}`} />
              </button>

              {moreMenuOpen && (
                <div className="absolute top-full left-0 mt-2 w-44 bg-[#10131A] border border-[#D4AF37]/30 rounded-xl shadow-2xl py-2 z-[60] animate-fade-in font-semibold text-xs space-y-1">
                  <button onClick={() => { scrollTo('paper-trading'); setMoreMenuOpen(false); }} className="block w-full text-left px-4 py-2 hover:bg-white/5 hover:text-[#D4AF37]">Paper Trading</button>
                  <button onClick={() => { scrollTo('algo-trading'); setMoreMenuOpen(false); }} className="block w-full text-left px-4 py-2 hover:bg-white/5 hover:text-[#D4AF37]">Algo Trading</button>
                  <button onClick={() => { scrollTo('copy-trading'); setMoreMenuOpen(false); }} className="block w-full text-left px-4 py-2 hover:bg-white/5 hover:text-[#D4AF37]">Copy Trading</button>
                  <button onClick={() => { scrollTo('about'); setMoreMenuOpen(false); }} className="block w-full text-left px-4 py-2 hover:bg-white/5 hover:text-[#D4AF37]">About</button>
                  <button onClick={() => { scrollTo('contact'); setMoreMenuOpen(false); }} className="block w-full text-left px-4 py-2 hover:bg-white/5 hover:text-[#D4AF37]">Contact</button>
                </div>
              )}
            </div>
          </nav>

          {/* Action CTAs */}
          <div className="hidden lg:flex items-center gap-2 xl:gap-3 shrink-0">
            <InstallPwaModal variant="header" />
            {isAuthenticated ? (
              <button 
                onClick={onEnterTerminal}
                className="btn-shimmer px-4 py-2 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#AA7C11] text-black font-extrabold text-xs hover:brightness-110 active:scale-[0.98] transition-all shadow-[0_0_20px_rgba(212,175,55,0.3)] flex items-center gap-1.5 shrink-0 whitespace-nowrap"
              >
                <Terminal className="w-3.5 h-3.5" />
                <span>ENTER TRADING DESK</span>
              </button>
            ) : (
              <>
                <button 
                  onClick={onOpenLogin}
                  className="px-3.5 py-2 rounded-xl border border-[#D4AF37]/40 hover:border-[#D4AF37] text-white hover:text-[#D4AF37] active:scale-[0.98] font-bold text-xs transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap"
                >
                  <Lock className="w-3.5 h-3.5 text-[#D4AF37]" />
                  <span>Login</span>
                </button>
                <button 
                  onClick={onOpenSignup}
                  className="btn-shimmer px-4 py-2 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#FFD700] text-black font-black text-xs hover:brightness-110 active:scale-[0.98] transition-all shadow-[0_0_20px_rgba(212,175,55,0.4)] flex items-center gap-1.5 shrink-0 whitespace-nowrap"
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>START LEARNING</span>
                </button>
              </>
            )}
          </div>

          {/* Mobile Menu Button */}
          <button 
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden p-2.5 rounded-xl bg-[#161B26] border border-[#D4AF37]/30 text-[#D4AF37] active:scale-95 transition-transform"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile Menu Drawer */}
        {mobileMenuOpen && (
          <div className="lg:hidden bg-[#10131A] border-b border-[#D4AF37]/30 px-6 py-6 space-y-4 font-semibold text-sm animate-fade-in-up">
            <button onClick={() => scrollTo('hero')} className="block w-full text-left py-2 hover:text-[#D4AF37]">Home</button>
            <button onClick={() => scrollTo('courses')} className="block w-full text-left py-2 hover:text-[#D4AF37]">Courses</button>
            <button onClick={() => scrollTo('pro')} className="block w-full text-left py-2 hover:text-[#D4AF37]">Hello Trader Pro</button>
            <button onClick={() => scrollTo('paper-trading')} className="block w-full text-left py-2 hover:text-[#D4AF37]">Paper Trading</button>
            <button onClick={() => scrollTo('algo-trading')} className="block w-full text-left py-2 hover:text-[#D4AF37]">Algo Trading</button>
            <button onClick={() => scrollTo('copy-trading')} className="block w-full text-left py-2 hover:text-[#D4AF37]">Copy Trading</button>
            <button onClick={() => scrollTo('about')} className="block w-full text-left py-2 hover:text-[#D4AF37]">About</button>
            <button onClick={() => scrollTo('contact')} className="block w-full text-left py-2 hover:text-[#D4AF37]">Contact</button>
            <div className="pt-4 border-t border-white/10 flex flex-col gap-3">
              <InstallPwaModal variant="sidebar" />
              {isAuthenticated ? (
                <button 
                  onClick={onEnterTerminal}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#AA7C11] text-black font-extrabold text-xs text-center active:scale-[0.98] transition-transform"
                >
                  ENTER TRADING DESK
                </button>
              ) : (
                <>
                  <button 
                    onClick={onOpenLogin}
                    className="w-full py-3 rounded-xl border border-[#D4AF37]/40 text-white font-bold text-xs text-center active:scale-[0.98] transition-transform"
                  >
                    Student Login
                  </button>
                  <button 
                    onClick={onOpenSignup}
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#FFD700] text-black font-extrabold text-xs text-center active:scale-[0.98] transition-transform"
                  >
                    START LEARNING
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </header>

      {/* ─── HERO SECTION WITH ANIMATED MARKET VISUAL ─── */}
      <section id="hero" className="relative pt-28 pb-20 md:pt-40 md:pb-28 overflow-hidden bg-grid-pattern">
        {/* Gold Ambient Pulse */}
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[750px] h-[750px] bg-[#D4AF37]/10 rounded-full blur-[150px] pointer-events-none animate-pulse-gold" />
        
        {/* Floating Gold Particles Effect */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-1/4 left-1/6 w-2 h-2 rounded-full bg-[#FFD700] animate-particle" />
          <div className="absolute top-1/2 left-3/4 w-1.5 h-1.5 rounded-full bg-[#D4AF37] animate-particle delay-200" />
          <div className="absolute top-2/3 left-1/3 w-2.5 h-2.5 rounded-full bg-[#FFD700] animate-particle delay-400" />
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            
            {/* Left Hero Content */}
            <div className="lg:col-span-7 text-center lg:text-left">
              
              {/* Dual Badge */}
              <div className="animate-fade-in-up inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#161B26]/90 border border-[#D4AF37]/40 text-xs font-bold text-[#D4AF37] mb-6 shadow-[0_0_20px_rgba(212,175,55,0.15)] backdrop-blur-md hover:border-[#D4AF37] transition-all">
                <span className="flex items-center gap-1"><BookOpen className="w-3.5 h-3.5" /> Stock Market Education</span>
                <span className="text-gray-500">•</span>
                <span className="flex items-center gap-1"><Cpu className="w-3.5 h-3.5" /> Trading Technology</span>
              </div>

              {/* Headline */}
              <h1 className="animate-fade-in-up delay-100 text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight text-white leading-[1.15]">
                HELLO TRADER
                <span className="block text-transparent bg-clip-text bg-gradient-to-r from-[#FFD700] via-[#D4AF37] to-[#F3E5AB] mt-2">
                  India's Premium Stock Market Education & Trading Technology Platform
                </span>
              </h1>

              {/* Supporting Text */}
              <p className="animate-fade-in-up delay-200 mt-6 text-base sm:text-lg text-gray-300 max-w-2xl font-medium leading-relaxed">
                Learn the markets. Practice your strategies. Use professional trading technology.
              </p>

              {/* CTAs */}
              <div className="animate-fade-in-up delay-300 mt-8 flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4">
                <button
                  onClick={() => scrollTo('courses')}
                  className="btn-shimmer w-full sm:w-auto px-8 py-4 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#FFD700] text-black font-black text-sm hover:brightness-110 active:scale-[0.98] transition-all shadow-[0_0_30px_rgba(212,175,55,0.4)] flex items-center justify-center gap-2 group"
                >
                  <span>START LEARNING</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </button>
                <button
                  onClick={() => scrollTo('pro')}
                  className="w-full sm:w-auto px-8 py-4 rounded-xl bg-[#161B26] border border-[#D4AF37]/40 hover:border-[#D4AF37] text-white hover:text-[#D4AF37] active:scale-[0.98] font-extrabold text-sm transition-all flex items-center justify-center gap-2"
                >
                  <span>EXPLORE HELLO TRADER PRO</span>
                  <ChevronRight className="w-4 h-4 text-[#D4AF37]" />
                </button>
              </div>

              {/* Trust Metrics */}
              <div className="animate-fade-in-up delay-400 mt-12 grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-[#10131A]/90 border border-[#D4AF37]/20 rounded-xl p-3 text-center backdrop-blur-md hover:border-[#D4AF37]/50 transition-colors">
                  <div className="text-xl font-black text-[#FFD700]">5000+</div>
                  <div className="text-[10px] text-gray-400 font-semibold mt-0.5">Students Trained</div>
                </div>
                <div className="bg-[#10131A]/90 border border-[#D4AF37]/20 rounded-xl p-3 text-center backdrop-blur-md hover:border-[#D4AF37]/50 transition-colors">
                  <div className="text-xl font-black text-[#FFD700]">7+ Years</div>
                  <div className="text-[10px] text-gray-400 font-semibold mt-0.5">Market Experience</div>
                </div>
                <div className="bg-[#10131A]/90 border border-[#D4AF37]/20 rounded-xl p-3 text-center backdrop-blur-md hover:border-[#D4AF37]/50 transition-colors">
                  <div className="text-xl font-black text-[#FFD700]">98%</div>
                  <div className="text-[10px] text-gray-400 font-semibold mt-0.5">Success Rate</div>
                </div>
                <div className="bg-[#10131A]/90 border border-[#D4AF37]/20 rounded-xl p-3 text-center backdrop-blur-md hover:border-[#D4AF37]/50 transition-colors">
                  <div className="text-xl font-black text-[#FFD700]">24/7</div>
                  <div className="text-[10px] text-gray-400 font-semibold mt-0.5">Mentorship</div>
                </div>
              </div>

            </div>

            {/* Right Hero Animated Market Visual Card */}
            <div className="lg:col-span-5 animate-fade-in-up delay-300">
              <div className="glass-panel-glow rounded-3xl p-6 relative overflow-hidden shadow-2xl border border-[#D4AF37]/30 group hover:border-[#D4AF37]/70 transition-all duration-500">
                
                {/* Live Ticker Bar */}
                <div className="flex items-center justify-between pb-4 border-b border-white/10">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#00FF41] animate-ping" />
                    <span className="text-xs font-black text-white tracking-wider uppercase">LIVE MARKET RADAR</span>
                  </div>
                  <span className="text-[10px] font-mono text-[#D4AF37] bg-[#D4AF37]/10 px-2 py-0.5 rounded border border-[#D4AF37]/30">
                    NSE REALTIME
                  </span>
                </div>

                {/* Index Tickers Row */}
                <div className="grid grid-cols-2 gap-3 my-4">
                  <div className="bg-[#0B0E14]/90 p-3 rounded-xl border border-white/5">
                    <span className="text-[10px] text-gray-400 block font-mono">NIFTY 50</span>
                    <span className="text-sm font-black text-white">24,580.40</span>
                    <span className="text-[10px] font-bold text-[#00FF41] block">+342.15 (+1.41%)</span>
                  </div>
                  <div className="bg-[#0B0E14]/90 p-3 rounded-xl border border-white/5">
                    <span className="text-[10px] text-gray-400 block font-mono">BANK NIFTY</span>
                    <span className="text-sm font-black text-white">52,410.15</span>
                    <span className="text-[10px] font-bold text-[#00FF41] block">+480.90 (+0.92%)</span>
                  </div>
                </div>

                {/* Animated Candlesticks Chart Area */}
                <div className="h-44 bg-[#0B0E14] rounded-2xl p-4 border border-white/5 relative flex items-end justify-between overflow-hidden">
                  
                  {/* Background Grid Lines */}
                  <div className="absolute inset-0 bg-grid-pattern opacity-40 pointer-events-none" />

                  {/* Dynamic Candlestick Bars */}
                  <div className="relative z-10 w-full h-full flex items-end justify-between px-2 gap-1.5">
                    <div className="w-4 bg-[#00FF41]/80 rounded-t animate-candle-1 shadow-[0_0_8px_rgba(0,255,65,0.4)]" />
                    <div className="w-4 bg-red-500/80 rounded-t animate-candle-2 shadow-[0_0_8px_rgba(239,68,68,0.4)]" />
                    <div className="w-4 bg-[#FFD700]/80 rounded-t animate-candle-3 shadow-[0_0_8px_rgba(255,215,0,0.4)]" />
                    <div className="w-4 bg-[#00FF41]/80 rounded-t animate-candle-1 shadow-[0_0_8px_rgba(0,255,65,0.4)]" />
                    <div className="w-4 bg-red-500/80 rounded-t animate-candle-2 shadow-[0_0_8px_rgba(239,68,68,0.4)]" />
                    <div className="w-4 bg-[#FFD700]/80 rounded-t animate-candle-3 shadow-[0_0_8px_rgba(255,215,0,0.4)]" />
                    <div className="w-4 bg-[#00FF41]/80 rounded-t animate-candle-1 shadow-[0_0_8px_rgba(0,255,65,0.4)]" />
                  </div>

                  {/* Animated Overlay Chart Line SVG */}
                  <svg className="absolute inset-0 w-full h-full pointer-events-none z-20" viewBox="0 0 400 160" fill="none">
                    <path 
                      d="M 10 140 Q 90 120, 160 100 T 280 60 T 390 20" 
                      stroke="#FFD700" 
                      strokeWidth="3" 
                      className="animate-chart-line" 
                    />
                    <circle cx="390" cy="20" r="5" fill="#FFD700" className="animate-ping" />
                  </svg>

                </div>

                {/* Signal Badge */}
                <div className="mt-4 flex items-center justify-between p-3 rounded-xl bg-gradient-to-r from-[#D4AF37]/20 to-[#FFD700]/10 border border-[#D4AF37]/40">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-[#FFD700]" />
                    <span className="text-xs font-bold text-white">AI PATTERN RADAR</span>
                  </div>
                  <span className="text-[10px] font-black text-[#FFD700] uppercase tracking-wider">
                    BULLISH REVERSAL CONFIRMED
                  </span>
                </div>

              </div>
            </div>

          </div>
        </div>
      </section>

      <div className="section-glow-divider" />

      {/* ─── TRUST & POSITIONING (EDUCATION -> PRACTICE -> TECHNOLOGY) ─── */}
      <section className="py-20 bg-[#0E1118] relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="text-center max-w-3xl mx-auto mb-16 scroll-reveal">
            <h2 className="text-xs font-black uppercase tracking-widest text-[#D4AF37]">THE TRADER'S JOURNEY</h2>
            <p className="text-3xl sm:text-4xl font-extrabold text-white mt-2">
              EDUCATION → PRACTICE → TECHNOLOGY
            </p>
            <p className="text-sm text-gray-400 mt-3">
              A structured roadmap to build confidence, discipline, and market mastery.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Step 1 */}
            <div className="scroll-reveal delay-100 bg-[#10131A] border border-[#D4AF37]/30 rounded-2xl p-8 relative card-premium-hover group shadow-xl">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-[#D4AF37] to-[#FFD700] text-black font-black flex items-center justify-center text-xl mb-6 shadow-[0_0_15px_rgba(212,175,55,0.4)] group-hover:scale-110 group-hover:rotate-3 transition-transform">
                1
              </div>
              <h3 className="text-xl font-extrabold text-white mb-2 group-hover:text-[#FFD700] transition-colors">
                LEARN
              </h3>
              <p className="text-sm text-gray-300 leading-relaxed">
                Build market knowledge through structured stock market education, chart patterns, risk management rules, and live market breakdown.
              </p>
              <div className="mt-6 flex items-center gap-2 text-xs font-bold text-[#D4AF37]">
                <BookOpen className="w-4 h-4" />
                <span>Structured Courses</span>
              </div>
            </div>

            {/* Step 2 */}
            <div className="scroll-reveal delay-200 bg-[#10131A] border border-[#D4AF37]/30 rounded-2xl p-8 relative card-premium-hover group shadow-xl">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-[#D4AF37] to-[#FFD700] text-black font-black flex items-center justify-center text-xl mb-6 shadow-[0_0_15px_rgba(212,175,55,0.4)] group-hover:scale-110 group-hover:rotate-3 transition-transform">
                2
              </div>
              <h3 className="text-xl font-extrabold text-white mb-2 group-hover:text-[#FFD700] transition-colors">
                PRACTICE
              </h3>
              <p className="text-sm text-gray-300 leading-relaxed">
                Use paper trading to practice strategies without real-money execution, test setups under real market data, and hone trading psychology.
              </p>
              <div className="mt-6 flex items-center gap-2 text-xs font-bold text-[#D4AF37]">
                <LineChart className="w-4 h-4" />
                <span>Risk-Free Simulator</span>
              </div>
            </div>

            {/* Step 3 */}
            <div className="scroll-reveal delay-300 bg-[#10131A] border border-[#D4AF37]/30 rounded-2xl p-8 relative card-premium-hover group shadow-xl">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-[#D4AF37] to-[#FFD700] text-black font-black flex items-center justify-center text-xl mb-6 shadow-[0_0_15px_rgba(212,175,55,0.4)] group-hover:scale-110 group-hover:rotate-3 transition-transform">
                3
              </div>
              <h3 className="text-xl font-extrabold text-white mb-2 group-hover:text-[#FFD700] transition-colors">
                USE TECHNOLOGY
              </h3>
              <p className="text-sm text-gray-300 leading-relaxed">
                Access Hello Trader Pro tools for market analysis, Option Chain analytics, algo trading rules, and copy trading insights in one place.
              </p>
              <div className="mt-6 flex items-center gap-2 text-xs font-bold text-[#D4AF37]">
                <Cpu className="w-4 h-4" />
                <span>Hello Trader Pro Platform</span>
              </div>
            </div>
          </div>

        </div>
      </section>

      <div className="section-glow-divider" />

      {/* ─── STOCK MARKET EDUCATION SECTION ─── */}
      <section id="courses" className="py-24 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          {/* Header */}
          <div className="text-center max-w-3xl mx-auto mb-16 scroll-reveal">
            <span className="px-3.5 py-1.5 rounded-full bg-[#161B26] border border-[#D4AF37]/40 text-xs font-bold text-[#D4AF37]">
              ACADEMIC PROGRAMS
            </span>
            <h2 className="text-3xl sm:text-5xl font-black text-white mt-4 tracking-tight">
              STOCK MARKET EDUCATION
            </h2>
            <p className="text-base text-gray-300 mt-3 font-medium">
              Professional market education programs taught with real practical learning.
            </p>
          </div>

          {/* Category Badges */}
          <div className="scroll-reveal delay-100 flex flex-wrap items-center justify-center gap-2 max-w-4xl mx-auto mb-14">
            {categories.map((cat, idx) => (
              <span 
                key={idx}
                className="px-3.5 py-1.5 rounded-xl bg-[#10131A] border border-[#D4AF37]/30 text-gray-300 text-xs font-bold hover:border-[#D4AF37] hover:text-[#FFD700] hover:scale-105 transition-all cursor-default"
              >
                {cat}
              </span>
            ))}
          </div>

          {/* Courses Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {courses.map((course, index) => (
              <div 
                key={course.id}
                className={`scroll-reveal delay-${(index % 3 + 1) * 100} bg-[#10131A] border rounded-2xl p-7 flex flex-col justify-between relative card-premium-hover group shadow-xl ${
                  course.badge 
                    ? 'border-[#D4AF37] shadow-[0_0_25px_rgba(212,175,55,0.2)]' 
                    : 'border-[#D4AF37]/20 hover:border-[#D4AF37]/80'
                }`}
              >
                {course.badge && (
                  <span className="absolute -top-3.5 left-6 px-3 py-1 rounded-full bg-gradient-to-r from-[#D4AF37] to-[#FFD700] text-black font-black text-[10px] tracking-wider uppercase shadow-md">
                    {course.badge}
                  </span>
                )}

                <div>
                  <h3 className="text-2xl font-extrabold text-white mb-2 group-hover:text-[#FFD700] transition-colors">{course.title}</h3>
                  <p className="text-xs text-gray-300 min-h-[36px] leading-relaxed mb-6">{course.tagline}</p>
                  
                  {/* Fee & Duration Box */}
                  <div className="bg-[#0B0E14] border border-white/5 rounded-xl p-4 mb-6 flex items-center justify-between group-hover:border-[#D4AF37]/30 transition-colors">
                    <div>
                      <span className="text-[10px] text-gray-400 font-bold uppercase block">Course Fee</span>
                      <span className="text-xl font-black text-[#FFD700]">{course.fee}</span>
                    </div>
                    <div className="h-8 w-[1px] bg-white/10" />
                    <div className="text-right">
                      <span className="text-[10px] text-gray-400 font-bold uppercase block">Duration</span>
                      <span className="text-sm font-bold text-white flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-[#D4AF37]" />
                        {course.duration}
                      </span>
                    </div>
                  </div>

                  {/* Syllabus Highlights */}
                  <div className="space-y-2 mb-8">
                    {course.highlights.map((h, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs text-gray-300">
                        <CheckCircle2 className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
                        <span>{h}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <button 
                    onClick={() => handleOpenLeadModal('ENQUIRY', course.title)}
                    className="btn-shimmer w-full py-3.5 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#FFD700] text-black font-black text-xs text-center hover:brightness-110 active:scale-[0.98] transition-all shadow-[0_0_15px_rgba(212,175,55,0.3)] flex items-center justify-center gap-2"
                  >
                    <BookOpen className="w-4 h-4" />
                    Enquire Now / Book Demo
                  </button>
                  <a 
                    href={`https://wa.me/919477304939?text=${encodeURIComponent(course.whatsappText)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={triggerContactConversion}
                    className="w-full py-2.5 rounded-xl bg-[#161B26] border border-[#D4AF37]/30 text-gray-300 font-bold text-[11px] text-center hover:text-white hover:border-[#D4AF37] transition-all flex items-center justify-center gap-2"
                  >
                    <MessageSquare className="w-3.5 h-3.5 text-[#D4AF37]" />
                    WhatsApp Directly
                  </a>
                </div>
              </div>
            ))}
          </div>

          {/* Why Hello Trader Grid */}
          <div className="scroll-reveal mt-24 bg-[#10131A] border border-[#D4AF37]/30 rounded-3xl p-8 sm:p-12 shadow-2xl">
            <div className="text-center max-w-2xl mx-auto mb-12">
              <h3 className="text-2xl sm:text-3xl font-black text-white">WHY HELLO TRADER?</h3>
              <p className="text-xs text-gray-400 mt-2 font-medium">Built on transparency, practical market exposure, and dedicated personal mentorship.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {whyUs.map((w, idx) => (
                <div key={idx} className="bg-[#0B0E14] border border-white/5 rounded-2xl p-5 card-premium-hover">
                  <div className="w-8 h-8 rounded-lg bg-[#D4AF37]/10 text-[#D4AF37] font-bold flex items-center justify-center mb-3">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <h4 className="text-sm font-extrabold text-white mb-1">{w.title}</h4>
                  <p className="text-xs text-gray-400 leading-relaxed">{w.desc}</p>
                </div>
              ))}
            </div>

            <div className="mt-10 text-center pt-8 border-t border-white/5 flex flex-col sm:flex-row items-center justify-center gap-4">
              <span className="text-xs text-[#FFD700] font-bold">
                ✨ Free Demo Class Available Before Enrollment
              </span>
              <a 
                href="https://wa.me/919477304939?text=Hi%20Hello%20Trader,%20I%20want%20to%20book%20a%20Free%20Demo%20Class."
                target="_blank"
                rel="noopener noreferrer"
                onClick={triggerContactConversion}
                className="px-6 py-2.5 rounded-xl bg-[#161B26] border border-[#D4AF37]/50 text-white hover:text-[#D4AF37] active:scale-95 font-bold text-xs transition-all"
              >
                Book Free Demo Class
              </a>
            </div>
          </div>

        </div>
      </section>

      <div className="section-glow-divider" />

      {/* ─── HELLO TRADER PRO SECTION ─── */}
      <section id="pro" className="py-24 bg-[#0E1118] relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          {/* Header */}
          <div className="text-center max-w-3xl mx-auto mb-16 scroll-reveal">
            <span className="px-3.5 py-1.5 rounded-full bg-[#161B26] border border-[#D4AF37]/40 text-xs font-bold text-[#D4AF37]">
              TRADING TECHNOLOGY ECOSYSTEM
            </span>
            <h2 className="text-3xl sm:text-5xl font-black text-white mt-4 tracking-tight">
              HELLO TRADER PRO
            </h2>
            <p className="text-lg font-bold text-[#FFD700] mt-2">
              AI-Powered Trading & Paper Trading Platform
            </p>
            <p className="text-sm text-gray-300 mt-4 leading-relaxed max-w-2xl mx-auto">
              A technology platform designed to help traders analyze markets, practice strategies and access trading tools in one place.
            </p>
          </div>

          {/* Feature Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {proFeatures.map((feat, index) => {
              const Icon = feat.icon;
              return (
                <div 
                  key={feat.id}
                  id={feat.id}
                  className={`scroll-reveal delay-${(index % 3 + 1) * 100} bg-[#10131A] border border-[#D4AF37]/20 rounded-2xl p-7 card-premium-hover group shadow-xl`}
                >
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-r ${feat.color} text-black flex items-center justify-center mb-6 shadow-md group-hover:scale-110 group-hover:rotate-3 transition-transform`}>
                    <Icon className="w-6 h-6" />
                  </div>
                  <h3 className="text-xl font-extrabold text-white mb-2 group-hover:text-[#FFD700] transition-colors">
                    {feat.title}
                  </h3>
                  <p className="text-xs text-gray-300 leading-relaxed mb-6">
                    {feat.desc}
                  </p>
                  <button 
                    onClick={onOpenLogin}
                    className="text-xs font-bold text-[#D4AF37] hover:text-[#FFD700] flex items-center gap-1 transition-colors group-hover:translate-x-1.5"
                  >
                    <span>Access Tool</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>

          {/* Platform Action Banner */}
          <div className="scroll-reveal mt-16 bg-gradient-to-r from-[#10131A] via-[#161B26] to-[#10131A] border border-[#D4AF37]/40 rounded-3xl p-8 sm:p-12 text-center relative overflow-hidden shadow-2xl">
            <h3 className="text-2xl sm:text-3xl font-black text-white">
              Ready to Explore Hello Trader Pro?
            </h3>
            <p className="text-xs sm:text-sm text-gray-300 mt-2 max-w-xl mx-auto">
              Access live market tools, paper trading environment, option chain analytics, and trading workspace.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
              <button 
                onClick={onOpenSignup}
                className="btn-shimmer px-8 py-3.5 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#FFD700] text-black font-black text-xs hover:brightness-110 active:scale-[0.98] transition-all shadow-[0_0_25px_rgba(212,175,55,0.4)]"
              >
                EXPLORE PLATFORM
              </button>
              <button 
                onClick={onOpenLogin}
                className="px-8 py-3.5 rounded-xl bg-[#0B0E14] border border-[#D4AF37]/40 text-white hover:text-[#D4AF37] active:scale-[0.98] font-extrabold text-xs transition-colors"
              >
                STUDENT LOGIN
              </button>
            </div>
          </div>

        </div>
      </section>

      {/* ─── ABOUT US SECTION ─── */}
      <section id="about" className="py-24 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            
            <div className="scroll-reveal">
              <span className="px-3.5 py-1.5 rounded-full bg-[#161B26] border border-[#D4AF37]/40 text-xs font-bold text-[#D4AF37]">
                ABOUT HELLO TRADER
              </span>
              <h2 className="text-3xl sm:text-4xl font-black text-white mt-4">
                Empowering India's Next Generation of Discipline-Driven Traders
              </h2>
              <p className="text-sm text-gray-300 mt-4 leading-relaxed">
                Hello Trader is a premier stock market education institute and trading technology platform based in India. Founded with a vision to eliminate market gambling mindsets, we teach structured price action, technical analysis, derivatives hedging, and professional risk management.
              </p>
              <p className="text-sm text-gray-300 mt-3 leading-relaxed">
                We combine personalized 1-on-1 batch learning with modern paper trading tools and analytical software so our students can practice strategies in a safe environment before trading real capital.
              </p>

              <div className="mt-8 grid grid-cols-2 gap-4">
                <div className="border border-white/10 bg-[#10131A] p-4 rounded-xl card-premium-hover">
                  <div className="text-xs font-bold text-[#FFD700]">1 Batch • 1 Student</div>
                  <div className="text-[11px] text-gray-400 mt-1">Individual guidance focus</div>
                </div>
                <div className="border border-white/10 bg-[#10131A] p-4 rounded-xl card-premium-hover">
                  <div className="text-xs font-bold text-[#FFD700]">Practical Exposure</div>
                  <div className="text-[11px] text-gray-400 mt-1">Live market charting & analysis</div>
                </div>
              </div>
            </div>

            <div className="scroll-reveal delay-200 bg-[#10131A] border border-[#D4AF37]/30 rounded-3xl p-8 shadow-2xl relative card-premium-hover">
              <div className="flex items-center gap-4 mb-6">
                <img 
                  src="/logo.png" 
                  alt="Hello Trader Institute Logo" 
                  className="h-16 w-auto object-contain"
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
                <div>
                  <h3 className="text-xl font-extrabold text-white">Hello Trader Institute</h3>
                  <p className="text-xs text-[#D4AF37] font-semibold">Live Trading • Mentorship • Professional Learning</p>
                </div>
              </div>

              <div className="space-y-3 text-xs text-gray-300 pt-4 border-t border-white/10">
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Head Mentor Support</span>
                  <span className="font-bold text-white">+91 94773 04939</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Email Address</span>
                  <span className="font-bold text-white">hellotraderinstitute@gmail.com</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Official Telegram</span>
                  <a href="https://t.me/Hellotrader7272" target="_blank" rel="noopener noreferrer" className="font-bold text-[#D4AF37] hover:underline">
                    @Hellotrader7272
                  </a>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ─── ENQUIRY & FREE DEMO LEAD FORM SECTION ─── */}
      <section id="enquiry-section" className="py-20 bg-gradient-to-b from-[#0B0E14] via-[#10141F] to-[#070A10] border-t border-[#D4AF37]/20 relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            
            {/* Left Column: Heading & Trust */}
            <div className="lg:col-span-5 space-y-6">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#D4AF37]/10 border border-[#D4AF37]/30 text-xs font-bold text-[#FFD700]">
                <Sparkles className="w-3.5 h-3.5" /> Direct Counselor Support
              </div>
              <h2 className="text-3xl sm:text-4xl font-black text-white leading-tight">
                Start Your Trading Journey Today
              </h2>
              <p className="text-sm text-gray-300 leading-relaxed">
                Fill out the form to request a free demo class or enquire about our specialized stock market courses. Our expert team will get in touch with you immediately.
              </p>
              
              <div className="space-y-3 text-xs text-gray-300 pt-4">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-4 h-4 text-[#FFD700]" />
                  <span>1-on-1 Personalized Live Batch Guidance</span>
                </div>
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-4 h-4 text-[#FFD700]" />
                  <span>Free Demo Class Before Admission</span>
                </div>
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-4 h-4 text-[#FFD700]" />
                  <span>Lifetime Community & Mentorship Access</span>
                </div>
              </div>
            </div>

            {/* Right Column: Embedded Lead Form */}
            <div className="lg:col-span-7">
              <div className="glass-panel-glow rounded-3xl p-8 border border-[#D4AF37]/40 shadow-2xl relative bg-[#0D111A]/90">
                <h3 className="text-xl font-bold text-white mb-2">Book Free Demo / Course Enquiry</h3>
                <p className="text-xs text-gray-400 mb-6">Complete the quick form below. Instant callback guaranteed.</p>

                {leadStatus && (
                  <div className={`p-4 rounded-xl mb-6 text-xs font-bold ${leadStatus.success ? 'bg-emerald-500/20 border border-emerald-500/50 text-emerald-400' : 'bg-rose-500/20 border border-rose-500/50 text-rose-400'}`}>
                    {leadStatus.message}
                  </div>
                )}

                <form onSubmit={handleLeadSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-300 mb-1">Your Name *</label>
                      <input
                        type="text"
                        required
                        placeholder="Rahul Sharma"
                        value={leadFormData.name}
                        onChange={e => setLeadFormData({ ...leadFormData, name: e.target.value })}
                        className="w-full px-4 py-3 rounded-xl bg-[#161B26] border border-white/10 text-white text-xs focus:outline-none focus:border-[#D4AF37] transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-300 mb-1">Phone / WhatsApp Number *</label>
                      <input
                        type="tel"
                        required
                        placeholder="+91 94773 04939"
                        value={leadFormData.phone}
                        onChange={e => setLeadFormData({ ...leadFormData, phone: e.target.value })}
                        className="w-full px-4 py-3 rounded-xl bg-[#161B26] border border-white/10 text-white text-xs focus:outline-none focus:border-[#D4AF37] transition-colors"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-300 mb-1">Email Address (Optional)</label>
                      <input
                        type="email"
                        placeholder="rahul@gmail.com"
                        value={leadFormData.email}
                        onChange={e => setLeadFormData({ ...leadFormData, email: e.target.value })}
                        className="w-full px-4 py-3 rounded-xl bg-[#161B26] border border-white/10 text-white text-xs focus:outline-none focus:border-[#D4AF37] transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-300 mb-1">Course Interest</label>
                      <select
                        value={leadFormData.interest}
                        onChange={e => setLeadFormData({ ...leadFormData, interest: e.target.value })}
                        className="w-full px-4 py-3 rounded-xl bg-[#161B26] border border-white/10 text-white text-xs focus:outline-none focus:border-[#D4AF37] transition-colors"
                      >
                        <option value="Technical Analysis">Technical Analysis (₹8,000)</option>
                        <option value="Equity Trading">Equity Trading (₹12,000)</option>
                        <option value="Commodity Market">Commodity Market (₹15,000)</option>
                        <option value="Derivative Trading">Derivative Trading (₹24,000)</option>
                        <option value="CFMT Program">CFMT Program (₹54,000)</option>
                        <option value="Free Demo Class">Free Demo Class</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-300 mb-1">Message / Question (Optional)</label>
                    <textarea
                      rows={3}
                      placeholder="I want to know about the upcoming batch dates..."
                      value={leadFormData.message}
                      onChange={e => setLeadFormData({ ...leadFormData, message: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl bg-[#161B26] border border-white/10 text-white text-xs focus:outline-none focus:border-[#D4AF37] transition-colors resize-none"
                    />
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3 pt-2">
                    <button
                      type="submit"
                      disabled={leadSubmitting}
                      onClick={() => setLeadFormType('ENQUIRY')}
                      className="flex-1 py-3.5 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#FFD700] text-black font-extrabold text-xs active:scale-[0.98] hover:brightness-110 transition-all shadow-[0_0_20px_rgba(212,175,55,0.3)] disabled:opacity-50"
                    >
                      {leadSubmitting && leadFormType === 'ENQUIRY' ? 'SENDING...' : 'SUBMIT COURSE ENQUIRY'}
                    </button>
                    <button
                      type="submit"
                      disabled={leadSubmitting}
                      onClick={() => setLeadFormType('DEMO')}
                      className="flex-1 py-3.5 rounded-xl bg-[#161B26] border border-[#D4AF37]/50 text-[#FFD700] font-extrabold text-xs active:scale-[0.98] hover:bg-[#D4AF37]/10 transition-all disabled:opacity-50"
                    >
                      {leadSubmitting && leadFormType === 'DEMO' ? 'BOOKING...' : 'BOOK FREE DEMO CLASS'}
                    </button>
                  </div>
                </form>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ─── POPUP MODAL ENQUIRY FORM ─── */}
      {enquiryModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="bg-[#0F131C] border border-[#D4AF37]/40 rounded-3xl max-w-lg w-full p-6 sm:p-8 relative shadow-2xl">
            <button
              onClick={() => setEnquiryModalOpen(false)}
              className="absolute top-4 right-4 p-2 text-gray-400 hover:text-white rounded-full bg-white/5"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="mb-6">
              <span className="text-[10px] font-mono text-[#D4AF37] uppercase tracking-wider">INSTANT ENQUIRY</span>
              <h3 className="text-xl font-black text-white mt-1">
                {leadFormType === 'DEMO' ? 'Book Free Demo Class' : 'Course Enquiry Form'}
              </h3>
              <p className="text-xs text-gray-400 mt-1">Our team will call you within 15 minutes.</p>
            </div>

            {leadStatus && (
              <div className={`p-4 rounded-xl mb-4 text-xs font-bold ${leadStatus.success ? 'bg-emerald-500/20 border border-emerald-500/50 text-emerald-400' : 'bg-rose-500/20 border border-rose-500/50 text-rose-400'}`}>
                {leadStatus.message}
              </div>
            )}

            <form onSubmit={handleLeadSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-300 mb-1">Your Full Name *</label>
                <input
                  type="text"
                  required
                  placeholder="Rahul Sharma"
                  value={leadFormData.name}
                  onChange={e => setLeadFormData({ ...leadFormData, name: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl bg-[#161B26] border border-white/10 text-white text-xs focus:outline-none focus:border-[#D4AF37]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-300 mb-1">Phone / WhatsApp Number *</label>
                <input
                  type="tel"
                  required
                  placeholder="+91 94773 04939"
                  value={leadFormData.phone}
                  onChange={e => setLeadFormData({ ...leadFormData, phone: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl bg-[#161B26] border border-white/10 text-white text-xs focus:outline-none focus:border-[#D4AF37]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-300 mb-1">Course Interest</label>
                <select
                  value={leadFormData.interest}
                  onChange={e => setLeadFormData({ ...leadFormData, interest: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl bg-[#161B26] border border-white/10 text-white text-xs focus:outline-none focus:border-[#D4AF37]"
                >
                  <option value="Technical Analysis">Technical Analysis (₹8,000)</option>
                  <option value="Equity Trading">Equity Trading (₹12,000)</option>
                  <option value="Commodity Market">Commodity Market (₹15,000)</option>
                  <option value="Derivative Trading">Derivative Trading (₹24,000)</option>
                  <option value="CFMT Program">CFMT Program (₹54,000)</option>
                  <option value="Free Demo Class">Free Demo Class</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-300 mb-1">Message (Optional)</label>
                <textarea
                  rows={2}
                  placeholder="Any questions for mentor..."
                  value={leadFormData.message}
                  onChange={e => setLeadFormData({ ...leadFormData, message: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl bg-[#161B26] border border-white/10 text-white text-xs focus:outline-none focus:border-[#D4AF37] resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={leadSubmitting}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#FFD700] text-black font-extrabold text-xs active:scale-[0.98] hover:brightness-110 transition-all shadow-[0_0_20px_rgba(212,175,55,0.3)] disabled:opacity-50 mt-2"
              >
                {leadSubmitting ? 'SUBMITTING...' : 'SUBMIT ENQUIRY NOW'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ─── FAQ SECTION (AEO / ANSWER ENGINE OPTIMIZATION) ─── */}
      {/* All answers are factually sourced from existing Hello Trader content only. */}
      <FAQSection />

      {/* ─── CONTACT & COMMUNITY FOOTER ─── */}
      <footer id="contact" className="bg-[#070A10] border-t border-[#D4AF37]/30 pt-16 pb-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-10 pb-12 border-b border-white/10">
            
            {/* Col 1: Brand */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <img src="/logo.png" alt="Logo" className="h-10 w-auto" onError={(e) => { e.target.style.display = 'none'; }} />
                <span className="font-black text-lg text-white">HELLO <span className="text-[#D4AF37]">TRADER</span></span>
              </div>
              <p className="text-xs text-gray-400 leading-relaxed">
                India's Premium Stock Market Education & Trading Technology Platform. Master Technical Analysis, Equity, Derivatives & Commodity Trading.
              </p>
              <div className="text-[10px] text-gray-500 font-mono">
                Email: hellotraderinstitute@gmail.com<br />
                Support / WhatsApp: +91 94773 04939
              </div>
            </div>

            {/* Col 2: Navigation */}
            <div>
              <h4 className="text-xs font-black text-white uppercase tracking-wider mb-4">Quick Links</h4>
              <ul className="space-y-2 text-xs text-gray-400">
                <li><button onClick={() => scrollTo('hero')} className="hover:text-[#D4AF37]">Home</button></li>
                <li><button onClick={() => scrollTo('courses')} className="hover:text-[#D4AF37]">Stock Market Courses</button></li>
                <li><button onClick={() => scrollTo('pro')} className="hover:text-[#D4AF37]">Hello Trader Pro Platform</button></li>
                <li><button onClick={() => scrollTo('paper-trading')} className="hover:text-[#D4AF37]">Paper Trading</button></li>
                <li><button onClick={() => scrollTo('algo-trading')} className="hover:text-[#D4AF37]">Algo Trading</button></li>
                <li><button onClick={() => scrollTo('copy-trading')} className="hover:text-[#D4AF37]">Copy Trading</button></li>
              </ul>
            </div>

            {/* Col 3: Programs */}
            <div>
              <h4 className="text-xs font-black text-white uppercase tracking-wider mb-4">Education Programs</h4>
              <ul className="space-y-2 text-xs text-gray-400">
                <li>Technical Analysis (₹8,000)</li>
                <li>Equity Trading (₹12,000)</li>
                <li>Commodity Market (₹15,000)</li>
                <li>Derivative Trading (₹24,000)</li>
                <li>CFMT Program (₹54,000)</li>
              </ul>
            </div>

            {/* Col 4: Official Social Channels */}
            <div>
              <h4 className="text-xs font-black text-white uppercase tracking-wider mb-4">Official Channels</h4>
              <div className="space-y-2.5">
                <a 
                  href="https://wa.me/919477304939" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  onClick={triggerContactConversion}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#10131A] border border-[#D4AF37]/30 text-xs font-bold text-[#D4AF37] hover:bg-[#D4AF37] hover:text-black transition-colors"
                >
                  <MessageSquare className="w-4 h-4" />
                  <span>WhatsApp Support (9477304939)</span>
                </a>
                <a 
                  href="https://whatsapp.com/channel/0029VbCouJAA89MiZysFsS2S" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#10131A] border border-[#D4AF37]/30 text-xs font-bold text-gray-300 hover:text-white transition-colors"
                >
                  <Send className="w-4 h-4 text-[#D4AF37]" />
                  <span>WhatsApp Channel</span>
                </a>
                <a 
                  href="https://t.me/Hellotrader7272" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#10131A] border border-[#D4AF37]/30 text-xs font-bold text-gray-300 hover:text-white transition-colors"
                >
                  <Send className="w-4 h-4 text-[#D4AF37]" />
                  <span>Telegram (@Hellotrader7272)</span>
                </a>
                <div className="flex items-center gap-3 pt-2">
                  <a href="https://www.instagram.com/hello.trader/" target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 rounded-lg bg-[#10131A] border border-white/10 text-xs font-bold text-gray-400 hover:text-[#FFD700] hover:border-[#D4AF37]/50 flex items-center gap-1.5 transition-colors">
                    <Globe className="w-3.5 h-3.5 text-[#D4AF37]" />
                    <span>Instagram</span>
                  </a>
                  <a href="https://www.facebook.com/share/1acmR3qpes/" target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 rounded-lg bg-[#10131A] border border-white/10 text-xs font-bold text-gray-400 hover:text-[#FFD700] hover:border-[#D4AF37]/50 flex items-center gap-1.5 transition-colors">
                    <Globe className="w-3.5 h-3.5 text-[#D4AF37]" />
                    <span>Facebook</span>
                  </a>
                </div>
              </div>
            </div>

          </div>

          <div className="pt-8 flex flex-col sm:flex-row items-center justify-between text-[11px] text-gray-500 gap-4">
            <p>© {new Date().getFullYear()} HELLO TRADER INSTITUTE. All rights reserved.</p>
            <p className="text-[10px] text-gray-400">
              Disclaimer: Hello Trader provides stock market education and technology platforms for paper trading and analytics. Trading involves financial risk.
            </p>
          </div>

        </div>
      </footer>
    </div>
  );
}
