'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import apiClient from '../lib/axios';
import {
  Share2, BarChart3, TrendingUp, Sparkles, Flame, Calendar, BookOpen,
  Filter, Plus, Edit2, Trash2, CheckCircle2, AlertCircle, AlertTriangle,
  Award, Zap, Clock, ThumbsUp, MessageSquare, Repeat, Bookmark, UserPlus,
  Eye, RefreshCw, Lock, FileText, Check, ShieldAlert
} from 'lucide-react';

export default function SocialMediaManager() {
  // Navigation Tabs
  const [activeTab, setActiveTab] = useState('OVERVIEW'); // 'OVERVIEW' | 'PERFORMANCE' | 'INTELLIGENCE' | 'LAB' | 'NEXT' | 'IDEAS' | 'CALENDAR' | 'STRATEGY'

  // Time Range & Platform Filters
  const [timeRange, setTimeRange] = useState('all'); // 'today' | '7d' | '30d' | 'all'
  const [selectedPlatform, setSelectedPlatform] = useState('ALL'); // 'ALL' | 'INSTAGRAM' | 'YOUTUBE' | 'FACEBOOK'

  // Data States
  const [dashboardData, setDashboardData] = useState(null);
  const [platformMetrics, setPlatformMetrics] = useState({});
  const [posts, setPosts] = useState([]);
  const [intelligence, setIntelligence] = useState(null);
  const [recommendations, setRecommendations] = useState([]);
  const [nextPosts, setNextPosts] = useState([]);
  const [contentIdeas, setContentIdeas] = useState([]);
  const [variants, setVariants] = useState([]);
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [strategy, setStrategy] = useState(null);
  const [loading, setLoading] = useState(true);
  const [seedingDemo, setSeedingDemo] = useState(false);

  // Table Filters
  const [tableFilterPlatform, setTableFilterPlatform] = useState('ALL');
  const [tableFilterType, setTableFilterType] = useState('ALL');
  const [tableFilterTopic, setTableFilterTopic] = useState('ALL');
  const [tableFilterPerformance, setTableFilterPerformance] = useState('ALL');
  const [tableSearch, setTableSearch] = useState('');

  // Idea Form State
  const [showIdeaModal, setShowIdeaModal] = useState(false);
  const [editingIdeaId, setEditingIdeaId] = useState(null);
  const [ideaTitle, setIdeaTitle] = useState('');
  const [ideaTopic, setIdeaTopic] = useState('Trading Education');
  const [ideaHook, setIdeaHook] = useState('');
  const [ideaPlatform, setIdeaPlatform] = useState('ALL');
  const [ideaType, setIdeaType] = useState('Reel');
  const [ideaAudience, setIdeaAudience] = useState('');
  const [ideaCta, setIdeaCta] = useState('');
  const [ideaStatus, setIdeaStatus] = useState('Idea');
  const [ideaPriority, setIdeaPriority] = useState('MEDIUM');
  const [ideaNotes, setIdeaNotes] = useState('');

  // Variant Lab Form State
  const [showVariantModal, setShowVariantModal] = useState(false);
  const [labIdeaTitle, setLabIdeaTitle] = useState('');
  const [variantLabel, setVariantLabel] = useState('Variant A');
  const [variantHook, setVariantHook] = useState('');
  const [variantViews, setVariantViews] = useState('');
  const [variantRetention, setVariantRetention] = useState('');
  const [variantEngagement, setVariantEngagement] = useState('');

  // Strategy Form State
  const [editStrategy, setEditStrategy] = useState({
    primaryObjective: '',
    targetAudience: '',
    contentPillars: '',
    preferredFormats: '',
    postingFrequency: '',
    ctaStrategy: '',
    brandTone: '',
    topicsToAvoid: '',
    complianceNotes: ''
  });

  // Phase 2 Data States
  const [accounts, setAccounts] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [showScriptModal, setShowScriptModal] = useState(false);
  const [activeScriptIdea, setActiveScriptIdea] = useState(null);
  const [generatingScript, setGeneratingScript] = useState(false);
  const [approvingIdea, setApprovingIdea] = useState(false);

  // Load all dashboard data
  const loadAllData = useCallback(async () => {
    setLoading(true);
    try {
      const [dashRes, postsRes, metRes, intelRes, recRes, nextRes, ideasRes, varRes, calRes, stratRes, accRes] = await Promise.allSettled([
        apiClient.get(`/social/dashboard?range=${timeRange}&platform=${selectedPlatform}`),
        apiClient.get(`/social/posts?platform=${tableFilterPlatform}&contentType=${tableFilterType}&topic=${tableFilterTopic}&performance=${tableFilterPerformance}&search=${tableSearch}`),
        apiClient.get('/social/metrics'),
        apiClient.get('/social/insights'),
        apiClient.get('/social/recommendations'),
        apiClient.get('/social/next-posts'),
        apiClient.get('/social/content-ideas'),
        apiClient.get('/social/variants'),
        apiClient.get('/social/calendar'),
        apiClient.get('/social/strategy'),
        apiClient.get('/social/accounts')
      ]);

      if (dashRes.status === 'fulfilled') setDashboardData(dashRes.value.data?.overview);
      if (postsRes.status === 'fulfilled') setPosts(postsRes.value.data?.posts || []);
      if (metRes.status === 'fulfilled') setPlatformMetrics(metRes.value.data?.platforms || {});
      if (intelRes.status === 'fulfilled') setIntelligence(intelRes.value.data?.intelligence);
      if (recRes.status === 'fulfilled') setRecommendations(recRes.value.data?.recommendations || []);
      if (nextRes.status === 'fulfilled') setNextPosts(nextRes.value.data?.nextPosts || []);
      if (ideasRes.status === 'fulfilled') setContentIdeas(ideasRes.value.data?.ideas || []);
      if (varRes.status === 'fulfilled') setVariants(varRes.value.data?.variants || []);
      if (calRes.status === 'fulfilled') setCalendarEvents(calRes.value.data?.events || []);
      if (accRes.status === 'fulfilled') setAccounts(accRes.value.data?.accounts || []);
      if (stratRes.status === 'fulfilled') {
        const s = stratRes.value.data?.strategy;
        setStrategy(s);
        if (s) {
          setEditStrategy({
            primaryObjective: s.primaryObjective || '',
            targetAudience: s.targetAudience || '',
            contentPillars: s.contentPillars || '',
            preferredFormats: s.preferredFormats || '',
            postingFrequency: s.postingFrequency || '',
            ctaStrategy: s.ctaStrategy || '',
            brandTone: s.brandTone || '',
            topicsToAvoid: s.topicsToAvoid || '',
            complianceNotes: s.complianceNotes || '',
            autoPublishEnabled: s.autoPublishEnabled || false
          });
        }
      }
    } catch (_) {}
    setLoading(false);
  }, [timeRange, selectedPlatform, tableFilterPlatform, tableFilterType, tableFilterTopic, tableFilterPerformance, tableSearch]);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  // Phase 2: Handle Real-Time Social Sync
  const handleTriggerSync = async () => {
    setSyncing(true);
    try {
      const res = await apiClient.post('/social/sync');
      alert(res.data.message || 'Real-time social media sync completed!');
      loadAllData();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to sync social accounts');
    } finally {
      setSyncing(false);
    }
  };

  // Phase 2: Handle OAuth Authorization Connect Link Generator
  const handleConnectAccount = async (platform) => {
    try {
      const res = await apiClient.get(`/social/auth/${platform}`);
      const authUrl = res.data?.authUrl;

      if (!authUrl) {
        throw new Error(`No authorization URL returned for ${platform}`);
      }

      // Check if real client credentials are still using placeholder
      if (authUrl.includes('PLACEHOLDER')) {
        const cbRes = await apiClient.get(`/social/auth/${platform.toLowerCase()}/callback`);
        alert(`Account Connection Verified (${platform}):\n${cbRes.data?.message || 'Demo connected.'}`);
        setShowConnectModal(false);
        loadAllData();
      } else {
        window.open(authUrl, '_blank', 'width=600,height=700');
      }
    } catch (err) {
      alert(err.response?.data?.error || err.message || `Failed to initiate ${platform} connection`);
    }
  };

  // Phase 2: Handle AI Script Generation
  const handleGenerateScript = async (idea) => {
    setGeneratingScript(true);
    try {
      const res = await apiClient.post(`/social/generate-script/${idea.id}`);
      setActiveScriptIdea(res.data.idea);
      setShowScriptModal(true);
      loadAllData();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to generate script');
    } finally {
      setGeneratingScript(false);
    }
  };

  // Phase 2: Handle Explicit Admin Approval
  const handleApproveIdea = async (ideaId) => {
    setApprovingIdea(true);
    try {
      const res = await apiClient.post(`/social/approve-idea/${ideaId}`);
      alert(res.data.message || 'Content Idea APPROVED successfully!');
      setShowScriptModal(false);
      loadAllData();
    } catch (err) {
      alert(err.response?.data?.error || 'Approval DENIED by Safety Gate');
    } finally {
      setApprovingIdea(false);
    }
  };

  // Phase 2: Toggle Global Auto Publish Safety Gate
  const handleToggleAutoPublish = async (enabled) => {
    try {
      const res = await apiClient.put('/social/strategy/toggle-autopublish', { enabled });
      alert(res.data.message);
      setEditStrategy(prev => ({ ...prev, autoPublishEnabled: res.data.autoPublishEnabled }));
      loadAllData();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to update auto-publish safety gate');
    }
  };

  // Seed Demo Data handler
  const handleSeedDemoData = async () => {
    setSeedingDemo(true);
    try {
      const res = await apiClient.post('/social/demo-data');
      alert(res.data.message || 'Demo data loaded successfully!');
      loadAllData();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to seed demo data');
    } finally {
      setSeedingDemo(false);
    }
  };

  // Content Idea Save/Edit Handler
  const handleSaveIdea = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        title: ideaTitle,
        topic: ideaTopic,
        hook: ideaHook,
        platform: ideaPlatform,
        contentType: ideaType,
        targetAudience: ideaAudience,
        cta: ideaCta,
        status: ideaStatus,
        priority: ideaPriority,
        notes: ideaNotes
      };

      if (editingIdeaId) {
        await apiClient.put(`/social/content-ideas/${editingIdeaId}`, payload);
      } else {
        await apiClient.post('/social/content-ideas', payload);
      }

      setShowIdeaModal(false);
      resetIdeaForm();
      loadAllData();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to save content idea');
    }
  };

  const resetIdeaForm = () => {
    setEditingIdeaId(null);
    setIdeaTitle('');
    setIdeaTopic('Trading Education');
    setIdeaHook('');
    setIdeaPlatform('ALL');
    setIdeaType('Reel');
    setIdeaAudience('');
    setIdeaCta('');
    setIdeaStatus('Idea');
    setIdeaPriority('MEDIUM');
    setIdeaNotes('');
  };

  const handleEditIdea = (idea) => {
    setEditingIdeaId(idea.id);
    setIdeaTitle(idea.title);
    setIdeaTopic(idea.topic);
    setIdeaHook(idea.hook || '');
    setIdeaPlatform(idea.platform || 'ALL');
    setIdeaType(idea.contentType || 'Reel');
    setIdeaAudience(idea.targetAudience || '');
    setIdeaCta(idea.cta || '');
    setIdeaStatus(idea.status || 'Idea');
    setIdeaPriority(idea.priority || 'MEDIUM');
    setIdeaNotes(idea.notes || '');
    setShowIdeaModal(true);
  };

  const handleDeleteIdea = async (id) => {
    if (!confirm('Are you sure you want to delete this content idea?')) return;
    try {
      await apiClient.delete(`/social/content-ideas/${id}`);
      loadAllData();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete idea');
    }
  };

  // Add Variant Handler
  const handleSaveVariant = async (e) => {
    e.preventDefault();
    try {
      await apiClient.post('/social/variants', {
        ideaTitle: labIdeaTitle,
        variantLabel,
        hookText: variantHook,
        views: variantViews ? parseInt(variantViews) : 0,
        retentionRate: variantRetention ? parseFloat(variantRetention) : 0,
        engagementRate: variantEngagement ? parseFloat(variantEngagement) : 0
      });

      setShowVariantModal(false);
      setLabIdeaTitle('');
      setVariantLabel('Variant A');
      setVariantHook('');
      setVariantViews('');
      setVariantRetention('');
      setVariantEngagement('');
      loadAllData();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to save variant');
    }
  };

  // Save Strategy Handler
  const handleSaveStrategy = async () => {
    try {
      await apiClient.put('/social/strategy', editStrategy);
      alert('Social Media Strategy updated successfully!');
      loadAllData();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to update strategy');
    }
  };

  const hasData = posts.length > 0 || (dashboardData && dashboardData.totalPosts > 0);

  return (
    <div className="p-4 bg-[#0B0E14] text-white min-h-[calc(100vh-80px)] font-mono space-y-4 overflow-y-auto">
      {/* ── Top Header Banner ───────────────────────────────────────────── */}
      <div className="bg-[#161B22] p-4 rounded-xl border border-[#D4AF37]/30 flex flex-wrap items-center justify-between gap-4 shadow-[0_0_20px_rgba(212,175,55,0.08)]">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-[#D4AF37]/10 text-[#D4AF37] border border-[#D4AF37]/30 shadow-[0_0_10px_rgba(212,175,55,0.2)]">
            <Share2 className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-extrabold tracking-wider text-white">AI SOCIAL MEDIA MANAGER</h1>
              <span className="text-[9px] font-black bg-[#D4AF37]/20 text-[#D4AF37] px-2 py-0.5 rounded border border-[#D4AF37]/40 uppercase tracking-widest">
                PHASE 1 FOUNDATION
              </span>
              <span className="text-[9px] font-black bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded border border-purple-500/40">
                Demo / Manual Data
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              Social Analytics → AI Intelligence → Viral Lab → Content Strategy Engine
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button
            onClick={() => setShowConnectModal(true)}
            className="px-3.5 py-2 bg-[#00D4FF] hover:bg-[#00D4FF]/90 text-black font-extrabold rounded-lg text-xs transition-all flex items-center gap-1.5 active:scale-95 shadow-[0_0_15px_rgba(0,212,255,0.3)]"
          >
            <Share2 className="w-3.5 h-3.5" />
            CONNECT ACCOUNTS (OAUTH)
          </button>
          <button
            onClick={handleTriggerSync}
            disabled={syncing}
            className="px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white font-extrabold rounded-lg text-xs transition-all border border-white/15 flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'SYNCING METRICS...' : 'SYNC METRICS NOW'}
          </button>
          <button
            onClick={handleSeedDemoData}
            disabled={seedingDemo}
            className="px-3 py-2 bg-gradient-to-r from-[#D4AF37] to-[#FFD700] hover:brightness-110 text-black font-bold rounded-lg text-xs transition-all shadow-[0_0_15px_rgba(212,175,55,0.2)] flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
          >
            {seedingDemo ? 'ADDING...' : 'DEMO DATA'}
          </button>
        </div>
      </div>

      {/* ── Sub Navigation Tabs ────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-1 bg-[#161B22] p-1.5 rounded-xl border border-white/10 text-[11px] font-extrabold">
        {[
          { id: 'OVERVIEW', label: 'DASHBOARD & BREAKDOWN', icon: BarChart3 },
          { id: 'PERFORMANCE', label: 'CONTENT PERFORMANCE TABLE', icon: FileText, count: posts.length },
          { id: 'INTELLIGENCE', label: 'CONTENT INTELLIGENCE', icon: Sparkles },
          { id: 'LAB', label: 'VIRAL CONTENT LAB', icon: Flame, count: variants.length },
          { id: 'NEXT', label: 'WHAT SHOULD I POST NEXT?', icon: Zap },
          { id: 'IDEAS', label: 'CONTENT IDEAS DATABASE', icon: BookOpen, count: contentIdeas.length },
          { id: 'CALENDAR', label: 'CONTENT CALENDAR', icon: Calendar },
          { id: 'STRATEGY', label: 'AI SOCIAL STRATEGY', icon: Award }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-2 rounded-lg flex items-center gap-1.5 transition-all ${
              activeTab === tab.id
                ? 'bg-gradient-to-r from-[#D4AF37] to-[#FFD700] text-black font-black shadow-md'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
            {tab.count !== undefined && (
              <span className={`px-1.5 py-0.2 rounded-full text-[9px] font-black ${activeTab === tab.id ? 'bg-black text-[#D4AF37]' : 'bg-white/10 text-white'}`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Empty State Banner (If no posts exist) ───────────────────────── */}
      {!hasData && !loading && (
        <div className="bg-[#10131a] border border-[#D4AF37]/30 rounded-2xl p-8 text-center space-y-4 my-6">
          <div className="w-16 h-16 rounded-full bg-[#D4AF37]/10 border border-[#D4AF37]/30 flex items-center justify-center text-[#D4AF37] mx-auto shadow-[0_0_20px_rgba(212,175,55,0.2)]">
            <Lock className="w-8 h-8" />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-base font-extrabold text-white">Connect your social accounts in Phase 2.</h2>
            <p className="text-xs text-gray-400 max-w-md mx-auto leading-relaxed">
              No live social media accounts connected yet. You can initialize test data to test Phase 1 analytics, viral lab, and recommendation engines.
            </p>
          </div>
          <button
            onClick={handleSeedDemoData}
            disabled={seedingDemo}
            className="px-6 py-2.5 bg-gradient-to-r from-[#D4AF37] via-[#F59E0B] to-[#D97706] hover:brightness-110 text-black font-black text-xs tracking-wider rounded-xl shadow-[0_0_20px_rgba(212,175,55,0.4)] transition-all inline-flex items-center gap-2 active:scale-95"
          >
            <Plus className="w-4 h-4" />
            ADD DEMO DATA FOR TESTING
          </button>
        </div>
      )}

      {/* ── TAB 1: OVERVIEW & PLATFORM BREAKDOWN ──────────────────────── */}
      {activeTab === 'OVERVIEW' && (
        <div className="space-y-4 font-mono">
          {/* Time Filter Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-[#161B22] p-3 rounded-xl border border-white/10">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-[#D4AF37]" />
              <span className="text-xs font-bold text-gray-300">TIME RANGE FILTER:</span>
              <div className="flex bg-[#0B0E14] p-1 rounded-lg border border-white/10 text-[10px]">
                {[
                  { id: 'today', label: 'TODAY' },
                  { id: '7d', label: 'LAST 7 DAYS' },
                  { id: '30d', label: 'LAST 30 DAYS' },
                  { id: 'all', label: 'ALL TIME' }
                ].map(r => (
                  <button
                    key={r.id}
                    onClick={() => setTimeRange(r.id)}
                    className={`px-3 py-1 rounded font-bold transition-all ${
                      timeRange === r.id ? 'bg-[#D4AF37] text-black font-black' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-gray-300">PLATFORM:</span>
              <div className="flex bg-[#0B0E14] p-1 rounded-lg border border-white/10 text-[10px]">
                {['ALL', 'INSTAGRAM', 'YOUTUBE', 'FACEBOOK'].map(p => (
                  <button
                    key={p}
                    onClick={() => setSelectedPlatform(p)}
                    className={`px-3 py-1 rounded font-bold transition-all ${
                      selectedPlatform === p ? 'bg-[#00D4FF] text-black font-black' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Overview Metrics Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: 'TOTAL POSTS', val: dashboardData?.totalPosts || 0, icon: FileText, color: 'text-white' },
              { label: 'TOTAL VIEWS', val: (dashboardData?.totalViews || 0).toLocaleString(), icon: Eye, color: 'text-[#00D4FF]' },
              { label: 'AVG VIEWS / POST', val: (dashboardData?.averageViews || 0).toLocaleString(), icon: BarChart3, color: 'text-purple-400' },
              { label: 'TOTAL LIKES', val: (dashboardData?.totalLikes || 0).toLocaleString(), icon: ThumbsUp, color: 'text-pink-400' },
              { label: 'TOTAL COMMENTS', val: (dashboardData?.totalComments || 0).toLocaleString(), icon: MessageSquare, color: 'text-blue-400' },
              { label: 'SHARES & SAVES', val: `${(dashboardData?.totalShares || 0).toLocaleString()} / ${(dashboardData?.totalSaves || 0).toLocaleString()}`, icon: Repeat, color: 'text-amber-400' },
            ].map((card, idx) => (
              <div key={idx} className="bg-[#161B22] p-3.5 rounded-xl border border-white/10 space-y-1 hover:border-[#D4AF37]/40 transition-all">
                <div className="flex items-center justify-between text-gray-400 text-[9px] font-bold">
                  <span>{card.label}</span>
                  <card.icon className={`w-3.5 h-3.5 ${card.color}`} />
                </div>
                <div className={`text-base font-black ${card.color}`}>{card.val}</div>
              </div>
            ))}
          </div>

          {/* Second Row: Followers, Engagement Rate, Best/Worst Post */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-[#161B22] p-4 rounded-xl border border-white/10 space-y-2">
              <div className="flex justify-between items-center text-xs text-gray-400 font-bold">
                <span>FOLLOWERS GAINED</span>
                <UserPlus className="w-4 h-4 text-[#00FF41]" />
              </div>
              <div className="text-2xl font-black text-[#00FF41]">
                +{(dashboardData?.followersGained || 0).toLocaleString()}
              </div>
              <span className="text-[10px] text-gray-500 block">Attributed to high-performing educational reels</span>
            </div>

            <div className="bg-[#161B22] p-4 rounded-xl border border-white/10 space-y-2">
              <div className="flex justify-between items-center text-xs text-gray-400 font-bold">
                <span>ENGAGEMENT RATE</span>
                <TrendingUp className="w-4 h-4 text-[#D4AF37]" />
              </div>
              <div className="text-2xl font-black text-[#D4AF37]">
                {dashboardData?.engagementRate || 0}%
              </div>
              <span className="text-[10px] text-gray-500 block">Likes, comments, shares & saves ratio over views</span>
            </div>

            <div className="bg-[#161B22] p-4 rounded-xl border border-white/10 space-y-2">
              <div className="flex justify-between items-center text-xs text-gray-400 font-bold">
                <span>BEST VS WORST POST</span>
                <Award className="w-4 h-4 text-purple-400" />
              </div>
              <div className="text-[11px] space-y-1">
                <div className="truncate">
                  <span className="text-gray-400">Best:</span>{' '}
                  <strong className="text-[#00FF41]">
                    {dashboardData?.bestPost ? `${dashboardData.bestPost.title} (${dashboardData.bestPost.views.toLocaleString()} views)` : 'N/A'}
                  </strong>
                </div>
                <div className="truncate">
                  <span className="text-gray-400">Worst:</span>{' '}
                  <strong className="text-red-400">
                    {dashboardData?.worstPost ? `${dashboardData.worstPost.title} (${dashboardData.worstPost.views.toLocaleString()} views)` : 'N/A'}
                  </strong>
                </div>
              </div>
            </div>
          </div>

          {/* Platform Breakdown Cards */}
          <div className="space-y-3">
            <h2 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Share2 className="w-4 h-4 text-[#00D4FF]" /> PLATFORM BREAKDOWN ({selectedPlatform})
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {['INSTAGRAM', 'YOUTUBE', 'FACEBOOK'].map(p => {
                const data = platformMetrics[p] || {};
                return (
                  <div key={p} className="bg-[#161B22] p-4 rounded-xl border border-white/10 space-y-3">
                    <div className="flex justify-between items-center border-b border-white/10 pb-2">
                      <span className="font-extrabold text-sm text-white flex items-center gap-2">
                        {p === 'INSTAGRAM' ? '📸 INSTAGRAM' : p === 'YOUTUBE' ? '▶️ YOUTUBE' : '📘 FACEBOOK'}
                      </span>
                      <span className="text-[10px] bg-[#00D4FF]/10 text-[#00D4FF] border border-[#00D4FF]/30 px-2 py-0.5 rounded font-bold">
                        {data.posts || 0} Posts
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[10px]">
                      <div className="bg-[#0B0E14] p-2 rounded border border-white/5">
                        <span className="text-gray-500 block">Total Views</span>
                        <strong className="text-white text-xs">{(data.views || 0).toLocaleString()}</strong>
                      </div>
                      <div className="bg-[#0B0E14] p-2 rounded border border-white/5">
                        <span className="text-gray-500 block">Avg Views</span>
                        <strong className="text-[#00D4FF] text-xs">{(data.averageViews || 0).toLocaleString()}</strong>
                      </div>
                      <div className="bg-[#0B0E14] p-2 rounded border border-white/5">
                        <span className="text-gray-500 block">Followers Gained</span>
                        <strong className="text-[#00FF41] text-xs">+{(data.followersGained || 0).toLocaleString()}</strong>
                      </div>
                      <div className="bg-[#0B0E14] p-2 rounded border border-white/5">
                        <span className="text-gray-500 block">Eng Rate</span>
                        <strong className="text-[#D4AF37] text-xs">{data.engagementRate || 0}%</strong>
                      </div>
                    </div>

                    <div className="text-[10px] text-gray-400 border-t border-white/5 pt-2 truncate">
                      <span>Best Post:</span> <strong className="text-white">{data.bestPost || 'N/A'}</strong>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 2: CONTENT PERFORMANCE TABLE ──────────────────────────── */}
      {activeTab === 'PERFORMANCE' && (
        <div className="bg-[#161B22] p-4 rounded-xl border border-white/10 space-y-4 font-mono">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
            <h2 className="text-xs font-bold text-white flex items-center gap-2">
              <FileText className="w-4 h-4 text-[#D4AF37]" /> DETAILED CONTENT PERFORMANCE REGISTER ({posts.length} Posts)
            </h2>

            {/* Filter Pills */}
            <div className="flex flex-wrap gap-2 text-[10px]">
              <select
                value={tableFilterPlatform}
                onChange={e => setTableFilterPlatform(e.target.value)}
                className="bg-[#0B0E14] border border-white/10 px-2.5 py-1 rounded text-white font-bold outline-none"
              >
                <option value="ALL">Platform: All</option>
                <option value="INSTAGRAM">Instagram</option>
                <option value="YOUTUBE">YouTube</option>
                <option value="FACEBOOK">Facebook</option>
              </select>

              <select
                value={tableFilterType}
                onChange={e => setTableFilterType(e.target.value)}
                className="bg-[#0B0E14] border border-white/10 px-2.5 py-1 rounded text-white font-bold outline-none"
              >
                <option value="ALL">Type: All</option>
                <option value="Reel">Reel</option>
                <option value="Short">Short</option>
                <option value="Video">Video</option>
                <option value="Carousel">Carousel</option>
                <option value="Image">Image</option>
                <option value="Story">Story</option>
              </select>

              <select
                value={tableFilterPerformance}
                onChange={e => setTableFilterPerformance(e.target.value)}
                className="bg-[#0B0E14] border border-white/10 px-2.5 py-1 rounded text-white font-bold outline-none"
              >
                <option value="ALL">Score: All</option>
                <option value="HIGH">High Score (&ge;75)</option>
                <option value="MEDIUM">Medium Score (40-74)</option>
                <option value="LOW">Low Score (&lt;40)</option>
              </select>

              <input
                type="text"
                placeholder="Search topic or title..."
                value={tableSearch}
                onChange={e => setTableSearch(e.target.value)}
                className="bg-[#0B0E14] border border-white/10 px-2.5 py-1 rounded text-white text-[10px] outline-none focus:border-[#D4AF37]"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#0B0E14] text-gray-400 font-bold border-b border-white/10 text-[10px] uppercase">
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3">Platform</th>
                  <th className="py-2.5 px-3">Content Title</th>
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3 text-right">Views</th>
                  <th className="py-2.5 px-3 text-right">Likes</th>
                  <th className="py-2.5 px-3 text-right">Comments</th>
                  <th className="py-2.5 px-3 text-right">Shares</th>
                  <th className="py-2.5 px-3 text-right">Saves</th>
                  <th className="py-2.5 px-3 text-right">Followers</th>
                  <th className="py-2.5 px-3 text-right">Eng %</th>
                  <th className="py-2.5 px-3 text-center">Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-[11px]">
                {posts.length === 0 ? (
                  <tr>
                    <td colSpan="12" className="text-center py-8 text-gray-500">
                      No social media posts recorded matching filters.
                    </td>
                  </tr>
                ) : (
                  posts.map(p => (
                    <tr key={p.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="py-3 px-3 text-gray-400 text-[10px]">
                        {new Date(p.publishedAt).toLocaleDateString('en-IN')}
                      </td>
                      <td className="py-3 px-3 font-extrabold text-[#00D4FF]">
                        {p.platform}
                      </td>
                      <td className="py-3 px-3">
                        <span className="font-bold text-white block">{p.title}</span>
                        <span className="text-[9px] text-gray-400">Topic: {p.topic}</span>
                      </td>
                      <td className="py-3 px-3 font-semibold text-purple-300">
                        {p.contentType}
                      </td>
                      <td className="py-3 px-3 text-right font-bold text-white">
                        {(p.views || 0).toLocaleString()}
                      </td>
                      <td className="py-3 px-3 text-right text-gray-300">
                        {(p.likes || 0).toLocaleString()}
                      </td>
                      <td className="py-3 px-3 text-right text-gray-300">
                        {(p.comments || 0).toLocaleString()}
                      </td>
                      <td className="py-3 px-3 text-right text-gray-300">
                        {(p.shares || 0).toLocaleString()}
                      </td>
                      <td className="py-3 px-3 text-right text-gray-300">
                        {(p.saves || 0).toLocaleString()}
                      </td>
                      <td className="py-3 px-3 text-right font-bold text-[#00FF41]">
                        +{(p.followersGained || 0).toLocaleString()}
                      </td>
                      <td className="py-3 px-3 text-right font-bold text-[#D4AF37]">
                        {p.engagementRate}%
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className={`px-2 py-0.5 rounded font-black text-[10px] ${
                          p.score >= 75 ? 'bg-[#00FF41]/20 text-[#00FF41] border border-[#00FF41]/30' :
                          p.score >= 40 ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' :
                          'bg-red-500/20 text-red-400 border border-red-500/30'
                        }`}>
                          {p.score}/100
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TAB 3: CONTENT INTELLIGENCE & AI RECOMMENDATIONS ───────────── */}
      {activeTab === 'INTELLIGENCE' && (
        <div className="space-y-4 font-mono">
          {/* Insufficient Data Alert if sample size < 3 */}
          {intelligence?.insufficientData && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-center gap-3 text-amber-300 text-xs">
              <AlertTriangle className="w-5 h-5 shrink-0 text-amber-400" />
              <div>
                <strong className="block font-extrabold uppercase">Insufficient Data Warning</strong>
                <span>Sample size is below 3 analyzed posts. Intelligence engine requires at least 3 posts before making definitive conclusions. Showing baseline patterns.</span>
              </div>
            </div>
          )}

          {/* Winning vs Weak Content Patterns Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* WINNING CONTENT */}
            <div className="bg-[#161B22] p-4 rounded-xl border border-[#00FF41]/30 space-y-3 shadow-[0_0_15px_rgba(0,255,65,0.05)]">
              <div className="flex justify-between items-center border-b border-[#00FF41]/20 pb-2">
                <h3 className="text-xs font-black text-[#00FF41] uppercase tracking-wider flex items-center gap-2">
                  <Flame className="w-4 h-4 text-[#00FF41]" /> WINNING CONTENT PATTERNS
                </h3>
                <span className="text-[9px] bg-[#00FF41]/10 text-[#00FF41] px-2 py-0.5 rounded font-bold border border-[#00FF41]/30">
                  TOP PERFORMERS
                </span>
              </div>

              <div className="space-y-2 text-xs">
                <div className="bg-[#0B0E14] p-3 rounded-lg border border-white/5 flex justify-between items-center">
                  <div>
                    <span className="text-gray-400 text-[10px] block">BEST PERFORMING TOPIC</span>
                    <strong className="text-white text-sm">
                      {intelligence?.winningContent?.bestTopic ? intelligence.winningContent.bestTopic.name : 'Insufficient data'}
                    </strong>
                  </div>
                  {intelligence?.winningContent?.bestTopic && (
                    <span className="text-[#00FF41] font-bold text-xs">
                      Avg {intelligence.winningContent.bestTopic.avgViews.toLocaleString()} views
                    </span>
                  )}
                </div>

                <div className="bg-[#0B0E14] p-3 rounded-lg border border-white/5 flex justify-between items-center">
                  <div>
                    <span className="text-gray-400 text-[10px] block">BEST CONTENT FORMAT</span>
                    <strong className="text-white text-sm">
                      {intelligence?.winningContent?.bestFormat ? intelligence.winningContent.bestFormat.name : 'Insufficient data'}
                    </strong>
                  </div>
                  {intelligence?.winningContent?.bestFormat && (
                    <span className="text-[#00D4FF] font-bold text-xs">
                      Score {intelligence.winningContent.bestFormat.avgScore}/100
                    </span>
                  )}
                </div>

                <div className="bg-[#0B0E14] p-3 rounded-lg border border-white/5 flex justify-between items-center">
                  <div>
                    <span className="text-gray-400 text-[10px] block">BEST POSTING TIME</span>
                    <strong className="text-white text-sm">
                      {intelligence?.winningContent?.bestTime ? intelligence.winningContent.bestTime.name : 'Insufficient data'}
                    </strong>
                  </div>
                  {intelligence?.winningContent?.bestTime && (
                    <span className="text-[#D4AF37] font-bold text-xs">
                      Highest initial view velocity
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* WEAK CONTENT */}
            <div className="bg-[#161B22] p-4 rounded-xl border border-red-500/30 space-y-3 shadow-[0_0_15px_rgba(239,68,68,0.05)]">
              <div className="flex justify-between items-center border-b border-red-500/20 pb-2">
                <h3 className="text-xs font-black text-red-400 uppercase tracking-wider flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-400" /> WEAK CONTENT PATTERNS
                </h3>
                <span className="text-[9px] bg-red-500/10 text-red-400 px-2 py-0.5 rounded font-bold border border-red-500/30">
                  UNDERPERFORMING
                </span>
              </div>

              <div className="space-y-2 text-xs">
                <div className="bg-[#0B0E14] p-3 rounded-lg border border-white/5 flex justify-between items-center">
                  <div>
                    <span className="text-gray-400 text-[10px] block">WEAKEST TOPIC</span>
                    <strong className="text-white text-sm">
                      {intelligence?.weakContent?.weakestTopic ? intelligence.weakContent.weakestTopic.name : 'Insufficient data'}
                    </strong>
                  </div>
                  {intelligence?.weakContent?.weakestTopic && (
                    <span className="text-red-400 font-bold text-xs">
                      Score {intelligence.weakContent.weakestTopic.avgScore}/100
                    </span>
                  )}
                </div>

                <div className="bg-[#0B0E14] p-3 rounded-lg border border-white/5 flex justify-between items-center">
                  <div>
                    <span className="text-gray-400 text-[10px] block">WEAKEST FORMAT</span>
                    <strong className="text-white text-sm">
                      {intelligence?.weakContent?.weakestFormat ? intelligence.weakContent.weakestFormat.name : 'Insufficient data'}
                    </strong>
                  </div>
                  {intelligence?.weakContent?.weakestFormat && (
                    <span className="text-red-400 font-bold text-xs">
                      Low share & save conversions
                    </span>
                  )}
                </div>

                <div className="bg-[#0B0E14] p-3 rounded-lg border border-white/5 flex justify-between items-center">
                  <div>
                    <span className="text-gray-400 text-[10px] block">PRIMARY BOTTLENECK</span>
                    <strong className="text-amber-400 text-xs">
                      {intelligence?.insufficientData ? 'Insufficient data' : 'Generic opening hooks & non-educational CTAs'}
                    </strong>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* AI RECOMMENDATIONS SECTION */}
          <div className="space-y-3 pt-2">
            <h2 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#D4AF37]" /> AI RECOMMENDATIONS ENGINE
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {recommendations.map(rec => (
                <div key={rec.id} className="bg-[#161B22] p-4 rounded-xl border border-[#D4AF37]/30 space-y-3 relative hover:border-[#D4AF37] transition-all">
                  <div className="flex justify-between items-start gap-2 border-b border-white/10 pb-2">
                    <h4 className="font-extrabold text-sm text-[#D4AF37]">{rec.title}</h4>
                    <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                      rec.confidence === 'High' ? 'bg-[#00FF41]/20 text-[#00FF41] border border-[#00FF41]/30' : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    }`}>
                      {rec.confidence} Confidence
                    </span>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div>
                      <span className="text-gray-400 text-[10px] font-bold block uppercase">Reason:</span>
                      <p className="text-gray-200">{rec.reason}</p>
                    </div>

                    <div>
                      <span className="text-gray-400 text-[10px] font-bold block uppercase">Supporting Metric:</span>
                      <p className="text-[#00D4FF] font-bold text-[11px]">{rec.supportingMetric}</p>
                    </div>

                    <div className="bg-[#0B0E14] p-3 rounded-lg border border-[#D4AF37]/20">
                      <span className="text-[#D4AF37] text-[10px] font-black block uppercase">Suggested Action:</span>
                      <p className="text-white font-bold text-[11px] mt-0.5">{rec.suggestedAction}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 4: VIRAL CONTENT LAB ──────────────────────────────────── */}
      {activeTab === 'LAB' && (
        <div className="space-y-4 font-mono">
          <div className="bg-[#161B22] p-4 rounded-xl border border-white/10 flex flex-wrap justify-between items-center gap-3">
            <div>
              <h2 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Flame className="w-4 h-4 text-amber-400" /> VIRAL CONTENT LAB - VARIANT TESTING ENGINE
              </h2>
              <p className="text-[10px] text-gray-400 mt-0.5">
                Test multiple hooks for the same content idea to discover winning patterns faster. (Not a viral guarantee).
              </p>
            </div>

            <button
              onClick={() => setShowVariantModal(true)}
              className="px-3.5 py-2 bg-[#D4AF37] hover:bg-[#D4AF37]/90 text-black font-extrabold rounded-lg text-xs transition-all flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" /> ADD IDEA VARIANT
            </button>
          </div>

          {/* Variants Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {variants.length === 0 ? (
              <div className="col-span-3 text-center py-10 bg-[#161B22] border border-white/5 rounded-xl text-gray-500 text-xs">
                No content variants logged in Viral Lab yet. Click "Add Idea Variant" to log A/B test hooks.
              </div>
            ) : (
              variants.map(v => (
                <div key={v.id} className="bg-[#161B22] p-4 rounded-xl border border-white/10 space-y-3">
                  <div className="flex justify-between items-center border-b border-white/10 pb-2">
                    <span className="font-extrabold text-xs text-white truncate">{v.ideaTitle}</span>
                    <span className={`px-2 py-0.5 rounded text-[9px] font-black ${
                      v.status === 'WINNER' ? 'bg-[#00FF41]/20 text-[#00FF41] border border-[#00FF41]/30' :
                      v.status === 'UNDERPERFORMING' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                      'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    }`}>
                      {v.status}
                    </span>
                  </div>

                  <div className="bg-[#0B0E14] p-3 rounded-lg border border-white/5 space-y-1">
                    <span className="text-[9px] font-extrabold text-[#D4AF37] block uppercase">{v.variantLabel}:</span>
                    <p className="text-xs text-white font-bold italic">"{v.hookText}"</p>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <div className="bg-[#0B0E14] p-2 rounded border border-white/5">
                      <span className="text-gray-500 block">Views</span>
                      <strong className="text-white text-xs">{v.views.toLocaleString()}</strong>
                    </div>
                    <div className="bg-[#0B0E14] p-2 rounded border border-white/5">
                      <span className="text-gray-500 block">Engagement Rate</span>
                      <strong className="text-[#D4AF37] text-xs">{v.engagementRate}%</strong>
                    </div>
                    <div className="bg-[#0B0E14] p-2 rounded border border-white/5">
                      <span className="text-gray-500 block">Retention</span>
                      <strong className="text-[#00D4FF] text-xs">{v.retentionRate}%</strong>
                    </div>
                    <div className="bg-[#0B0E14] p-2 rounded border border-white/5">
                      <span className="text-gray-500 block">Followers Gained</span>
                      <strong className="text-[#00FF41] text-xs">+{v.followersGained}</strong>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Variant Modal */}
          {showVariantModal && (
            <div className="fixed inset-0 z-[300] flex items-center justify-center bg-[#0B0E14]/85 backdrop-blur-md p-4 font-mono text-xs">
              <div className="bg-[#10131a] border border-[#D4AF37]/30 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
                <div className="flex justify-between items-center border-b border-white/10 pb-2">
                  <h3 className="font-extrabold text-sm text-white">ADD VIRAL LAB VARIANT</h3>
                  <button onClick={() => setShowVariantModal(false)} className="text-gray-400 hover:text-white">✕</button>
                </div>

                <form onSubmit={handleSaveVariant} className="space-y-3">
                  <div>
                    <label className="block text-gray-400 font-bold mb-1">IDEA TITLE</label>
                    <input
                      type="text"
                      value={labIdeaTitle}
                      onChange={e => setLabIdeaTitle(e.target.value)}
                      placeholder="e.g. Why most traders lose money"
                      className="w-full bg-[#0B0E14] border border-white/10 px-3 py-2 rounded text-white font-bold outline-none focus:border-[#D4AF37]"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-gray-400 font-bold mb-1">VARIANT LABEL</label>
                      <select
                        value={variantLabel}
                        onChange={e => setVariantLabel(e.target.value)}
                        className="w-full bg-[#0B0E14] border border-white/10 px-3 py-2 rounded text-white font-bold outline-none"
                      >
                        <option value="Variant A">Variant A</option>
                        <option value="Variant B">Variant B</option>
                        <option value="Variant C">Variant C</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-gray-400 font-bold mb-1">TEST VIEWS</label>
                      <input
                        type="number"
                        value={variantViews}
                        onChange={e => setVariantViews(e.target.value)}
                        placeholder="e.g. 15000"
                        className="w-full bg-[#0B0E14] border border-white/10 px-3 py-2 rounded text-white font-bold outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-gray-400 font-bold mb-1">OPENING HOOK TEXT</label>
                    <textarea
                      value={variantHook}
                      onChange={e => setVariantHook(e.target.value)}
                      placeholder="e.g. 95% of traders make this mistake before 10 AM..."
                      className="w-full bg-[#0B0E14] border border-white/10 px-3 py-2 rounded text-white text-xs outline-none focus:border-[#D4AF37]"
                      rows={2}
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-gray-400 font-bold mb-1">RETENTION %</label>
                      <input
                        type="number"
                        step="0.1"
                        value={variantRetention}
                        onChange={e => setVariantRetention(e.target.value)}
                        placeholder="e.g. 65.5"
                        className="w-full bg-[#0B0E14] border border-white/10 px-3 py-2 rounded text-white font-bold outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-gray-400 font-bold mb-1">ENGAGEMENT %</label>
                      <input
                        type="number"
                        step="0.1"
                        value={variantEngagement}
                        onChange={e => setVariantEngagement(e.target.value)}
                        placeholder="e.g. 8.2"
                        className="w-full bg-[#0B0E14] border border-white/10 px-3 py-2 rounded text-white font-bold outline-none"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full py-2.5 bg-[#D4AF37] hover:bg-[#D4AF37]/90 text-black font-extrabold rounded-lg text-xs transition-colors"
                  >
                    SAVE VARIANT RECORD
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── TAB 5: WHAT SHOULD I POST NEXT? ───────────────────────────── */}
      {activeTab === 'NEXT' && (
        <div className="space-y-4 font-mono">
          <div className="bg-[#161B22] p-4 rounded-xl border border-white/10 space-y-1">
            <h2 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Zap className="w-4 h-4 text-[#00D4FF]" /> WHAT SHOULD I POST NEXT? (AI RECOMMENDATIONS)
            </h2>
            <p className="text-[10px] text-gray-400">
              5 strategic content recommendations derived from historical winning performance metrics.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {nextPosts.map((rec, idx) => (
              <div key={idx} className="bg-[#161B22] p-4 rounded-xl border border-white/10 space-y-3 relative hover:border-[#00D4FF]/50 transition-all flex flex-col justify-between">
                <div className="space-y-2">
                  <div className="flex justify-between items-center border-b border-white/10 pb-2">
                    <span className="font-black text-xs text-[#00D4FF]">REC #{idx + 1}: {rec.format}</span>
                    <span className="text-[9px] bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded font-bold border border-purple-500/30">
                      {rec.suggestedDuration}
                    </span>
                  </div>

                  <div>
                    <span className="text-gray-400 text-[9px] font-bold block uppercase">Topic:</span>
                    <strong className="text-white text-xs font-bold block">{rec.topic}</strong>
                  </div>

                  <div className="bg-[#0B0E14] p-2.5 rounded border border-white/5 space-y-0.5">
                    <span className="text-[9px] font-bold text-[#D4AF37] uppercase block">Suggested Opening Hook:</span>
                    <p className="text-xs text-white italic font-bold">"{rec.hook}"</p>
                  </div>

                  <div>
                    <span className="text-gray-400 text-[9px] font-bold block uppercase">Call To Action (CTA):</span>
                    <p className="text-gray-300 text-[10px]">{rec.cta}</p>
                  </div>

                  <div className="text-[10px] text-gray-400 pt-1 border-t border-white/5">
                    <span className="block"><strong className="text-gray-300">Reason:</strong> {rec.reason}</span>
                    <span className="block text-[#00FF41] mt-0.5"><strong>Objective:</strong> {rec.testObjective}</span>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setIdeaTitle(rec.topic);
                    setIdeaTopic(rec.topic);
                    setIdeaHook(rec.hook);
                    setIdeaType(rec.format.includes('Reel') ? 'Reel' : rec.format.includes('Carousel') ? 'Carousel' : 'Short');
                    setIdeaCta(rec.cta);
                    setIdeaNotes(`Suggested Objective: ${rec.testObjective}`);
                    setActiveTab('IDEAS');
                    setShowIdeaModal(true);
                  }}
                  className="w-full py-2 bg-[#00D4FF]/10 hover:bg-[#00D4FF]/20 text-[#00D4FF] border border-[#00D4FF]/30 rounded-lg text-[10px] font-extrabold transition-all mt-3"
                >
                  USE IN CONTENT IDEAS ➔
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── TAB 6: CONTENT IDEAS DATABASE ─────────────────────────────── */}
      {activeTab === 'IDEAS' && (
        <div className="space-y-4 font-mono">
          <div className="bg-[#161B22] p-4 rounded-xl border border-white/10 flex flex-wrap justify-between items-center gap-3">
            <div>
              <h2 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-[#D4AF37]" /> CONTENT IDEAS DATABASE ({contentIdeas.length})
              </h2>
              <p className="text-[10px] text-gray-400 mt-0.5">
                Manage, edit, approve, and track content ideas from inception to publication.
              </p>
            </div>

            <button
              onClick={() => {
                resetIdeaForm();
                setShowIdeaModal(true);
              }}
              className="px-3.5 py-2 bg-[#D4AF37] hover:bg-[#D4AF37]/90 text-black font-extrabold rounded-lg text-xs transition-all flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" /> CREATE NEW IDEA
            </button>
          </div>

          {/* Ideas Table */}
          <div className="bg-[#161B22] p-4 rounded-xl border border-white/10 overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#0B0E14] text-gray-400 font-bold border-b border-white/10 text-[10px] uppercase">
                  <th className="py-2.5 px-3">Title & Hook</th>
                  <th className="py-2.5 px-3">Topic</th>
                  <th className="py-2.5 px-3">Platform & Format</th>
                  <th className="py-2.5 px-3">Priority</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                  <th className="py-2.5 px-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-[11px]">
                {contentIdeas.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="text-center py-8 text-gray-500">
                      No content ideas logged yet. Click "Create New Idea" to add one.
                    </td>
                  </tr>
                ) : (
                  contentIdeas.map(idea => (
                    <tr key={idea.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="py-3 px-3">
                        <span className="font-bold text-white block">{idea.title}</span>
                        {idea.hook && <span className="text-[9px] text-gray-400 italic block">"{idea.hook}"</span>}
                      </td>
                      <td className="py-3 px-3 text-purple-300 font-semibold">
                        {idea.topic}
                      </td>
                      <td className="py-3 px-3 text-gray-300">
                        <span className="text-[#00D4FF] font-bold">{idea.platform}</span> / {idea.contentType}
                      </td>
                      <td className="py-3 px-3">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-black ${
                          idea.priority === 'HIGH' || idea.priority === 'URGENT' ? 'bg-red-500/20 text-red-400' : 'bg-white/10 text-gray-300'
                        }`}>
                          {idea.priority}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className="px-2 py-0.5 rounded text-[9px] font-black bg-[#D4AF37]/20 text-[#D4AF37] border border-[#D4AF37]/30">
                          {idea.status}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => handleGenerateScript(idea)}
                            disabled={generatingScript}
                            className="px-2 py-1 bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/30 rounded text-[9px] font-black flex items-center gap-1"
                            title="Generate AI Video Script"
                          >
                            <Sparkles className="w-3 h-3" /> SCRIPT
                          </button>

                          {idea.status === 'Awaiting Approval' && (
                            <button
                              onClick={() => handleApproveIdea(idea.id)}
                              disabled={approvingIdea}
                              className="px-2 py-1 bg-[#00FF41]/20 hover:bg-[#00FF41]/30 text-[#00FF41] border border-[#00FF41]/30 rounded text-[9px] font-black flex items-center gap-1"
                              title="Approve Idea"
                            >
                              <CheckCircle2 className="w-3 h-3" /> APPROVE
                            </button>
                          )}

                          <button
                            onClick={() => handleEditIdea(idea)}
                            className="p-1 bg-white/5 hover:bg-white/10 text-gray-300 rounded"
                            title="Edit"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteIdea(idea.id)}
                            className="p-1 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Idea Modal */}
          {showIdeaModal && (
            <div className="fixed inset-0 z-[300] flex items-center justify-center bg-[#0B0E14]/85 backdrop-blur-md p-4 font-mono text-xs">
              <div className="bg-[#10131a] border border-[#D4AF37]/30 rounded-2xl w-full max-w-lg p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center border-b border-white/10 pb-2">
                  <h3 className="font-extrabold text-sm text-white">
                    {editingIdeaId ? 'EDIT CONTENT IDEA' : 'CREATE CONTENT IDEA'}
                  </h3>
                  <button onClick={() => setShowIdeaModal(false)} className="text-gray-400 hover:text-white">✕</button>
                </div>

                {/* Compliance Warning Notice */}
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-[10px] text-amber-300 space-y-0.5">
                  <strong className="font-bold flex items-center gap-1 text-amber-400">
                    <ShieldAlert className="w-3.5 h-3.5" /> COMPLIANCE MANDATE:
                  </strong>
                  <span>AI-generated content must be manually reviewed before publishing. No guaranteed return claims.</span>
                </div>

                <form onSubmit={handleSaveIdea} className="space-y-3">
                  <div>
                    <label className="block text-gray-400 font-bold mb-1">TITLE</label>
                    <input
                      type="text"
                      value={ideaTitle}
                      onChange={e => setIdeaTitle(e.target.value)}
                      placeholder="e.g. 3 Position Sizing Rules"
                      className="w-full bg-[#0B0E14] border border-white/10 px-3 py-2 rounded text-white font-bold outline-none focus:border-[#D4AF37]"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-gray-400 font-bold mb-1">TOPIC</label>
                      <input
                        type="text"
                        value={ideaTopic}
                        onChange={e => setIdeaTopic(e.target.value)}
                        placeholder="e.g. Trading Education"
                        className="w-full bg-[#0B0E14] border border-white/10 px-3 py-2 rounded text-white font-bold outline-none"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-gray-400 font-bold mb-1">FORMAT</label>
                      <select
                        value={ideaType}
                        onChange={e => setIdeaType(e.target.value)}
                        className="w-full bg-[#0B0E14] border border-white/10 px-3 py-2 rounded text-white font-bold outline-none"
                      >
                        <option value="Reel">Reel</option>
                        <option value="Short">Short</option>
                        <option value="Video">Video</option>
                        <option value="Carousel">Carousel</option>
                        <option value="Image">Image</option>
                        <option value="Story">Story</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-gray-400 font-bold mb-1">HOOK TEXT</label>
                    <textarea
                      value={ideaHook}
                      onChange={e => setIdeaHook(e.target.value)}
                      placeholder="e.g. 95% of retail traders blow their account by doing this..."
                      className="w-full bg-[#0B0E14] border border-white/10 px-3 py-2 rounded text-white text-xs outline-none focus:border-[#D4AF37]"
                      rows={2}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-gray-400 font-bold mb-1">STATUS</label>
                      <select
                        value={ideaStatus}
                        onChange={e => setIdeaStatus(e.target.value)}
                        className="w-full bg-[#0B0E14] border border-white/10 px-3 py-2 rounded text-white font-bold outline-none"
                      >
                        <option value="Idea">Idea</option>
                        <option value="Draft">Draft</option>
                        <option value="Ready">Ready</option>
                        <option value="Awaiting Approval">Awaiting Approval</option>
                        <option value="Approved">Approved</option>
                        <option value="Published">Published</option>
                        <option value="Analysing">Analysing</option>
                        <option value="Winner">Winner</option>
                        <option value="Rejected">Rejected</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-gray-400 font-bold mb-1">PRIORITY</label>
                      <select
                        value={ideaPriority}
                        onChange={e => setIdeaPriority(e.target.value)}
                        className="w-full bg-[#0B0E14] border border-white/10 px-3 py-2 rounded text-white font-bold outline-none"
                      >
                        <option value="LOW">LOW</option>
                        <option value="MEDIUM">MEDIUM</option>
                        <option value="HIGH">HIGH</option>
                        <option value="URGENT">URGENT</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-gray-400 font-bold mb-1">CALL TO ACTION (CTA)</label>
                    <input
                      type="text"
                      value={ideaCta}
                      onChange={e => setIdeaCta(e.target.value)}
                      placeholder="e.g. Enroll for free trial link in bio"
                      className="w-full bg-[#0B0E14] border border-white/10 px-3 py-2 rounded text-white text-xs outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-gray-400 font-bold mb-1">NOTES</label>
                    <textarea
                      value={ideaNotes}
                      onChange={e => setIdeaNotes(e.target.value)}
                      placeholder="Internal production notes..."
                      className="w-full bg-[#0B0E14] border border-white/10 px-3 py-2 rounded text-white text-xs outline-none"
                      rows={2}
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full py-2.5 bg-[#D4AF37] hover:bg-[#D4AF37]/90 text-black font-extrabold rounded-lg text-xs transition-colors"
                  >
                    SAVE CONTENT IDEA RECORD
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── TAB 7: CONTENT CALENDAR ───────────────────────────────────── */}
      {activeTab === 'CALENDAR' && (
        <div className="space-y-4 font-mono">
          <div className="bg-[#161B22] p-4 rounded-xl border border-white/10 flex flex-wrap justify-between items-center gap-3">
            <div>
              <h2 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Calendar className="w-4 h-4 text-[#00D4FF]" /> CONTENT PLANNING CALENDAR
              </h2>
              <p className="text-[10px] text-gray-400 mt-0.5">
                Planning calendar view. Auto-publishing disabled by default safety setting.
              </p>
            </div>
          </div>

          <div className="bg-[#161B22] p-4 rounded-xl border border-white/10">
            {calendarEvents.length === 0 ? (
              <div className="text-center py-10 text-gray-500 text-xs">
                No scheduled content items on planning calendar yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {calendarEvents.map(ev => (
                  <div key={ev.id} className="bg-[#0B0E14] p-3.5 rounded-xl border border-white/5 space-y-1.5">
                    <div className="flex justify-between items-center text-[10px]">
                      <span className="font-bold text-[#00D4FF]">
                        {new Date(ev.date).toLocaleDateString('en-IN')}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-white/10 text-gray-300 font-bold">
                        {ev.status}
                      </span>
                    </div>
                    <strong className="text-white text-xs block truncate">{ev.contentTitle}</strong>
                    <div className="text-[10px] text-gray-400 flex justify-between">
                      <span>Platform: {ev.platform}</span>
                      <span>Type: {ev.contentType}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB 8: AI SOCIAL STRATEGY & SAFETY GATES ──────────────────── */}
      {activeTab === 'STRATEGY' && (
        <div className="space-y-4 font-mono max-w-3xl mx-auto">
          {/* Phase 2: Global Auto Publish Safety Gate Toggle */}
          <div className="bg-[#161B22] p-4 rounded-xl border border-amber-500/30 flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-amber-400" />
                <h3 className="font-extrabold text-xs text-white uppercase">GLOBAL AUTO-PUBLISHING SAFETY GATE</h3>
              </div>
              <p className="text-[10px] text-gray-400">
                When DISABLED (default), no content will be published automatically. Admin approval is required for all posts.
              </p>
            </div>
            <button
              onClick={() => handleToggleAutoPublish(!editStrategy.autoPublishEnabled)}
              className={`px-4 py-2 rounded-lg font-black text-xs transition-all border ${
                editStrategy.autoPublishEnabled
                  ? 'bg-[#00FF41]/20 text-[#00FF41] border-[#00FF41]/40 hover:bg-[#00FF41]/30'
                  : 'bg-red-500/20 text-red-400 border-red-500/40 hover:bg-red-500/30'
              }`}
            >
              {editStrategy.autoPublishEnabled ? 'AUTO-PUBLISH: ENABLED (TRUE)' : 'AUTO-PUBLISH: DISABLED (FALSE)'}
            </button>
          </div>

          <div className="bg-[#161B22] p-5 rounded-xl border border-[#D4AF37]/30 space-y-4 shadow-[0_0_20px_rgba(212,175,55,0.05)]">
            <div className="flex justify-between items-center border-b border-white/10 pb-3">
              <h2 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2 text-[#D4AF37]">
                <Award className="w-4 h-4 text-[#D4AF37]" /> AI SOCIAL MEDIA STRATEGY CONFIGURATION
              </h2>
              <button
                onClick={handleSaveStrategy}
                className="px-4 py-2 bg-[#D4AF37] hover:bg-[#D4AF37]/90 text-black font-extrabold rounded-lg text-xs transition-all flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" /> SAVE STRATEGY
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-gray-400 font-bold mb-1">PRIMARY OBJECTIVE</label>
                <input
                  type="text"
                  value={editStrategy.primaryObjective}
                  onChange={e => setEditStrategy({ ...editStrategy, primaryObjective: e.target.value })}
                  className="w-full bg-[#0B0E14] border border-white/10 px-3 py-2 rounded text-white font-bold outline-none focus:border-[#D4AF37]"
                />
              </div>

              <div>
                <label className="block text-gray-400 font-bold mb-1">TARGET AUDIENCE</label>
                <input
                  type="text"
                  value={editStrategy.targetAudience}
                  onChange={e => setEditStrategy({ ...editStrategy, targetAudience: e.target.value })}
                  className="w-full bg-[#0B0E14] border border-white/10 px-3 py-2 rounded text-white font-bold outline-none"
                />
              </div>

              <div>
                <label className="block text-gray-400 font-bold mb-1">HELLO TRADER CONTENT PILLARS (CONFIGURABLE)</label>
                <textarea
                  value={editStrategy.contentPillars}
                  onChange={e => setEditStrategy({ ...editStrategy, contentPillars: e.target.value })}
                  className="w-full bg-[#0B0E14] border border-white/10 px-3 py-2 rounded text-white text-xs outline-none font-bold"
                  rows={2}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-400 font-bold mb-1">PREFERRED FORMATS</label>
                  <input
                    type="text"
                    value={editStrategy.preferredFormats}
                    onChange={e => setEditStrategy({ ...editStrategy, preferredFormats: e.target.value })}
                    className="w-full bg-[#0B0E14] border border-white/10 px-3 py-2 rounded text-white font-bold outline-none"
                  />
                </div>
                <div>
                  <label className="block text-gray-400 font-bold mb-1">POSTING FREQUENCY</label>
                  <input
                    type="text"
                    value={editStrategy.postingFrequency}
                    onChange={e => setEditStrategy({ ...editStrategy, postingFrequency: e.target.value })}
                    className="w-full bg-[#0B0E14] border border-white/10 px-3 py-2 rounded text-white font-bold outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-gray-400 font-bold mb-1">CTA STRATEGY</label>
                <input
                  type="text"
                  value={editStrategy.ctaStrategy}
                  onChange={e => setEditStrategy({ ...editStrategy, ctaStrategy: e.target.value })}
                  className="w-full bg-[#0B0E14] border border-white/10 px-3 py-2 rounded text-white font-bold outline-none"
                />
              </div>

              <div>
                <label className="block text-gray-400 font-bold mb-1">TOPICS TO AVOID (COMPLIANCE)</label>
                <input
                  type="text"
                  value={editStrategy.topicsToAvoid}
                  onChange={e => setEditStrategy({ ...editStrategy, topicsToAvoid: e.target.value })}
                  className="w-full bg-[#0B0E14] border border-red-500/30 px-3 py-2 rounded text-red-300 font-bold outline-none"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── PHASE 2 MODAL 1: OAUTH ACCOUNT CONNECT HUB ────────────────── */}
      {showConnectModal && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-[#0B0E14]/85 backdrop-blur-md p-4 font-mono text-xs">
          <div className="bg-[#10131a] border border-[#00D4FF]/40 rounded-2xl w-full max-w-lg p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-white/10 pb-2">
              <h3 className="font-extrabold text-sm text-white flex items-center gap-2">
                <Share2 className="w-4 h-4 text-[#00D4FF]" /> CONNECT SOCIAL MEDIA ACCOUNTS (OFFICIAL OAUTH 2.0)
              </h3>
              <button onClick={() => setShowConnectModal(false)} className="text-gray-400 hover:text-white">✕</button>
            </div>

            <p className="text-[11px] text-gray-400 leading-relaxed">
              Authenticate directly on official Meta and Google authorization pages. Zero passwords are password stored or requested. Access tokens are encrypted at rest using AES-256.
            </p>

            <div className="space-y-3">
              {[
                { platform: 'INSTAGRAM', name: 'Instagram Business', scopes: 'instagram_basic, instagram_manage_insights, instagram_content_publish', icon: '📸', color: 'from-pink-600 to-purple-600' },
                { platform: 'YOUTUBE', name: 'YouTube Channel', scopes: 'youtube.readonly, yt-analytics.readonly, youtube.upload', icon: '▶️', color: 'from-red-600 to-red-700' },
                { platform: 'FACEBOOK', name: 'Facebook Page', scopes: 'pages_show_list, pages_read_engagement, pages_manage_posts', icon: '📘', color: 'from-blue-600 to-indigo-700' }
              ].map(item => {
                const acc = accounts.find(a => a.platform === item.platform);
                const isConnected = acc && acc.status === 'CONNECTED';
                const isError = acc && (acc.status === 'ERROR' || acc.lastSyncStatus === 'FAILED' || acc.lastSyncError);

                return (
                  <div key={item.platform} className="bg-[#161B22] p-3.5 rounded-xl border border-white/10 flex items-center justify-between gap-3">
                    <div>
                      <span className="font-bold text-white text-xs block">{item.icon} {item.name}</span>
                      <span className="text-[9px] text-gray-500 block">Scopes: {item.scopes}</span>
                      {isConnected ? (
                        <span className="text-[9px] text-[#00FF41] font-bold block mt-0.5">
                          ✓ CONNECTED: {acc.accountName} ({acc.followerCount.toLocaleString()} followers)
                        </span>
                      ) : isError ? (
                        <span className="text-[9px] text-red-400 font-bold block mt-0.5">
                          ⚠️ {acc.lastSyncError || 'Instagram account not eligible / permissions required'}
                        </span>
                      ) : (
                        <span className="text-[9px] text-gray-400 font-bold block mt-0.5">
                          Status: NOT CONNECTED
                        </span>
                      )}
                    </div>

                    <button
                      onClick={() => handleConnectAccount(item.platform)}
                      className={`px-3 py-1.5 rounded text-[10px] font-black transition-all bg-gradient-to-r ${item.color} text-white shadow-md active:scale-95`}
                    >
                      {isConnected ? 'RECONNECT' : 'CONNECT OAUTH'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── PHASE 2 MODAL 2: AI SCRIPT PREVIEW & ADMIN APPROVAL MODAL ──── */}
      {showScriptModal && activeScriptIdea && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-[#0B0E14]/85 backdrop-blur-md p-4 font-mono text-xs">
          <div className="bg-[#10131a] border border-purple-500/40 rounded-2xl w-full max-w-xl p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-white/10 pb-2">
              <h3 className="font-extrabold text-sm text-purple-300 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-purple-400" /> AI SCRIPT PREVIEW & APPROVAL GATEWAY
              </h3>
              <button onClick={() => setShowScriptModal(false)} className="text-gray-400 hover:text-white">✕</button>
            </div>

            <div className="space-y-1">
              <span className="text-gray-400 text-[10px] uppercase font-bold block">Idea Title:</span>
              <strong className="text-white text-sm block">{activeScriptIdea.title}</strong>
              <span className="text-purple-300 text-[10px]">Topic: {activeScriptIdea.topic} / Format: {activeScriptIdea.contentType}</span>
            </div>

            {/* Generated Script Body */}
            <div className="bg-[#0B0E14] p-4 rounded-xl border border-white/10 space-y-2 whitespace-pre-wrap text-[11px] text-gray-200 font-mono leading-relaxed max-h-60 overflow-y-auto">
              {activeScriptIdea.aiScript}
            </div>

            {/* Compliance Warning Section */}
            {activeScriptIdea.complianceWarnings && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-[10px] text-amber-300">
                <strong>Safety Warning Snapshot:</strong> {activeScriptIdea.complianceWarnings}
              </div>
            )}

            <div className="flex gap-2 pt-2 border-t border-white/10">
              <button
                onClick={() => setShowScriptModal(false)}
                className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 text-gray-300 font-bold rounded-lg text-xs"
              >
                CLOSE PREVIEW
              </button>
              <button
                onClick={() => handleApproveIdea(activeScriptIdea.id)}
                disabled={approvingIdea}
                className="flex-1 py-2.5 bg-[#00FF41] hover:bg-[#00FF41]/90 text-black font-extrabold rounded-lg text-xs transition-all shadow-[0_0_15px_rgba(0,255,65,0.3)] disabled:opacity-50"
              >
                {approvingIdea ? 'APPROVING...' : 'APPROVE SCRIPT FOR PUBLISHING'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
