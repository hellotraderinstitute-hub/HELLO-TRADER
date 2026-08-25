'use client';

import React, { useState } from 'react';
import {
  Search, Sliders, Eye, EyeOff, Trash2, RotateCcw,
  Check, Plus, X, Activity, Layers, TrendingUp, BarChart2, Zap
} from 'lucide-react';
import { INDICATOR_REGISTRY } from '../../utils/indicators';

const CATEGORIES = [
  { id: 'ALL', label: 'All Indicators', icon: Layers },
  { id: 'TREND', label: 'Trend', icon: TrendingUp },
  { id: 'MOMENTUM', label: 'Momentum', icon: Activity },
  { id: 'VOLATILITY', label: 'Volatility', icon: BarChart2 },
  { id: 'VOLUME', label: 'Volume / Flow', icon: BarChart2 },
  { id: 'SMC', label: 'Price Action / SMC', icon: Zap },
  { id: 'AUTO', label: 'Auto Analysis', icon: Sliders },
  { id: 'ACTIVE', label: 'Active', icon: Check },
];

export default function IndicatorManagerModal({
  isOpen,
  onClose,
  activeIndicators = [],
  onAddIndicator,
  onUpdateIndicator,
  onRemoveIndicator,
  onResetIndicator,
  onResetAll
}) {
  const [activeTab, setActiveTab] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedInstance, setSelectedInstance] = useState(null);

  if (!isOpen) return null;

  const filteredIndicators = INDICATOR_REGISTRY.filter(ind => {
    const matchesSearch = ind.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          ind.shortName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          ind.category.toLowerCase().includes(searchQuery.toLowerCase());
    if (activeTab === 'ALL') return matchesSearch;
    if (activeTab === 'ACTIVE') return false; // Handled separately
    return ind.category === activeTab && matchesSearch;
  });

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 font-mono">
      <div className="bg-[#0f141c] border border-white/15 rounded-2xl w-full max-w-3xl h-[620px] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="px-5 py-4 bg-[#151c27] border-b border-white/10 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-wide">Indicators & Technical Analysis Engine</h2>
              <p className="text-xs text-gray-400">Institutional indicators, SMC Order Flow, and Auto-Analysis</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search & Tabs */}
        <div className="px-5 py-3 bg-[#111722] border-b border-white/10 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search indicators, SMC, Pivots, RSI..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-[#0b0e14] border border-white/10 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 transition-all"
            />
          </div>

          {/* Category Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto max-w-full pb-1">
            {CATEGORIES.map(cat => {
              const Icon = cat.icon;
              const isActive = activeTab === cat.id;
              const count = cat.id === 'ACTIVE' ? activeIndicators.length : null;
              return (
                <button
                  key={cat.id}
                  onClick={() => { setActiveTab(cat.id); setSelectedInstance(null); }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all whitespace-nowrap ${
                    isActive
                      ? 'bg-cyan-500 text-black shadow-lg shadow-cyan-500/20'
                      : 'bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{cat.label}</span>
                  {count != null && (
                    <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                      isActive ? 'bg-black/30 text-black' : 'bg-cyan-500/20 text-cyan-400'
                    }`}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Body Content */}
        <div className="flex-1 grid grid-cols-12 overflow-hidden">
          
          {/* Left Column: Indicator List */}
          <div className="col-span-7 border-r border-white/10 p-4 overflow-y-auto space-y-2">
            {activeTab === 'ACTIVE' ? (
              activeIndicators.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 text-gray-500">
                  <Activity className="w-10 h-10 mb-2 opacity-30 text-cyan-400" />
                  <p className="text-sm font-bold text-gray-300">No Active Indicators</p>
                  <p className="text-xs text-gray-500 mt-1">Select an indicator from the categories above to add to your chart.</p>
                </div>
              ) : (
                activeIndicators.map(inst => {
                  const meta = INDICATOR_REGISTRY.find(m => m.id === inst.indicatorId);
                  const isSelected = selectedInstance?.instanceId === inst.instanceId;
                  return (
                    <div
                      key={inst.instanceId}
                      onClick={() => setSelectedInstance(inst)}
                      className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-cyan-500/10 border-cyan-500/50 shadow-md shadow-cyan-500/10'
                          : 'bg-[#151c27] border-white/5 hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onUpdateIndicator(inst.instanceId, { visible: !inst.visible });
                          }}
                          className={`p-1.5 rounded-lg border transition-all ${
                            inst.visible
                              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                              : 'bg-white/5 border-white/10 text-gray-500'
                          }`}
                        >
                          {inst.visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                        </button>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-white">{meta?.name || inst.name}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-cyan-400 font-black">
                              {inst.timeframe || 'CHART TF'}
                            </span>
                          </div>
                          <p className="text-[10px] text-gray-400 mt-0.5">
                            {Object.entries(inst.inputs || {}).map(([k, v]) => `${k}: ${v}`).join(', ') || 'Default Parameters'}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onRemoveIndicator(inst.instanceId);
                            if (selectedInstance?.instanceId === inst.instanceId) setSelectedInstance(null);
                          }}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )
            ) : (
              filteredIndicators.map(ind => {
                const count = activeIndicators.filter(a => a.indicatorId === ind.id).length;
                return (
                  <div
                    key={ind.id}
                    className="p-3 bg-[#151c27] border border-white/5 rounded-xl flex items-center justify-between hover:border-white/20 transition-all"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white">{ind.name}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 font-black">
                          {ind.category}
                        </span>
                      </div>
                      <span className="text-[10px] text-gray-400 mt-0.5 block">
                        {ind.isOverlay ? 'Main Chart Overlay' : 'Oscillator Sub-Pane'}
                      </span>
                    </div>

                    <button
                      onClick={() => onAddIndicator(ind.id)}
                      className="px-3 py-1.5 bg-cyan-500 hover:bg-cyan-400 text-black rounded-lg text-xs font-black flex items-center gap-1 shadow-md shadow-cyan-500/20 transition-all"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add</span>
                      {count > 0 && <span className="ml-1 text-[10px] opacity-75">({count})</span>}
                    </button>
                  </div>
                );
              })
            )}
          </div>

          {/* Right Column: Settings & Customization Panel */}
          <div className="col-span-5 p-4 bg-[#111722] overflow-y-auto flex flex-col">
            {selectedInstance ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <div className="flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-cyan-400" />
                    <h3 className="text-xs font-bold text-white">{selectedInstance.name} Settings</h3>
                  </div>
                  <button
                    onClick={() => onResetIndicator(selectedInstance.instanceId)}
                    className="text-[11px] text-gray-400 hover:text-cyan-400 flex items-center gap-1"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Reset</span>
                  </button>
                </div>

                {/* Input Parameters Form */}
                <div className="space-y-3">
                  <span className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Inputs</span>
                  {Object.entries(selectedInstance.inputs || {}).map(([key, val]) => (
                    <div key={key} className="flex items-center justify-between gap-2 text-xs">
                      <label className="text-gray-300 capitalize">{key}:</label>
                      {key === 'rangeMinutes' ? (
                        <select
                          value={val}
                          onChange={e => {
                            const newInputs = { ...selectedInstance.inputs, [key]: Number(e.target.value) };
                            onUpdateIndicator(selectedInstance.instanceId, { inputs: newInputs });
                          }}
                          className="w-28 bg-[#0b0e14] border border-white/10 rounded px-2 py-1 text-right text-white focus:border-cyan-500 focus:outline-none"
                        >
                          <option value={1}>1 Minute</option>
                          <option value={3}>3 Minutes</option>
                          <option value={5}>5 Minutes</option>
                          <option value={15}>15 Minutes</option>
                          <option value={30}>30 Minutes</option>
                          <option value={45}>45 Minutes</option>
                          <option value={60}>60 Minutes</option>
                        </select>
                      ) : key === 'mode' ? (
                        <select
                          value={String(val).toUpperCase()}
                          onChange={e => {
                            const newInputs = { ...selectedInstance.inputs, [key]: e.target.value };
                            onUpdateIndicator(selectedInstance.instanceId, { inputs: newInputs });
                          }}
                          className="w-32 bg-[#0b0e14] border border-white/10 rounded px-2 py-1 text-right text-white focus:border-cyan-500 focus:outline-none"
                        >
                          <option value="STANDARD">Standard</option>
                          <option value="FIBONACCI">Fibonacci</option>
                          <option value="CAMARILLA">Camarilla</option>
                          <option value="WOODIE">Woodie</option>
                          <option value="DEMARK">DeMark</option>
                        </select>
                      ) : typeof val === 'number' ? (
                        <input
                          type="number"
                          value={val}
                          onChange={e => {
                            const newInputs = { ...selectedInstance.inputs, [key]: Number(e.target.value) };
                            onUpdateIndicator(selectedInstance.instanceId, { inputs: newInputs });
                          }}
                          className="w-24 bg-[#0b0e14] border border-white/10 rounded px-2 py-1 text-right text-white focus:border-cyan-500 focus:outline-none"
                        />
                      ) : (
                        <input
                          type="text"
                          value={val}
                          onChange={e => {
                            const newInputs = { ...selectedInstance.inputs, [key]: e.target.value };
                            onUpdateIndicator(selectedInstance.instanceId, { inputs: newInputs });
                          }}
                          className="w-28 bg-[#0b0e14] border border-white/10 rounded px-2 py-1 text-right text-white focus:border-cyan-500 focus:outline-none"
                        />
                      )}
                    </div>
                  ))}
                </div>

                {/* Style Parameters Form */}
                <div className="space-y-3 pt-3 border-t border-white/10">
                  <span className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Style & Color</span>
                  {Object.entries(selectedInstance.styles || {}).map(([key, val]) => (
                    <div key={key} className="flex items-center justify-between gap-2 text-xs">
                      <label className="text-gray-300 capitalize">{key}:</label>
                      {key.toLowerCase().includes('color') ? (
                        <input
                          type="color"
                          value={val.startsWith('#') ? val : '#00D4FF'}
                          onChange={e => {
                            const newStyles = { ...selectedInstance.styles, [key]: e.target.value };
                            onUpdateIndicator(selectedInstance.instanceId, { styles: newStyles });
                          }}
                          className="w-8 h-8 rounded bg-transparent border-0 cursor-pointer"
                        />
                      ) : (
                        <input
                          type="number"
                          value={val}
                          onChange={e => {
                            const newStyles = { ...selectedInstance.styles, [key]: Number(e.target.value) };
                            onUpdateIndicator(selectedInstance.instanceId, { styles: newStyles });
                          }}
                          className="w-20 bg-[#0b0e14] border border-white/10 rounded px-2 py-1 text-right text-white focus:border-cyan-500 focus:outline-none"
                        />
                      )}
                    </div>
                  ))}
                </div>

                <div className="pt-4">
                  <button
                    onClick={() => {
                      onRemoveIndicator(selectedInstance.instanceId);
                      setSelectedInstance(null);
                    }}
                    className="w-full py-2 bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Remove Indicator</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-gray-500">
                <Sliders className="w-8 h-8 mb-2 opacity-30 text-cyan-400" />
                <p className="text-xs font-bold text-gray-300">Indicator Settings</p>
                <p className="text-[10px] text-gray-500 mt-1">
                  Click on any active indicator from the "Active" tab to adjust periods, offsets, and colors.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-[#151c27] border-t border-white/10 flex items-center justify-between text-xs shrink-0">
          <button
            onClick={onResetAll}
            className="text-gray-400 hover:text-red-400 text-xs font-semibold flex items-center gap-1 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset All Indicators</span>
          </button>
          
          <button
            onClick={onClose}
            className="px-5 py-1.5 bg-cyan-500 hover:bg-cyan-400 text-black font-black rounded-lg text-xs shadow-lg shadow-cyan-500/20 transition-all"
          >
            Done
          </button>
        </div>

      </div>
    </div>
  );
}
