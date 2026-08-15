'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Download, Share, PlusSquare, CheckCircle, X, Smartphone, Monitor } from 'lucide-react';

export default function InstallPwaModal({ variant = 'header' }) {
  const [mounted, setMounted] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [showIosModal, setShowIosModal] = useState(false);
  const [showDesktopGuide, setShowDesktopGuide] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (typeof window === 'undefined') return;

    // 1. Check if running in standalone mode (already installed)
    const checkStandalone = () => {
      return (
        window.matchMedia('(display-mode: standalone)').matches ||
        window.navigator.standalone === true ||
        (document.referrer && document.referrer.includes('android-app://'))
      );
    };

    if (checkStandalone()) {
      setIsInstalled(true);
    }

    // Listen for display mode changes (e.g. user installs app)
    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    const handleMediaChange = (e) => {
      if (e.matches) setIsInstalled(true);
    };
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleMediaChange);
    }

    // 2. Detect iOS / iPadOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    const iosDevice =
      /iphone|ipad|ipod/.test(userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    setIsIos(iosDevice);

    // 3. Listen for native beforeinstallprompt (Android / Chrome / Edge)
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener('change', handleMediaChange);
      }
    };
  }, []);

  // Prevent background page scrolling & horizontal layout shift when modal is open
  useEffect(() => {
    if (showIosModal || showDesktopGuide) {
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      document.body.style.overflow = 'hidden';
      if (scrollbarWidth > 0) {
        document.body.style.paddingRight = `${scrollbarWidth}px`;
      }
    } else {
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';
    }
    return () => {
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';
    };
  }, [showIosModal, showDesktopGuide]);

  if (!mounted) return null;

  const handleInstallClick = async () => {
    if (isInstalled) return;

    if (isIos) {
      setShowIosModal(true);
      return;
    }

    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setIsInstalled(true);
      }
      setDeferredPrompt(null);
    } else {
      setShowDesktopGuide(true);
    }
  };

  const renderModals = () => {
    if (!mounted || typeof document === 'undefined') return null;
    if (!showIosModal && !showDesktopGuide) return null;

    const modalContent = (
      <div 
        className="fixed top-0 right-0 bottom-0 left-0 z-[99999] bg-black/85 backdrop-blur-md flex items-center justify-center font-mono overflow-y-auto"
        style={{
          paddingTop: 'max(16px, env(safe-area-inset-top))',
          paddingRight: 'max(16px, env(safe-area-inset-right))',
          paddingBottom: 'max(16px, env(safe-area-inset-bottom))',
          paddingLeft: 'max(16px, env(safe-area-inset-left))'
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            setShowIosModal(false);
            setShowDesktopGuide(false);
          }
        }}
      >
        {/* iOS Instructions Modal */}
        {showIosModal && (
          <div className="bg-[#10131A] border border-[#00D4FF]/40 rounded-2xl p-5 sm:p-6 w-[min(92vw,480px)] max-h-[calc(100dvh-32px)] overflow-y-auto text-white relative shadow-[0_0_50px_rgba(0,212,255,0.3)] space-y-4 my-auto animate-fadeIn">
            <button
              onClick={() => setShowIosModal(false)}
              className="absolute top-3.5 right-3.5 p-2 text-gray-400 hover:text-white rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
              aria-label="Close modal"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3 border-b border-gray-800 pb-3 pr-8">
              <img src="/logo.png" alt="Hello Trader" className="w-10 h-10 rounded-lg border border-[#00D4FF]/30 object-contain shrink-0" />
              <div>
                <h3 className="font-extrabold text-sm text-[#00D4FF]">Install Hello Trader App</h3>
                <p className="text-[10px] text-gray-400">iOS Safari Setup Instructions</p>
              </div>
            </div>

            <div className="space-y-3 text-xs text-gray-300 leading-relaxed">
              <div className="flex items-start gap-3 bg-[#0B0E14] p-3 rounded-xl border border-white/5">
                <Share className="w-5 h-5 text-[#00D4FF] shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-white">Step 1:</span> Tap the <strong className="text-[#00D4FF]">Share</strong> icon in your Safari browser bar.
                </div>
              </div>

              <div className="flex items-start gap-3 bg-[#0B0E14] p-3 rounded-xl border border-white/5">
                <PlusSquare className="w-5 h-5 text-[#00FF41] shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-white">Step 2:</span> Scroll down and tap <strong className="text-[#00FF41]">"Add to Home Screen"</strong>.
                </div>
              </div>

              <div className="flex items-start gap-3 bg-[#0B0E14] p-3 rounded-xl border border-white/5">
                <Smartphone className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-white">Step 3:</span> Launch Hello Trader directly from your home screen!
                </div>
              </div>
            </div>

            <button
              onClick={() => setShowIosModal(false)}
              className="w-full min-h-[44px] py-3 bg-gradient-to-r from-[#00D4FF] to-[#0099FF] hover:brightness-110 text-black font-extrabold text-xs rounded-xl shadow-[0_0_15px_rgba(0,212,255,0.3)] transition-all active:scale-95 cursor-pointer flex items-center justify-center"
            >
              GOT IT
            </button>
          </div>
        )}

        {/* Desktop / Generic Browser Guidance Modal */}
        {showDesktopGuide && (
          <div className="bg-[#10131A] border border-[#00D4FF]/40 rounded-2xl p-5 sm:p-6 w-[min(92vw,480px)] max-h-[calc(100dvh-32px)] overflow-y-auto text-white relative shadow-[0_0_50px_rgba(0,212,255,0.3)] space-y-4 my-auto animate-fadeIn">
            <button
              onClick={() => setShowDesktopGuide(false)}
              className="absolute top-3.5 right-3.5 p-2 text-gray-400 hover:text-white rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
              aria-label="Close modal"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3 border-b border-gray-800 pb-3 pr-8">
              <img src="/logo.png" alt="Hello Trader" className="w-10 h-10 rounded-lg border border-[#00D4FF]/30 object-contain shrink-0" />
              <div>
                <h3 className="font-extrabold text-sm text-[#00D4FF]">Install Hello Trader App</h3>
                <p className="text-[10px] text-gray-400">Desktop & Browser Setup</p>
              </div>
            </div>

            <div className="space-y-3 text-xs text-gray-300 leading-relaxed">
              <div className="flex items-start gap-3 bg-[#0B0E14] p-3 rounded-xl border border-white/5">
                <Download className="w-5 h-5 text-[#00D4FF] shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-white">Chrome / Edge:</span> Look for the <strong className="text-[#00D4FF]">Install App icon</strong> in the top right of your address bar.
                </div>
              </div>

              <div className="flex items-start gap-3 bg-[#0B0E14] p-3 rounded-xl border border-white/5">
                <Monitor className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-white">Browser Menu:</span> Or click the 3 dots menu → <strong>Save and Share</strong> → <strong>Install Hello Trader...</strong>
                </div>
              </div>
            </div>

            <button
              onClick={() => setShowDesktopGuide(false)}
              className="w-full min-h-[44px] py-3 bg-gradient-to-r from-[#00D4FF] to-[#0099FF] hover:brightness-110 text-black font-extrabold text-xs rounded-xl shadow-[0_0_15px_rgba(0,212,255,0.3)] transition-all active:scale-95 cursor-pointer flex items-center justify-center"
            >
              UNDERSTOOD
            </button>
          </div>
        )}
      </div>
    );

    return createPortal(modalContent, document.body);
  };

  // Variant 1: Banner (Dashboard top card)
  if (variant === 'banner') {
    if (isInstalled) {
      return (
        <div className="bg-[#10131A] border border-[#00FF41]/30 rounded-2xl p-4 sm:p-5 flex items-center justify-between font-mono shadow-lg">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#00FF41]/10 border border-[#00FF41]/30 flex items-center justify-center text-[#00FF41] shrink-0">
              <CheckCircle className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-black text-white">HELLO TRADER APP INSTALLED</h4>
              <p className="text-[10px] text-gray-400 mt-0.5">Running in standalone application mode.</p>
            </div>
          </div>
          <span className="px-3 py-1.5 bg-[#00FF41]/10 text-[#00FF41] border border-[#00FF41]/30 rounded-lg text-[10px] font-bold">
            ✓ INSTALLED
          </span>
        </div>
      );
    }

    return (
      <>
        <div className="bg-gradient-to-r from-[#10131A] via-[#161B26] to-[#10131A] border border-[#00D4FF]/40 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 font-mono shadow-xl relative overflow-hidden">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#00D4FF]/10 border border-[#00D4FF]/30 flex items-center justify-center text-[#00D4FF] shrink-0">
              <Download className="w-5 h-5 animate-bounce" />
            </div>
            <div>
              <h4 className="text-xs font-black text-white uppercase tracking-wider">INSTALL HELLO TRADER APP</h4>
              <p className="text-[10px] text-gray-400 mt-0.5">Fast one-tap access, live charts & instant execution on mobile & desktop.</p>
            </div>
          </div>
          <button
            onClick={handleInstallClick}
            className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 bg-gradient-to-r from-[#00D4FF] to-[#0099FF] hover:brightness-110 text-black font-extrabold rounded-xl text-xs flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(0,212,255,0.3)] transition-all active:scale-95 shrink-0"
          >
            <Download className="w-4 h-4" />
            <span>INSTALL APP</span>
          </button>
        </div>
        {renderModals()}
      </>
    );
  }

  // Variant 2: Sidebar
  if (variant === 'sidebar') {
    if (isInstalled) {
      return (
        <div className="w-full min-h-[44px] flex items-center gap-2.5 px-3 py-2.5 bg-[#00FF41]/10 border border-[#00FF41]/30 text-[#00FF41] rounded-lg text-xs font-bold font-mono">
          <CheckCircle className="w-4 h-4 shrink-0" />
          <span className="truncate">Hello Trader App Installed</span>
        </div>
      );
    }

    return (
      <>
        <button
          onClick={handleInstallClick}
          className="w-full min-h-[44px] flex items-center gap-2.5 px-3 py-2.5 bg-[#00D4FF]/10 hover:bg-[#00D4FF]/20 border border-[#00D4FF]/40 text-[#00D4FF] rounded-lg text-xs font-bold font-mono transition-all shadow-[0_0_10px_rgba(0,212,255,0.15)] active:scale-95"
        >
          <Download className="w-4 h-4 shrink-0 animate-bounce" />
          <span className="truncate">INSTALL HELLO TRADER APP</span>
        </button>
        {renderModals()}
      </>
    );
  }

  // Variant 3: Header (default)
  if (isInstalled) {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[#00FF41]/10 border border-[#00FF41]/30 text-[#00FF41] rounded-xl text-[11px] font-bold font-mono shrink-0 whitespace-nowrap min-h-[36px]">
        <CheckCircle className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">App Installed</span>
        <span className="sm:hidden">Installed</span>
      </div>
    );
  }

  return (
    <>
      <button
        onClick={handleInstallClick}
        className="min-h-[36px] flex items-center gap-1.5 px-3 py-1.5 bg-[#00D4FF]/10 hover:bg-[#00D4FF]/20 border border-[#00D4FF]/40 text-[#00D4FF] rounded-xl text-[11px] font-bold font-mono transition-all shadow-[0_0_10px_rgba(0,212,255,0.15)] active:scale-95 shrink-0 whitespace-nowrap"
      >
        <Download className="w-3.5 h-3.5 animate-bounce shrink-0" />
        <span className="hidden xl:inline">INSTALL HELLO TRADER APP</span>
        <span className="xl:hidden">INSTALL APP</span>
      </button>
      {renderModals()}
    </>
  );
}
