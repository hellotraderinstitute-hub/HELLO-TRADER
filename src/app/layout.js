import "./globals.css";
import { MarketProviderLayer } from "../context/MarketProviderContext";
import { TradingProvider } from "../context/TradingContext";
import { ReferralProvider } from "../context/ReferralContext";
export const metadata = {
  title: "HELLO TRADER PRO - Cyber Trading & Paper Trading Platform",
  description: "TradingView & Sellybull inspired live paper trading platform with Option Chain AI, Real-time Candlestick charts, Institutional Scanner, and AI Copilot.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="antialiased bg-[#0B0E14] text-white">
        <MarketProviderLayer>
          <TradingProvider>
            <ReferralProvider>
              {children}
            </ReferralProvider>
          </TradingProvider>
        </MarketProviderLayer>
      </body>
    </html>
  );
}
