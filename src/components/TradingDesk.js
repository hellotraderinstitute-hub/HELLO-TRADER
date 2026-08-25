'use client';

import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useTrading } from '../context/TradingContext';
import { useMarketProvider } from '../context/MarketProviderContext';
import { ArrowUpRight, ArrowDownRight, Zap, BarChart2, Maximize2, Minimize2, Activity, Sliders, Layers } from 'lucide-react';
import TradingViewChart from './TradingViewChart';

export default function TradingDesk() {
  const {
    isServerOnline, positions, tradeHistory, placeOrder, closePosition, paperBalance,
    isExpiredTrial, openRechargeModal
  } = useTrading();

  const todayTradesCount = useMemo(() => {
    if (!tradeHistory || !Array.isArray(tradeHistory)) return 0;
    const todayStr = new Date().toISOString().slice(0, 10);
    return tradeHistory.filter(t => {
      const ts = t.timestamp || t.createdAt;
      if (!ts) return false;
      return new Date(ts).toISOString().slice(0, 10) === todayStr;
    }).length;
  }, [tradeHistory]);
  
  const {
    currentTicker, tickers, setSelectedSymbol, fetchKlines, subscribeKline
  } = useMarketProvider();

  const [timeframe, setTimeframe] = useState('5m');
  const [orderSide, setOrderSide] = useState('BUY');
  const [orderType, setOrderType] = useState('MARKET');
  const [productType, setProductType] = useState('INTRADAY');
  const [quantity, setQuantity] = useState(0.01);
  const [leverage, setLeverage] = useState(10);
  const [enableSL, setEnableSL] = useState(false);
  const [enableTP, setEnableTP] = useState(false);
  const [slPrice, setSlPrice] = useState('');
  const [tpPrice, setTpPrice] = useState('');
  const [activeTab, setActiveTab] = useState('positions');



  useEffect(() => {
    if (currentTicker) {
      setSlPrice((currentTicker.price * 0.98).toFixed(currentTicker.type === 'crypto' ? 2 : 0));
      setTpPrice((currentTicker.price * 1.04).toFixed(currentTicker.type === 'crypto' ? 2 : 0));
      const defaultQty = currentTicker.type === 'crypto'
        ? (currentTicker.symbol === 'BTCUSDT' ? 0.001 : 0.01)
        : 50;
      setQuantity(defaultQty);
    }
  }, [currentTicker?.symbol]);

  // Note: Mock orderbook generator removed per Zero Data Loss Policy (No fake Math.random market depth)

  const reqMargin = useMemo(() => {
    if (!currentTicker || !currentTicker.price) return 0;
    return (currentTicker.price * quantity) / leverage;
  }, [currentTicker, quantity, leverage]);

  const executeOrder = async () => {
    if (!currentTicker) {
      alert("No market symbol selected!");
      return;
    }

    // 1 successful paper trade per trading day FREE for expired trial users
    if (isExpiredTrial && todayTradesCount >= 1) {
      openRechargeModal();
      return;
    }

    await placeOrder({
      symbol: currentTicker.symbol,
      side: orderSide,
      quantity,
      leverage,
      stopLoss: enableSL ? slPrice : null,
      takeProfit: enableTP ? tpPrice : null,
      productType,
    });
  };

  return (
    <div className="flex flex-col h-[calc(100vh-79px)] bg-[#0b0e14] text-white overflow-hidden">

      {/* ─── Symbol Bar ─── */}
      <div className="flex flex-wrap items-center gap-4 px-3 py-1.5 bg-[#10131a] border-b border-[#3c494e]/30 text-xs font-mono shrink-0">
        <div className="flex items-center gap-2">
          <span className="font-extrabold text-sm text-white">{currentTicker?.display}</span>
          <span className="text-[#bbc9cf]">{currentTicker?.name}</span>
        </div>
        <div className={`text-lg font-extrabold transition-colors ${currentTicker?.lastTickUp ? 'text-[#00e639]' : 'text-[#ffb4ab]'}`}>
          {currentTicker?.price.toLocaleString(undefined, { minimumFractionDigits: currentTicker?.type === 'crypto' ? 2 : 2, maximumFractionDigits: 4 })}
        </div>
        <span className={`px-1.5 py-0.5 rounded text-[11px] font-bold ${currentTicker?.change >= 0 ? 'bg-[#00e639]/15 text-[#00e639]' : 'bg-[#ffb4ab]/15 text-[#ffb4ab]'}`}>
          {currentTicker?.change >= 0 ? '+' : ''}{currentTicker?.change}%
        </span>
        <div className="hidden sm:flex items-center gap-4 text-[#bbc9cf] text-[11px]">
          <span>H: <b className="text-white">{currentTicker?.high?.toLocaleString()}</b></span>
          <span>L: <b className="text-white">{currentTicker?.low?.toLocaleString()}</b></span>
          <span>Vol: <b className="text-white">{currentTicker?.volume}</b></span>
        </div>
        {/* Timeframes */}
        <div className="ml-auto flex items-center bg-[#1d2026] p-0.5 rounded border border-[#3c494e]/30 overflow-x-auto">
          {['1m','3m','5m','15m','30m','1h','2h','4h','1D'].map(tf => (
            <button key={tf} onClick={() => setTimeframe(tf)}
              className={`px-2 py-0.5 rounded text-[11px] font-bold transition-all ${timeframe === tf ? 'bg-[#00d4ff] text-black' : 'text-[#bbc9cf] hover:text-white'}`}>
              {tf}
            </button>
          ))}
        </div>
      </div>

      {/* ─── Main Grid ─── */}
      <div className="flex-1 grid grid-cols-12 gap-1 p-1 overflow-hidden">

        {/* Chart — 7 cols */}
        <div className="col-span-12 lg:col-span-7 flex flex-col overflow-hidden">
          <TradingViewChart
            currentTicker={currentTicker}
            tickers={tickers}
            timeframe={timeframe}
            onTimeframeChange={(tf) => setTimeframe(tf)}
            fetchKlines={fetchKlines}
            subscribeKline={subscribeKline}
          />
        </div>

        {/* Order Book — 2 cols */}
        <div className="col-span-[#0.5] sm:col-span-1 bg-[#10131a] rounded border border-[#3c494e]/30 flex flex-col font-mono text-xs overflow-hidden">
          <div className="bg-[#1d2026] px-2 py-1 flex items-center justify-between border-b border-[#3c494e]/30">
            <span className="font-extrabold text-[10px] text-gray-400 uppercase tracking-wider">ORDERBOOK (L2)</span>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center p-3 text-center space-y-2">
            <span className="text-[10px] font-black text-cyan-400 uppercase tracking-wider">
              INSTITUTIONAL L2 FEED
            </span>
            <p className="text-[9px] text-gray-400 leading-relaxed">
              Level-2 Depth stream active for connected institutional accounts.
            </p>
          </div>
        </div>

        {/* Order Form — 3 cols */}
        <div className="col-span-3 bg-[#10131a] rounded border border-[#3c494e]/30 p-3 flex flex-col gap-2 font-mono text-xs overflow-y-auto">

          {/* BUY / SELL toggle */}
          <div className="grid grid-cols-2 gap-1 bg-[#0b0e14] p-1 rounded border border-[#3c494e]/30">
            {['BUY','SELL'].map(s => (
              <button key={s} onClick={() => setOrderSide(s)}
                className={`py-2.5 rounded font-extrabold text-xs flex items-center justify-center gap-1 transition-all ${
                  orderSide === s
                    ? s === 'BUY'
                      ? 'bg-[#00e639] text-black shadow-[0_0_15px_rgba(0,230,57,0.4)]'
                      : 'bg-[#ffb4ab] text-black shadow-[0_0_15px_rgba(255,180,171,0.4)]'
                    : 'text-[#bbc9cf] hover:text-white'
                }`}>
                {s === 'BUY' ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                {s} / {s === 'BUY' ? 'LONG' : 'SHORT'}
              </button>
            ))}
          </div>

          {/* Order type */}
          <div className="flex items-center justify-between">
            <span className="text-[#bbc9cf] font-bold text-[11px]">ORDER TYPE</span>
            <div className="flex bg-[#0b0e14] p-0.5 rounded border border-[#3c494e]/30">
              {['MARKET','LIMIT'].map(t => (
                <button key={t} onClick={() => setOrderType(t)}
                  className={`px-2.5 py-0.5 rounded text-[10px] font-bold ${orderType === t ? 'bg-[#00d4ff] text-black' : 'text-[#bbc9cf]'}`}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Product type */}
          <div className="flex items-center justify-between">
            <span className="text-[#bbc9cf] font-bold text-[11px]">PRODUCT</span>
            <div className="flex bg-[#0b0e14] p-0.5 rounded border border-[#3c494e]/30">
              {['INTRADAY','DELIVERY'].map(t => (
                <button key={t} onClick={() => setProductType(t)}
                  className={`px-2.5 py-0.5 rounded text-[10px] font-bold ${productType === t ? 'bg-[#00d4ff] text-black' : 'text-[#bbc9cf]'}`}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Quantity */}
          <div>
            <div className="flex justify-between text-[11px] text-[#bbc9cf] mb-1">
              <span className="font-bold">QTY / LOTS</span>
            </div>
            <div className="flex items-center bg-[#0b0e14] border border-[#00d4ff]/30 rounded overflow-hidden">
              <button onClick={() => setQuantity(q => Math.max(0.001, parseFloat((q - 0.001).toFixed(3))))}
                className="px-3 py-2 bg-white/5 hover:bg-white/10 text-white font-bold">−</button>
              <input type="number" value={quantity}
                onChange={e => setQuantity(Math.max(0.001, parseFloat(e.target.value) || 0.001))}
                className="flex-1 bg-transparent text-center font-extrabold text-sm text-white focus:outline-none" />
              <button onClick={() => setQuantity(q => parseFloat((q + 0.001).toFixed(3)))}
                className="px-3 py-2 bg-white/5 hover:bg-white/10 text-white font-bold">+</button>
            </div>
          </div>

          {/* Leverage */}
          <div>
            <div className="flex justify-between text-[11px] text-[#bbc9cf] mb-1">
              <span className="font-bold">LEVERAGE</span>
              <span className="text-[#00d4ff] font-extrabold">{leverage}x</span>
            </div>
            <input type="range" min="1" max="100" value={leverage}
              onChange={e => setLeverage(parseInt(e.target.value))}
              className="w-full accent-[#00d4ff] bg-[#0b0e14] h-1.5 rounded cursor-pointer" />
            <div className="flex justify-between text-[9px] text-[#859398] mt-0.5">
              <span>1x</span><span>25x</span><span>50x</span><span>100x</span>
            </div>
          </div>

          {/* TP / SL */}
          <div className="space-y-1.5">
            <label className="flex items-center justify-between cursor-pointer">
              <span className="flex items-center gap-1.5 text-[#bbc9cf] font-bold">
                <input type="checkbox" checked={enableTP} onChange={e => setEnableTP(e.target.checked)} className="accent-[#00e639]" />
                Take Profit
              </span>
              {enableTP && <input type="number" value={tpPrice} onChange={e => setTpPrice(e.target.value)}
                className="w-24 bg-[#0b0e14] border border-[#00e639]/50 px-2 py-0.5 rounded text-right font-bold text-[#00e639] focus:outline-none" />}
            </label>
            <label className="flex items-center justify-between cursor-pointer">
              <span className="flex items-center gap-1.5 text-[#bbc9cf] font-bold">
                <input type="checkbox" checked={enableSL} onChange={e => setEnableSL(e.target.checked)} className="accent-[#ffb4ab]" />
                Stop Loss
              </span>
              {enableSL && <input type="number" value={slPrice} onChange={e => setSlPrice(e.target.value)}
                className="w-24 bg-[#0b0e14] border border-[#ffb4ab]/50 px-2 py-0.5 rounded text-right font-bold text-[#ffb4ab] focus:outline-none" />}
            </label>
          </div>

          {/* Margin summary */}
          <div className="bg-[#0b0e14] p-2 rounded border border-[#3c494e]/30 space-y-1 text-[11px]">
            <div className="flex justify-between text-[#bbc9cf]">
              <span>Required Margin</span>
              <span className="font-bold text-white">₹{reqMargin.toLocaleString(undefined, {maximumFractionDigits: 2})}</span>
            </div>
            <div className="flex justify-between text-[#bbc9cf]">
              <span>Available</span>
              <span className={`font-bold ${paperBalance < reqMargin ? 'text-[#ffb4ab]' : 'text-[#00e639]'}`}>
                ₹{paperBalance.toLocaleString(undefined, {maximumFractionDigits: 2})}
              </span>
            </div>
          </div>

          {/* Execute Button */}
          <button onClick={executeOrder}
            className={`w-full py-3 rounded font-extrabold text-sm uppercase tracking-wider transition-all active:scale-95 ${
              orderSide === 'BUY'
                ? 'bg-[#00e639] text-black shadow-[0_0_20px_rgba(0,230,57,0.4)] hover:shadow-[0_0_30px_rgba(0,230,57,0.6)]'
                : 'bg-[#ffb4ab] text-black shadow-[0_0_20px_rgba(255,180,171,0.4)] hover:shadow-[0_0_30px_rgba(255,180,171,0.6)]'
            }`}>
            PLACE {orderSide} PAPER ORDER
          </button>
        </div>
      </div>

      {/* ─── Bottom Panel: Positions / History ─── */}
      <div className="h-40 bg-[#10131a] border-t border-[#3c494e]/30 flex flex-col shrink-0">
        <div className="flex items-center gap-1 bg-[#0b0e14] px-2 py-1 border-b border-[#3c494e]/20">
          {[
            { id: 'positions', label: `OPEN POSITIONS (${positions.length})` },
            { id: 'history', label: `HISTORY (${tradeHistory.length})` },
          ].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1 rounded text-[11px] font-bold font-mono transition-all ${
                activeTab === tab.id
                  ? 'bg-[#1d2026] text-[#00d4ff] border border-[#00d4ff]/30'
                  : 'text-[#bbc9cf] hover:text-white'
              }`}>
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
          {activeTab === 'positions' && (
            positions.length === 0
              ? <div className="h-full flex items-center justify-center text-[#859398] text-xs font-mono">No open positions. Place an order above to start paper trading.</div>
              : <table className="w-full text-left font-mono text-[11px] border-collapse">
                  <thead><tr className="text-[#859398] border-b border-[#3c494e]/20 text-[10px]">
                    <th className="px-2 py-1">SYMBOL</th><th className="px-2 py-1">SIDE</th>
                    <th className="px-2 py-1">PRODUCT</th>
                    <th className="px-2 py-1">QTY</th><th className="px-2 py-1">ENTRY</th>
                    <th className="px-2 py-1">MARK</th><th className="px-2 py-1">LEV</th>
                    <th className="px-2 py-1">PnL (INR)</th><th className="px-2 py-1">PnL%</th>
                    <th className="px-2 py-1 text-right">ACTION</th>
                  </tr></thead>
                  <tbody className="divide-y divide-[#3c494e]/10">
                    {positions.map(pos => (
                      <tr key={pos.id} className="hover:bg-white/[0.03]">
                        <td className="px-2 py-1.5 font-bold text-white">{pos.display}</td>
                        <td className="px-2 py-1.5">
                          <span className={`px-1.5 py-0.5 rounded font-bold text-[10px] ${pos.side === 'BUY' ? 'bg-[#00e639]/20 text-[#00e639]' : 'bg-[#ffb4ab]/20 text-[#ffb4ab]'}`}>{pos.side}</span>
                        </td>
                        <td className="px-2 py-1.5 font-bold text-[#859398]">{pos.productType || 'INTRADAY'}</td>
                        <td className="px-2 py-1.5">{pos.quantity}</td>
                        <td className="px-2 py-1.5">{pos.entryPrice.toLocaleString(undefined, {maximumFractionDigits: 4})}</td>
                        <td className="px-2 py-1.5 font-bold">
                          <div className="flex items-center gap-1.5">
                            <span>₹{pos.currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</span>
                            {pos.isStale && (
                              <span className="px-1 py-0.2 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded text-[9px] font-bold">
                                STALE
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-2 py-1.5 text-[#00d4ff] font-bold">{pos.leverage}x</td>
                        <td className={`px-2 py-1.5 font-extrabold ${pos.pnl >= 0 ? 'text-[#00e639]' : 'text-[#ffb4ab]'}`}>
                          {pos.pnl >= 0 ? '+' : ''}₹{pos.pnl.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                        </td>
                        <td className={`px-2 py-1.5 font-bold ${pos.pnlPercent >= 0 ? 'text-[#00e639]' : 'text-[#ffb4ab]'}`}>
                          {pos.pnlPercent >= 0 ? '+' : ''}{pos.pnlPercent}%
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          <button onClick={() => closePosition(pos.id)}
                            className="px-2 py-0.5 bg-[#ffb4ab]/20 hover:bg-[#ffb4ab] text-[#ffb4ab] hover:text-black rounded text-[10px] font-bold border border-[#ffb4ab]/30 transition-colors">
                            CLOSE
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
          )}
          {activeTab === 'history' && (
            tradeHistory.length === 0
              ? <div className="h-full flex items-center justify-center text-[#859398] text-xs font-mono">No closed trades yet.</div>
              : (
                <div className="flex flex-col h-full">
                  <div className="flex justify-end p-1">
                    <button onClick={() => {
                      const csv = ['SYMBOL,SIDE,PRODUCT,QTY,ENTRY,EXIT,PnL,TIME'];
                      tradeHistory.forEach(h => {
                        csv.push(`${h.display},${h.side},${h.productType||'INTRADAY'},${h.quantity},${h.entryPrice},${h.exitPrice},${h.pnl},${h.time}`);
                      });
                      const blob = new Blob([csv.join('\\n')], { type: 'text/csv' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `trade_history_${new Date().getTime()}.csv`;
                      a.click();
                    }} className="text-[10px] bg-[#00d4ff]/10 hover:bg-[#00d4ff]/20 text-[#00d4ff] px-2 py-1 rounded font-bold border border-[#00d4ff]/30 transition-all">DOWNLOAD CSV</button>
                  </div>
                  <div className="overflow-y-auto flex-1">
                    <table className="w-full text-left font-mono text-[11px] border-collapse">
                      <thead><tr className="text-[#859398] border-b border-[#3c494e]/20 text-[10px]">
                        <th className="px-2 py-1">SYMBOL</th><th className="px-2 py-1">SIDE</th>
                        <th className="px-2 py-1">PRODUCT</th><th className="px-2 py-1">QTY</th><th className="px-2 py-1">ENTRY</th>
                        <th className="px-2 py-1">EXIT</th><th className="px-2 py-1">REALIZED PnL</th>
                        <th className="px-2 py-1">TIME</th>
                      </tr></thead>
                      <tbody className="divide-y divide-[#3c494e]/10">
                        {tradeHistory.map(h => (
                          <tr key={h.id} className="hover:bg-white/[0.03]">
                            <td className="px-2 py-1 font-bold text-white">{h.display}</td>
                            <td className="px-2 py-1 font-semibold text-[#bbc9cf]">{h.side}</td>
                            <td className="px-2 py-1 font-bold text-[#859398]">{h.productType || 'INTRADAY'}</td>
                            <td className="px-2 py-1">{h.quantity}</td>
                            <td className="px-2 py-1">{h.entryPrice.toLocaleString()}</td>
                            <td className="px-2 py-1">{h.exitPrice.toLocaleString()}</td>
                            <td className={`px-2 py-1 font-extrabold ${h.pnl >= 0 ? 'text-[#00e639]' : 'text-[#ffb4ab]'}`}>
                              {h.pnl >= 0 ? '+' : ''}₹{h.pnl.toLocaleString()}
                            </td>
                            <td className="px-2 py-1 text-[#859398] text-[9px] whitespace-nowrap">{h.time}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
          )}
        </div>
      </div>
    </div>
  );
}
