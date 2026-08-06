'use client';

import React, { useState, useMemo } from 'react';
import { useTrading } from '../context/TradingContext';
import { useMarketProvider } from '../context/MarketProviderContext';
import { Layers, ShieldCheck, Zap, ArrowUpRight, ArrowDownRight, TrendingUp, Info, X, ShoppingCart } from 'lucide-react';

export default function OptionChain() {
  const { placeOrder, paperBalance } = useTrading();
  const { tickers } = useMarketProvider();
  
  const [selectedIndex, setSelectedIndex] = useState('NIFTY');
  const [expiry, setExpiry] = useState('28 AUG 2026');

  // Option order modal state
  const [activeOrder, setActiveOrder] = useState(null); // { strike, optionType, price, side, underlying }
  const [lots, setLots] = useState(1);
  const [orderLeverage, setOrderLeverage] = useState(1);
  const [orderType, setOrderType] = useState('MARKET');
  const [productType, setProductType] = useState('INTRADAY');

  const lotSize = useMemo(() => {
    if (selectedIndex === 'BANKNIFTY') return 30;
    if (selectedIndex === 'SENSEX') return 20;
    return 60; // NIFTY & FINNIFTY default lot
  }, [selectedIndex]);

  // Find live spot price from market context
  const spotPrice = useMemo(() => {
    const ticker = tickers.find(t => t.symbol === selectedIndex);
    if (ticker) return ticker.price;
    // Default Fallbacks
    if (selectedIndex === 'NIFTY') return 24580.40;
    if (selectedIndex === 'BANKNIFTY') return 52410.15;
    if (selectedIndex === 'FINNIFTY') return 23680.50;
    if (selectedIndex === 'SENSEX') return 80550.20;
    return 100;
  }, [tickers, selectedIndex]);

  const strikeInterval = useMemo(() => {
    if (selectedIndex === 'BANKNIFTY' || selectedIndex === 'SENSEX') return 100;
    return 50;
  }, [selectedIndex]);

  // Generate Strike Chain based on spot price
  const strikesList = useMemo(() => {
    const centerStrike = Math.round(spotPrice / strikeInterval) * strikeInterval;
    const list = [];
    const stdDev = selectedIndex === 'BANKNIFTY' ? 600 : selectedIndex === 'SENSEX' ? 800 : 300;
    const atmExtrinsic = selectedIndex === 'BANKNIFTY' ? 350 : selectedIndex === 'SENSEX' ? 450 : 150;

    for (let i = -4; i <= 4; i++) {
      const strike = centerStrike + (i * strikeInterval);
      const diff = strike - spotPrice;

      // 1. Calculate Option Prices (Intrinsic + Extrinsic)
      const intrinsicCE = Math.max(0, spotPrice - strike);
      const intrinsicPE = Math.max(0, strike - spotPrice);
      // Gaussian distribution for extrinsic value peaked at ATM
      const extrinsic = atmExtrinsic * Math.exp(-Math.pow(diff, 2) / (2 * Math.pow(stdDev, 2)));
      
      const callLtp = intrinsicCE + extrinsic;
      const putLtp = intrinsicPE + extrinsic;

      // 2. Calculate Greeks (Sigmoidal Approximations)
      const callDelta = 1 / (1 + Math.exp(-diff / (spotPrice * 0.005)));
      const putDelta = callDelta - 1;

      const gamma = (1 / (stdDev * Math.sqrt(2 * Math.PI))) * Math.exp(-Math.pow(diff, 2) / (2 * Math.pow(stdDev, 2)));
      const vega = 100 * gamma;
      const theta = -(15 + 10 * (1 - Math.abs(callDelta - 0.5) * 2));

      // 3. Implied Volatility (IV)
      const callIV = (12.5 + (Math.abs(diff) / spotPrice) * 10).toFixed(1) + '%';
      const putIV = (13.0 + (Math.abs(diff) / spotPrice) * 12).toFixed(1) + '%';

      // 4. Open Interest (OI) simulation
      const baseCallOI = Math.max(5, 50 - Math.floor(Math.abs(diff) / strikeInterval) * 4);
      const basePutOI = Math.max(5, 50 - Math.floor(Math.abs(diff) / strikeInterval) * 4);
      const callOI = `${(baseCallOI * 1.2).toFixed(1)}L`;
      const putOI = `${(basePutOI * 1.5).toFixed(1)}L`;
      const callChgOI = `${(diff < 0 ? '+' : '-')}${(Math.abs(diff) * 0.05).toFixed(1)}L`;
      const putChgOI = `${(diff > 0 ? '+' : '-')}${(Math.abs(diff) * 0.07).toFixed(1)}L`;

      list.push({
        strike,
        callOI,
        callChgOI,
        callIV,
        callLtp,
        callDelta: parseFloat(callDelta.toFixed(2)),
        callTheta: parseFloat(theta.toFixed(1)),
        callGamma: parseFloat((gamma * 100).toFixed(4)),
        callVega: parseFloat(vega.toFixed(2)),
        putLtp,
        putDelta: parseFloat(putDelta.toFixed(2)),
        putIV,
        putChgOI,
        putOI,
        type: i === 0 ? 'ATM' : i < 0 ? 'ITM' : 'OTM' // CE type
      });
    }
    return list;
  }, [spotPrice, strikeInterval, selectedIndex]);

  const pcrRatio = useMemo(() => {
    if (selectedIndex === 'BANKNIFTY') return 0.95;
    if (selectedIndex === 'SENSEX') return 1.05;
    return 1.18;
  }, [selectedIndex]);

  const maxPain = useMemo(() => {
    return Math.round(spotPrice / 100) * 100;
  }, [spotPrice]);

  const handleOpenOrder = (strike, optionType, price, side) => {
    setLots(1);
    setActiveOrder({ strike, optionType, price, side, underlying: selectedIndex });
  };

  const handlePlaceOrder = () => {
    if (!activeOrder) return;
    const qty = lots * lotSize;
    const symbol = `${activeOrder.underlying} ${activeOrder.strike} ${activeOrder.optionType}`;
    const success = placeOrder({
      symbol,
      side: activeOrder.side,
      quantity: qty,
      leverage: orderLeverage,
      price: activeOrder.price,
      productType
    });
    if (success) {
      setActiveOrder(null);
    }
  };

  const reqMargin = activeOrder 
    ? (activeOrder.side === 'SELL' 
        ? ((spotPrice * lots * lotSize * 0.10) / orderLeverage)
        : ((activeOrder.price * lots * lotSize) / orderLeverage))
    : 0;

  return (
    <div className="p-4 bg-[#0B0E14] text-white min-h-[calc(100vh-80px)] font-mono overflow-y-auto">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-[#161B22] p-4 rounded-xl border border-white/10 mb-4 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-[#00D4FF]/10 text-[#00D4FF] border border-[#00D4FF]/30">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold flex items-center gap-2">
              INSTITUTIONAL OPTION CHAIN & GREEKS AI
            </h1>
            <p className="text-xs text-gray-400">Live Open Interest, Implied Volatility & Max Pain Engine</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 text-xs">
          <select
            value={selectedIndex}
            onChange={(e) => setSelectedIndex(e.target.value)}
            className="bg-[#0B0E14] border border-white/10 px-3 py-1.5 rounded-lg text-white font-semibold focus:outline-none"
          >
            <option value="NIFTY">NIFTY 50 (Spot: ₹{tickers.find(t => t.symbol === 'NIFTY')?.price || 24580.40})</option>
            <option value="BANKNIFTY">BANKNIFTY (Spot: ₹{tickers.find(t => t.symbol === 'BANKNIFTY')?.price || 52410.15})</option>
            <option value="FINNIFTY">FINNIFTY (Spot: ₹{tickers.find(t => t.symbol === 'FINNIFTY')?.price || 23680.50})</option>
            <option value="SENSEX">SENSEX (Spot: ₹{tickers.find(t => t.symbol === 'SENSEX')?.price || 80550.20})</option>
          </select>

          <select
            value={expiry}
            onChange={(e) => setExpiry(e.target.value)}
            className="bg-[#0B0E14] border border-white/10 px-3 py-1.5 rounded-lg text-white focus:outline-none"
          >
            <option>28 AUG 2026 (Monthly Expiry)</option>
            <option>04 SEP 2026 (Weekly Expiry)</option>
          </select>
        </div>
      </div>

      {/* Summary KPI Bar */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4 text-xs">
        <div className="bg-[#161B22] p-3 rounded-xl border border-white/10 flex items-center justify-between">
          <div>
            <span className="text-gray-400 text-[10px]">PUT-CALL RATIO (PCR)</span>
            <div className="text-lg font-extrabold text-[#00FF41] flex items-center gap-1 mt-0.5">
              {pcrRatio} <span className={`text-[10px] px-1.5 rounded font-normal ${pcrRatio >= 1 ? 'bg-[#00FF41]/20 text-[#00FF41]' : 'bg-[#ffb4ab]/20 text-[#ffb4ab]'}`}>
                {pcrRatio >= 1 ? 'BULLISH' : 'BEARISH'}
              </span>
            </div>
          </div>
          <TrendingUp className="w-6 h-6 text-[#00FF41]" />
        </div>

        <div className="bg-[#161B22] p-3 rounded-xl border border-white/10 flex items-center justify-between">
          <div>
            <span className="text-gray-400 text-[10px]">MAX PAIN LEVEL</span>
            <div className="text-lg font-extrabold text-[#00D4FF] mt-0.5">₹{maxPain.toLocaleString('en-IN')}</div>
          </div>
          <Zap className="w-6 h-6 text-[#00D4FF]" />
        </div>

        <div className="bg-[#161B22] p-3 rounded-xl border border-white/10 flex items-center justify-between">
          <div>
            <span className="text-gray-400 text-[10px]">ATM VOLATILITY (IV)</span>
            <div className="text-lg font-extrabold text-purple-400 mt-0.5">
              {strikesList[4]?.callIV || '12.9%'}
            </div>
          </div>
          <Info className="w-6 h-6 text-purple-400" />
        </div>

        <div className="bg-[#161B22] p-3 rounded-xl border border-white/10 flex items-center justify-between">
          <div>
            <span className="text-gray-400 text-[10px]">AI SUGGESTED STRATEGY</span>
            <div className="text-sm font-bold text-amber-400 mt-0.5">
              {pcrRatio >= 1 ? `Bull Call Spread @ ${maxPain}` : `Bear Put Spread @ ${maxPain}`}
            </div>
          </div>
          <ShieldCheck className="w-6 h-6 text-amber-400" />
        </div>
      </div>

      {/* Main Option Chain Table */}
      <div className="bg-[#161B22] rounded-xl border border-white/10 overflow-x-auto shadow-2xl">
        <table className="w-full text-center text-xs border-collapse">
          <thead>
            <tr className="bg-[#0B0E14] text-gray-400 border-b border-white/10 text-[11px]">
              <th colSpan="5" className="py-2 border-r border-white/10 text-[#00FF41]">CALLS (BULLISH)</th>
              <th className="py-2 px-4 bg-[#1E2631] text-white">STRIKE</th>
              <th colSpan="5" className="py-2 border-l border-white/10 text-[#FF3131]">PUTS (BEARISH)</th>
            </tr>
            <tr className="bg-[#0B0E14]/80 text-gray-400 text-[10px] border-b border-white/10">
              <th className="py-1.5 px-2">OI</th>
              <th className="py-1.5 px-2">CHG OI</th>
              <th className="py-1.5 px-2">IV</th>
              <th className="py-1.5 px-2">DELTA</th>
              <th className="py-1.5 px-2 text-[#00FF41]">CALL LTP & ORDER</th>

              <th className="py-1.5 px-3 bg-[#1E2631] text-white font-bold">PRICE</th>

              <th className="py-1.5 px-2 text-[#FF3131]">PUT LTP & ORDER</th>
              <th className="py-1.5 px-2">DELTA</th>
              <th className="py-1.5 px-2">IV</th>
              <th className="py-1.5 px-2">CHG OI</th>
              <th className="py-1.5 px-2">OI</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5 font-mono">
            {strikesList.map((row) => {
              const isATM = row.type === 'ATM';
              
              return (
                <tr 
                  key={row.strike}
                  className={`hover:bg-white/5 transition-colors ${
                    isATM ? 'bg-[#00D4FF]/10 font-bold border-y border-[#00D4FF]/40' : ''
                  }`}
                >
                  {/* CALLS SIDE */}
                  <td className="py-2 px-2 text-gray-300">{row.callOI}</td>
                  <td className="py-2 px-2 text-[#00FF41]">{row.callChgOI}</td>
                  <td className="py-2 px-2 text-gray-400">{row.callIV}</td>
                  <td className="py-2 px-2 text-purple-400">{row.callDelta}</td>
                  
                  {/* Call LTP with B/S Buttons */}
                  <td className="py-2 px-2">
                    <div className="flex items-center justify-center gap-1.5 font-bold">
                      <span className="text-[#00FF41]">₹{row.callLtp.toFixed(2)}</span>
                      <button 
                        onClick={() => handleOpenOrder(row.strike, 'CE', row.callLtp, 'BUY')}
                        className="px-2 py-0.5 bg-[#00FF41]/20 hover:bg-[#00FF41] text-[#00FF41] hover:text-black rounded text-[9px] font-extrabold border border-[#00FF41]/40 animate-pulse"
                      >
                        B
                      </button>
                      <button 
                        onClick={() => handleOpenOrder(row.strike, 'CE', row.callLtp, 'SELL')}
                        className="px-2 py-0.5 bg-[#FF3131]/20 hover:bg-[#FF3131] text-[#FF3131] hover:text-white rounded text-[9px] font-extrabold border border-[#FF3131]/40"
                      >
                        S
                      </button>
                    </div>
                  </td>

                  {/* STRIKE CENTER */}
                  <td className="py-2 px-4 bg-[#1E2631] font-bold text-white text-sm">
                    {row.strike}
                    {isATM && <span className="block text-[9px] text-[#00D4FF]">ATM</span>}
                  </td>

                  {/* PUTS SIDE */}
                  <td className="py-2 px-2">
                    <div className="flex items-center justify-center gap-1.5 font-bold">
                      <button 
                        onClick={() => handleOpenOrder(row.strike, 'PE', row.putLtp, 'BUY')}
                        className="px-2 py-0.5 bg-[#00FF41]/20 hover:bg-[#00FF41] text-[#00FF41] hover:text-black rounded text-[9px] font-extrabold border border-[#00FF41]/40 animate-pulse"
                      >
                        B
                      </button>
                      <button 
                        onClick={() => handleOpenOrder(row.strike, 'PE', row.putLtp, 'SELL')}
                        className="px-2 py-0.5 bg-[#FF3131]/20 hover:bg-[#FF3131] text-[#FF3131] hover:text-white rounded text-[9px] font-extrabold border border-[#FF3131]/40"
                      >
                        S
                      </button>
                      <span className="text-[#FF3131]">₹{row.putLtp.toFixed(2)}</span>
                    </div>
                  </td>
                  <td className="py-2 px-2 text-purple-400">{row.putDelta}</td>
                  <td className="py-2 px-2 text-gray-400">{row.putIV}</td>
                  <td className="py-2 px-2 text-[#00FF41]">{row.putChgOI}</td>
                  <td className="py-2 px-2 text-gray-300">{row.putOI}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ─── Demat Options Order Terminal Modal ─── */}
      {activeOrder && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 font-mono text-xs text-white">
          <div className="bg-[#10131a] border border-[#3c494e]/50 rounded-2xl w-full max-w-sm p-5 relative shadow-2xl">
            <button 
              onClick={() => setActiveOrder(null)}
              className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="space-y-4">
              <div className="flex items-center gap-2 border-b border-white/10 pb-2.5">
                <ShoppingCart className="w-5 h-5 text-[#00D4FF]" />
                <div>
                  <h2 className="text-sm font-extrabold">DEMAT ORDER TERMINAL</h2>
                  <p className="text-[10px] text-gray-400">Institutional Option Execution Engine</p>
                </div>
              </div>

              <div className="bg-[#0b0e14] p-3 rounded-lg border border-white/5 text-[11px] space-y-1">
                <div className="flex justify-between">
                  <span>Contract</span>
                  <span className="font-extrabold text-[#00D4FF]">{activeOrder.underlying} {activeOrder.strike} {activeOrder.optionType}</span>
                </div>
                <div className="flex justify-between">
                  <span>Order Action</span>
                  <span className={`font-extrabold px-1.5 rounded ${activeOrder.side === 'BUY' ? 'bg-[#00FF41]/20 text-[#00FF41]' : 'bg-red-500/20 text-red-400'}`}>
                    {activeOrder.side === 'BUY' ? 'BUY / LONG' : 'SELL / SHORT'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>LTP Price</span>
                  <span className="font-bold text-white">₹{activeOrder.price.toFixed(2)}</span>
                </div>
              </div>

              {/* Product type */}
              <div className="flex items-center justify-between mb-4">
                <span className="text-gray-400 font-bold">PRODUCT</span>
                <div className="flex bg-[#0b0e14] p-0.5 rounded border border-[#00d4ff]/30">
                  {['INTRADAY','DELIVERY'].map(t => (
                    <button key={t} type="button" onClick={() => setProductType(t)}
                      className={`px-3 py-1 rounded text-xs font-bold ${productType === t ? 'bg-[#00d4ff] text-black' : 'text-gray-400'}`}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Lots selector */}
              <div>
                <label className="block text-gray-400 mb-1 font-bold">LOTS (1 Lot = {lotSize} Qty)</label>
                <div className="flex items-center bg-[#0b0e14] border border-[#00d4ff]/30 rounded overflow-hidden">
                  <button 
                    type="button"
                    onClick={() => setLots(l => Math.max(1, l - 1))}
                    className="px-3 py-2 bg-white/5 hover:bg-white/10 font-bold"
                  >
                    −
                  </button>
                  <div className="flex-1 text-center font-extrabold text-white">
                    {lots} <span className="text-[9px] text-gray-500 font-normal">({lots * lotSize} Qty)</span>
                  </div>
                  <button 
                    type="button"
                    onClick={() => setLots(l => l + 1)}
                    className="px-3 py-2 bg-white/5 hover:bg-white/10 font-bold"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Leverage Selector */}
              <div>
                <label className="block text-gray-400 mb-1 font-bold flex justify-between">
                  <span>LEVERAGE</span>
                  <span className="text-[#00d4ff]">{orderLeverage}x</span>
                </label>
                <input 
                  type="range" 
                  min="1" 
                  max="10" 
                  value={orderLeverage}
                  onChange={e => setOrderLeverage(Number(e.target.value))}
                  className="w-full accent-[#00d4ff] bg-[#0b0e14] h-1 rounded cursor-pointer" 
                />
              </div>

              {/* Margin estimation */}
              <div className="bg-[#0b0e14] p-2.5 rounded border border-white/10 text-[10px] space-y-1.5">
                <div className="flex justify-between text-gray-400">
                  <span>Required Margin</span>
                  <span className="font-extrabold text-white">₹{reqMargin.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                </div>
                <div className="flex justify-between text-gray-400">
                  <span>Available Balance</span>
                  <span className={`font-bold ${paperBalance < reqMargin ? 'text-[#ffb4ab]' : 'text-[#00FF41]'}`}>
                    ₹{paperBalance.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                  </span>
                </div>
              </div>

              {/* Order buttons */}
              <button
                type="button"
                onClick={handlePlaceOrder}
                className={`w-full py-3 rounded-lg font-black tracking-wider text-black transition-all active:scale-95 ${
                  activeOrder.side === 'BUY'
                    ? 'bg-[#00FF41] hover:bg-[#00e639] shadow-[0_0_15px_rgba(0,255,65,0.3)]'
                    : 'bg-red-500 hover:bg-red-600 text-white shadow-[0_0_15px_rgba(239,68,68,0.3)]'
                }`}
              >
                PLACE {activeOrder.side} ORDER
              </button>

            </div>
          </div>
        </div>
      )}
    </div>
  );
}
