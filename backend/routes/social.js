const express = require('express');
const router = express.Router();
const { PrismaClient } = require('../node_modules/@prisma/client');
const prisma = new PrismaClient();

const socialAiService = require('../services/socialAiService');
const socialOAuthService = require('../services/socialOAuthService');
const socialSyncWorker = require('../services/socialSyncWorker');
const socialPublishWorker = require('../services/socialPublishWorker');

// ── GET /api/social/dashboard ────────────────────────────────────────────────
// Returns Overview Cards: Total Posts, Total Views, Average Views, Total Likes,
// Total Comments, Total Shares, Total Saves, Followers Gained, Engagement Rate,
// Best Performing Post, Worst Performing Post with time filters (today, 7d, 30d, all).
router.get('/dashboard', async (req, res) => {
  try {
    const range = req.query.range || 'all'; // 'today' | '7d' | '30d' | 'all'
    const platform = req.query.platform || 'ALL'; // 'INSTAGRAM' | 'YOUTUBE' | 'FACEBOOK' | 'ALL'

    let startDate = null;
    const now = new Date();
    if (range === 'today') {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (range === '7d') {
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (range === '30d') {
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    const whereClause = {};
    if (startDate) {
      whereClause.publishedAt = { gte: startDate };
    }
    if (platform !== 'ALL') {
      whereClause.platform = platform;
    }

    const posts = await prisma.socialPost.findMany({
      where: whereClause,
      include: {
        metrics: {
          orderBy: { recordedAt: 'desc' },
          take: 1
        }
      },
      orderBy: { publishedAt: 'desc' }
    });

    let totalPosts = posts.length;
    let totalViews = 0;
    let totalLikes = 0;
    let totalComments = 0;
    let totalShares = 0;
    let totalSaves = 0;
    let totalFollowers = 0;
    let bestPost = null;
    let worstPost = null;

    posts.forEach(p => {
      const m = p.metrics[0];
      if (m) {
        totalViews += m.views || 0;
        totalLikes += m.likes || 0;
        totalComments += m.comments || 0;
        totalShares += m.shares || 0;
        totalSaves += m.saves || 0;
        totalFollowers += m.followersGained || 0;

        const currentScore = m.score || 0;
        if (!bestPost || currentScore > (bestPost.metrics[0]?.score || 0)) {
          bestPost = p;
        }
        if (!worstPost || currentScore < (worstPost.metrics[0]?.score || 0)) {
          worstPost = p;
        }
      }
    });

    const averageViews = totalPosts > 0 ? Math.round(totalViews / totalPosts) : 0;
    const totalEngagements = totalLikes + (totalComments * 2) + (totalShares * 3) + (totalSaves * 2);
    const engagementRate = totalViews > 0 ? parseFloat(((totalEngagements / totalViews) * 100).toFixed(2)) : 0;

    res.json({
      success: true,
      dataMode: 'Demo / Manual Data',
      range,
      platform,
      overview: {
        totalPosts,
        totalViews,
        averageViews,
        totalLikes,
        totalComments,
        totalShares,
        totalSaves,
        followersGained: totalFollowers,
        engagementRate,
        bestPost: bestPost ? {
          id: bestPost.id,
          title: bestPost.title,
          platform: bestPost.platform,
          views: bestPost.metrics[0]?.views || 0,
          score: bestPost.metrics[0]?.score || 0
        } : null,
        worstPost: worstPost ? {
          id: worstPost.id,
          title: worstPost.title,
          platform: worstPost.platform,
          views: worstPost.metrics[0]?.views || 0,
          score: worstPost.metrics[0]?.score || 0
        } : null
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/social/posts ───────────────────────────────────────────────────
// Returns Content Performance Table list with sorting and multi-field filtering
router.get('/posts', async (req, res) => {
  try {
    const { platform, contentType, topic, performance, search } = req.query;

    const whereClause = {};
    if (platform && platform !== 'ALL') whereClause.platform = platform;
    if (contentType && contentType !== 'ALL') whereClause.contentType = contentType;
    if (topic && topic !== 'ALL') whereClause.topic = topic;

    const posts = await prisma.socialPost.findMany({
      where: whereClause,
      include: {
        metrics: {
          orderBy: { recordedAt: 'desc' },
          take: 1
        }
      },
      orderBy: { publishedAt: 'desc' }
    });

    let formatted = posts.map(p => {
      const m = p.metrics[0] || {};
      const calculated = socialAiService.calculatePostMetrics(p, m);
      return {
        id: p.id,
        publishedAt: p.publishedAt,
        platform: p.platform,
        title: p.title,
        contentType: p.contentType,
        topic: p.topic || 'General',
        hook: p.hook || 'Default opening',
        hookStrength: calculated.hookStrength,
        ctaText: p.ctaText || 'Link in bio',
        durationSec: p.durationSec || 30,
        postingHour: p.postingHour || 14,
        postingDay: p.postingDay || 'Monday',
        views: m.views || 0,
        reach: m.reach || 0,
        likes: m.likes || 0,
        comments: m.comments || 0,
        shares: m.shares || 0,
        saves: m.saves || 0,
        followersGained: m.followersGained || 0,
        engagementRate: calculated.engagementRate,
        score: calculated.score,
        isDemoData: p.isDemoData
      };
    });

    if (performance && performance !== 'ALL') {
      if (performance === 'HIGH') formatted = formatted.filter(p => p.score >= 75);
      else if (performance === 'MEDIUM') formatted = formatted.filter(p => p.score >= 40 && p.score < 75);
      else if (performance === 'LOW') formatted = formatted.filter(p => p.score < 40);
    }

    if (search) {
      const q = search.toLowerCase();
      formatted = formatted.filter(p => p.title.toLowerCase().includes(q) || p.topic.toLowerCase().includes(q));
    }

    res.json({
      success: true,
      count: formatted.length,
      dataMode: 'Demo / Manual Data',
      posts: formatted
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/social/posts ──────────────────────────────────────────────────
// Manual entry / API ingestion of new post and metrics data
router.post('/posts', async (req, res) => {
  try {
    const {
      platform, contentType, title, caption, postUrl, durationSec,
      publishedAt, topic, hook, hookStrength, ctaText, postingHour, postingDay,
      views, reach, likes, comments, shares, saves, followersGained
    } = req.body;

    if (!title || !platform) {
      return res.status(400).json({ success: false, error: 'Title and Platform are required.' });
    }

    const post = await prisma.socialPost.create({
      data: {
        platform: platform || 'INSTAGRAM',
        contentType: contentType || 'Reel',
        title,
        caption: caption || null,
        postUrl: postUrl || null,
        durationSec: durationSec ? parseInt(durationSec) : 30,
        publishedAt: publishedAt ? new Date(publishedAt) : new Date(),
        topic: topic || 'Trading Education',
        hook: hook || null,
        hookStrength: hookStrength || 'Average',
        ctaText: ctaText || null,
        postingHour: postingHour !== undefined ? parseInt(postingHour) : 14,
        postingDay: postingDay || 'Monday',
        isDemoData: true
      }
    });

    const mViews = views ? parseInt(views) : 0;
    const mLikes = likes ? parseInt(likes) : 0;
    const mComments = comments ? parseInt(comments) : 0;
    const mShares = shares ? parseInt(shares) : 0;
    const mSaves = saves ? parseInt(saves) : 0;
    const mFollowers = followersGained ? parseInt(followersGained) : 0;
    const mReach = reach ? parseInt(reach) : Math.round(mViews * 1.3);

    const calculated = socialAiService.calculatePostMetrics(post, {
      views: mViews, likes: mLikes, comments: mComments, shares: mShares, saves: mSaves, followersGained: mFollowers
    });

    await prisma.socialPostMetric.create({
      data: {
        postId: post.id,
        views: mViews,
        reach: mReach,
        likes: mLikes,
        comments: mComments,
        shares: mShares,
        saves: mSaves,
        followersGained: mFollowers,
        engagementRate: calculated.engagementRate,
        score: calculated.score
      }
    });

    res.json({ success: true, message: 'Post metrics recorded successfully.', post });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/social/metrics ─────────────────────────────────────────────────
// Platform Breakdown (Instagram, YouTube, Facebook, All Platforms)
router.get('/metrics', async (req, res) => {
  try {
    const platforms = ['ALL', 'INSTAGRAM', 'YOUTUBE', 'FACEBOOK'];
    const result = {};

    for (const p of platforms) {
      const whereClause = p === 'ALL' ? {} : { platform: p };
      const posts = await prisma.socialPost.findMany({
        where: whereClause,
        include: {
          metrics: { orderBy: { recordedAt: 'desc' }, take: 1 }
        }
      });

      let totalPosts = posts.length;
      let views = 0, reach = 0, likes = 0, comments = 0, shares = 0, saves = 0, followers = 0;
      let bestPost = null;

      posts.forEach(post => {
        const m = post.metrics[0];
        if (m) {
          views += m.views || 0;
          reach += m.reach || 0;
          likes += m.likes || 0;
          comments += m.comments || 0;
          shares += m.shares || 0;
          saves += m.saves || 0;
          followers += m.followersGained || 0;

          if (!bestPost || (m.score || 0) > (bestPost.metrics[0]?.score || 0)) {
            bestPost = post;
          }
        }
      });

      const avgViews = totalPosts > 0 ? Math.round(views / totalPosts) : 0;
      const engTotal = likes + (comments * 2) + (shares * 3) + (saves * 2);
      const engagementRate = views > 0 ? parseFloat(((engTotal / views) * 100).toFixed(2)) : 0;

      result[p] = {
        posts: totalPosts,
        views,
        reach,
        likes,
        comments,
        shares,
        saves,
        followersGained: followers,
        engagementRate,
        averageViews: avgViews,
        bestPost: bestPost ? bestPost.title : 'N/A'
      };
    }

    res.json({ success: true, dataMode: 'Demo / Manual Data', platforms: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/social/insights ────────────────────────────────────────────────
// Content Intelligence (Hook, Topic, Format, Length, CTA, Posting Time, Winning/Weak patterns)
router.get('/insights', async (req, res) => {
  try {
    const posts = await prisma.socialPost.findMany({
      include: {
        metrics: { orderBy: { recordedAt: 'desc' }, take: 1 }
      }
    });

    const intelligence = socialAiService.analyzePerformance(posts);

    res.json({
      success: true,
      dataMode: 'Demo / Manual Data',
      intelligence
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/social/recommendations ─────────────────────────────────────────
// AI Recommendations engine
router.get('/recommendations', async (req, res) => {
  try {
    const posts = await prisma.socialPost.findMany({
      include: { metrics: { orderBy: { recordedAt: 'desc' }, take: 1 } }
    });

    let strategy = await prisma.socialStrategy.findUnique({ where: { id: 'GLOBAL' } });

    const recommendations = socialAiService.generateRecommendations(posts, strategy);

    res.json({
      success: true,
      dataMode: 'Demo / Manual Data',
      count: recommendations.length,
      recommendations
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/social/next-posts ──────────────────────────────────────────────
// "What Should I Post Next?" - 5 Post recommendations derived from historical winning patterns
router.get('/next-posts', async (req, res) => {
  try {
    const posts = await prisma.socialPost.findMany({
      include: { metrics: { orderBy: { recordedAt: 'desc' }, take: 1 } }
    });

    const strategy = await prisma.socialStrategy.findUnique({ where: { id: 'GLOBAL' } });

    const nextPosts = socialAiService.generateNextPostRecommendations(posts, strategy);

    res.json({
      success: true,
      dataMode: 'Demo / Manual Data',
      count: nextPosts.length,
      nextPosts
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── CONTENT IDEAS CRUD API ──────────────────────────────────────────────────
router.get('/content-ideas', async (req, res) => {
  try {
    const ideas = await prisma.contentIdea.findMany({
      orderBy: { createdAt: 'desc' }
    });
    res.json({ success: true, count: ideas.length, ideas });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/content-ideas', async (req, res) => {
  try {
    const { title, topic, hook, platform, contentType, targetAudience, cta, status, priority, notes } = req.body;

    if (!title || !topic) {
      return res.status(400).json({ success: false, error: 'Title and Topic are required.' });
    }

    // Safety & Compliance Check
    const compliance = socialAiService.checkContentSafety(`${title} ${hook || ''} ${cta || ''}`);

    const idea = await prisma.contentIdea.create({
      data: {
        title,
        topic,
        hook: hook || null,
        platform: platform || 'ALL',
        contentType: contentType || 'Reel',
        targetAudience: targetAudience || null,
        cta: cta || null,
        status: status || 'Idea',
        priority: priority || 'MEDIUM',
        notes: notes || null,
        aiScore: compliance.isSafe ? 80 : 50
      }
    });

    res.json({
      success: true,
      message: 'Content idea created successfully.',
      complianceWarnings: compliance.warnings,
      idea
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/content-ideas/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const data = { ...req.body };
    delete data.id;

    if (data.status === 'Ready' || data.title || data.hook || data.cta) {
      const checkText = `${data.title || ''} ${data.hook || ''} ${data.cta || ''}`;
      const compliance = socialAiService.checkContentSafety(checkText);
      if (!compliance.isSafe) {
        data.notes = `${data.notes || ''} [COMPLIANCE WARNING: ${compliance.warnings.join(' ')}]`;
      }
    }

    const updated = await prisma.contentIdea.update({
      where: { id },
      data
    });

    res.json({ success: true, idea: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/content-ideas/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.contentIdea.delete({ where: { id } });
    res.json({ success: true, message: 'Content idea deleted successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── VIRAL CONTENT LAB VARIANTS API ─────────────────────────────────────────
router.get('/variants', async (req, res) => {
  try {
    const variants = await prisma.contentVariant.findMany({
      orderBy: { createdAt: 'desc' }
    });
    res.json({ success: true, count: variants.length, variants });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/variants', async (req, res) => {
  try {
    const { ideaTitle, variantLabel, hookText, views, retentionRate, engagementRate, shares, followersGained } = req.body;

    if (!ideaTitle || !variantLabel || !hookText) {
      return res.status(400).json({ success: false, error: 'Idea Title, Variant Label, and Hook Text are required.' });
    }

    const mViews = views ? parseInt(views) : 0;
    const mEngagement = engagementRate ? parseFloat(engagementRate) : 0;
    const mShares = shares ? parseInt(shares) : 0;

    let status = 'NEEDS TESTING';
    if (mViews > 5000 && mEngagement > 6.0) status = 'WINNER';
    else if (mViews > 1000 && mEngagement < 2.0) status = 'UNDERPERFORMING';

    const variant = await prisma.contentVariant.create({
      data: {
        ideaTitle,
        variantLabel: variantLabel || 'Variant A',
        hookText,
        views: mViews,
        retentionRate: retentionRate ? parseFloat(retentionRate) : 0,
        engagementRate: mEngagement,
        shares: mShares,
        followersGained: followersGained ? parseInt(followersGained) : 0,
        status
      }
    });

    res.json({ success: true, variant });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── CONTENT CALENDAR API ────────────────────────────────────────────────────
router.get('/calendar', async (req, res) => {
  try {
    const events = await prisma.contentCalendar.findMany({
      orderBy: { date: 'asc' }
    });
    res.json({ success: true, events });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/calendar', async (req, res) => {
  try {
    const { date, platform, contentTitle, contentType, status, priority, notes } = req.body;

    if (!date || !contentTitle) {
      return res.status(400).json({ success: false, error: 'Date and Content Title are required.' });
    }

    const event = await prisma.contentCalendar.create({
      data: {
        date: new Date(date),
        platform: platform || 'ALL',
        contentTitle,
        contentType: contentType || 'Reel',
        status: status || 'Draft',
        priority: priority || 'MEDIUM',
        notes: notes || null
      }
    });

    res.json({ success: true, event });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/calendar/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const data = { ...req.body };
    delete data.id;
    if (data.date) data.date = new Date(data.date);

    const updated = await prisma.contentCalendar.update({
      where: { id },
      data
    });

    res.json({ success: true, event: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/calendar/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.contentCalendar.delete({ where: { id } });
    res.json({ success: true, message: 'Calendar event deleted.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── SOCIAL STRATEGY API ─────────────────────────────────────────────────────
router.get('/strategy', async (req, res) => {
  try {
    let strategy = await prisma.socialStrategy.findUnique({ where: { id: 'GLOBAL' } });
    if (!strategy) {
      strategy = await prisma.socialStrategy.create({ data: { id: 'GLOBAL' } });
    }
    res.json({ success: true, strategy });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/strategy', async (req, res) => {
  try {
    const data = { ...req.body };
    delete data.id;

    const updated = await prisma.socialStrategy.upsert({
      where: { id: 'GLOBAL' },
      update: data,
      create: { id: 'GLOBAL', ...data }
    });

    res.json({ success: true, message: 'Strategy updated successfully.', strategy: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/social/demo-data ──────────────────────────────────────────────
// Seeds realistic test data clearly labeled "Demo / Manual Data" for testing Phase 1
router.post('/demo-data', async (req, res) => {
  try {
    // 1. Ensure Social Accounts exist
    let igAcc = await prisma.socialAccount.findFirst({ where: { platform: 'INSTAGRAM' } });
    if (!igAcc) {
      igAcc = await prisma.socialAccount.create({
        data: {
          platform: 'INSTAGRAM',
          accountName: 'Hello Trader Institute',
          accountHandle: '@hellotraderpro',
          followerCount: 14200,
          postCount: 42,
          status: 'DEMO'
        }
      });
    }

    let ytAcc = await prisma.socialAccount.findFirst({ where: { platform: 'YOUTUBE' } });
    if (!ytAcc) {
      ytAcc = await prisma.socialAccount.create({
        data: {
          platform: 'YOUTUBE',
          accountName: 'Hello Trader Official',
          accountHandle: '@HelloTraderInstitute',
          followerCount: 28500,
          postCount: 65,
          status: 'DEMO'
        }
      });
    }

    // 2. Demo Posts Batch
    const demoPosts = [
      {
        platform: 'INSTAGRAM',
        contentType: 'Reel',
        title: 'Institutional FII Net Buying Data Decoded',
        topic: 'Terminal / Technology',
        hook: 'How smart money trades before news breaks...',
        hookStrength: 'Strong',
        durationSec: 42,
        views: 18500,
        likes: 1420,
        comments: 185,
        shares: 410,
        saves: 890,
        followersGained: 125,
        postingHour: 18,
        postingDay: 'Wednesday'
      },
      {
        platform: 'INSTAGRAM',
        contentType: 'Reel',
        title: '3 Position Sizing Rules to Prevent Blowups',
        topic: 'Trading Education',
        hook: '95% of new traders make this risk calculation error...',
        hookStrength: 'Strong',
        durationSec: 35,
        views: 24300,
        likes: 2150,
        comments: 240,
        shares: 680,
        saves: 1450,
        followersGained: 210,
        postingHour: 19,
        postingDay: 'Friday'
      },
      {
        platform: 'YOUTUBE',
        contentType: 'Short',
        title: 'Why Placing Stop-Loss on Round Numbers Fails',
        topic: 'Trading Mistakes',
        hook: 'Market makers hunt stop losses here...',
        hookStrength: 'Strong',
        durationSec: 55,
        views: 31200,
        likes: 2900,
        comments: 310,
        shares: 820,
        saves: 1900,
        followersGained: 340,
        postingHour: 20,
        postingDay: 'Monday'
      },
      {
        platform: 'INSTAGRAM',
        contentType: 'Carousel',
        title: 'Daily Trader Routine Before 09:15 AM IST',
        topic: 'Trader Psychology',
        hook: 'What profitable traders do at 08:30 AM...',
        hookStrength: 'Average',
        durationSec: 0,
        views: 9400,
        likes: 620,
        comments: 45,
        shares: 110,
        saves: 480,
        followersGained: 45,
        postingHour: 8,
        postingDay: 'Tuesday'
      },
      {
        platform: 'FACEBOOK',
        contentType: 'Video',
        title: 'Generic Motivational Quotes for Traders',
        topic: 'Behind The Scenes',
        hook: 'Success takes time...',
        hookStrength: 'Weak',
        durationSec: 90,
        views: 1800,
        likes: 45,
        comments: 6,
        shares: 2,
        saves: 10,
        followersGained: 3,
        postingHour: 14,
        postingDay: 'Thursday'
      }
    ];

    for (const dp of demoPosts) {
      const post = await prisma.socialPost.create({
        data: {
          accountId: dp.platform === 'YOUTUBE' ? ytAcc.id : igAcc.id,
          platform: dp.platform,
          contentType: dp.contentType,
          title: dp.title,
          topic: dp.topic,
          hook: dp.hook,
          hookStrength: dp.hookStrength,
          durationSec: dp.durationSec,
          postingHour: dp.postingHour,
          postingDay: dp.postingDay,
          isDemoData: true
        }
      });

      const calculated = socialAiService.calculatePostMetrics(post, {
        views: dp.views,
        likes: dp.likes,
        comments: dp.comments,
        shares: dp.shares,
        saves: dp.saves,
        followersGained: dp.followersGained
      });

      await prisma.socialPostMetric.create({
        data: {
          postId: post.id,
          views: dp.views,
          reach: Math.round(dp.views * 1.35),
          likes: dp.likes,
          comments: dp.comments,
          shares: dp.shares,
          saves: dp.saves,
          followersGained: dp.followersGained,
          engagementRate: calculated.engagementRate,
          score: calculated.score
        }
      });
    }

    // 3. Demo Viral Variants
    await prisma.contentVariant.createMany({
      data: [
        {
          ideaTitle: 'Why most traders lose money',
          variantLabel: 'Variant A',
          hookText: '95% of retail traders make this mistake...',
          views: 18500,
          retentionRate: 68.5,
          engagementRate: 8.4,
          shares: 420,
          followersGained: 140,
          status: 'WINNER'
        },
        {
          ideaTitle: 'Why most traders lose money',
          variantLabel: 'Variant B',
          hookText: 'If you are doing this while trading, stop...',
          views: 6200,
          retentionRate: 42.0,
          engagementRate: 3.8,
          shares: 85,
          followersGained: 25,
          status: 'NEEDS TESTING'
        },
        {
          ideaTitle: 'Why most traders lose money',
          variantLabel: 'Variant C',
          hookText: 'Nobody tells new traders this...',
          views: 1200,
          retentionRate: 22.0,
          engagementRate: 1.5,
          shares: 12,
          followersGained: 4,
          status: 'UNDERPERFORMING'
        }
      ]
    });

    res.json({
      success: true,
      message: 'Demo test data initialized successfully labeled clearly as "Demo / Manual Data".',
      postsAdded: demoPosts.length
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── PHASE 2 OAUTH & ACCOUNT MANAGEMENT API ────────────────────────────────
router.get('/accounts', async (req, res) => {
  try {
    const accounts = await prisma.socialAccount.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        platform: true,
        accountName: true,
        accountHandle: true,
        avatarUrl: true,
        status: true,
        followerCount: true,
        postCount: true,
        tokenExpiresAt: true,
        scopes: true,
        lastSyncedAt: true,
        lastSyncStatus: true,
        lastSyncError: true,
        createdAt: true
      }
    });
    res.json({ success: true, count: accounts.length, accounts });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Initiates official OAuth flow for target platform (INSTAGRAM, YOUTUBE, FACEBOOK)
router.get('/auth/:platform', (req, res) => {
  try {
    const { platform } = req.params;
    const authUrl = socialOAuthService.getAuthUrl(platform);
    res.json({ success: true, platform: platform.toUpperCase(), authUrl });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// OAuth Authorization Code Callbacks
router.get('/auth/instagram/callback', async (req, res) => {
  try {
    const { code } = req.query;
    const account = await socialOAuthService.handleInstagramCallback(code || 'DEMO_CODE');
    res.send(`
      <!DOCTYPE html>
      <html>
        <head><title>Instagram Connected</title></head>
        <body style="background:#0B0E14;color:#00FF41;font-family:monospace;padding:40px;text-align:center;">
          <h2>✅ Instagram Account Connected Successfully!</h2>
          <p style="color:#bbc9cf;">Account: <strong>${account.accountName}</strong> (${account.followerCount} Followers)</p>
          <p style="color:#D4AF37;">Redirecting back to Hello Trader Admin Portal...</p>
          <script>
            setTimeout(() => {
              if (window.opener) { window.opener.location.reload(); window.close(); }
              else { window.location.href = 'http://localhost:3000/admin/social-media'; }
            }, 2000);
          </script>
        </body>
      </html>
    `);
  } catch (err) {
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
        <head><title>OAuth Connection Failed</title></head>
        <body style="background:#0B0E14;color:#EF4444;font-family:monospace;padding:40px;text-align:center;">
          <h2>❌ Instagram Connection Failed</h2>
          <p style="color:#fff;">${err.message}</p>
        </body>
      </html>
    `);
  }
});

router.get('/auth/youtube/callback', async (req, res) => {
  try {
    const { code } = req.query;
    const account = await socialOAuthService.handleYouTubeCallback(code || 'DEMO_CODE');
    res.send(`
      <!DOCTYPE html>
      <html>
        <head><title>YouTube Connected</title></head>
        <body style="background:#0B0E14;color:#00FF41;font-family:monospace;padding:40px;text-align:center;">
          <h2>✅ YouTube Channel Connected Successfully!</h2>
          <p style="color:#bbc9cf;">Channel: <strong>${account.accountName}</strong> (${account.followerCount} Subscribers)</p>
          <p style="color:#D4AF37;">Redirecting back to Hello Trader Admin Portal...</p>
          <script>
            setTimeout(() => {
              if (window.opener) { window.opener.location.reload(); window.close(); }
              else { window.location.href = 'http://localhost:3000/admin/social-media'; }
            }, 2000);
          </script>
        </body>
      </html>
    `);
  } catch (err) {
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
        <head><title>OAuth Connection Failed</title></head>
        <body style="background:#0B0E14;color:#EF4444;font-family:monospace;padding:40px;text-align:center;">
          <h2>❌ YouTube Connection Failed</h2>
          <p style="color:#fff;">${err.message}</p>
        </body>
      </html>
    `);
  }
});

router.get('/auth/facebook/callback', async (req, res) => {
  try {
    const { code } = req.query;
    const account = await socialOAuthService.handleFacebookCallback(code || 'DEMO_CODE');
    res.send(`
      <!DOCTYPE html>
      <html>
        <head><title>Facebook Connected</title></head>
        <body style="background:#0B0E14;color:#00FF41;font-family:monospace;padding:40px;text-align:center;">
          <h2>✅ Facebook Page Connected Successfully!</h2>
          <p style="color:#bbc9cf;">Page: <strong>${account.accountName}</strong></p>
          <p style="color:#D4AF37;">Redirecting back to Hello Trader Admin Portal...</p>
          <script>
            setTimeout(() => {
              if (window.opener) { window.opener.location.reload(); window.close(); }
              else { window.location.href = 'http://localhost:3000/admin/social-media'; }
            }, 2000);
          </script>
        </body>
      </html>
    `);
  } catch (err) {
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
        <head><title>OAuth Connection Failed</title></head>
        <body style="background:#0B0E14;color:#EF4444;font-family:monospace;padding:40px;text-align:center;">
          <h2>❌ Facebook Connection Failed</h2>
          <p style="color:#fff;">${err.message}</p>
        </body>
      </html>
    `);
  }
});

// Disconnect & Revoke Account Credentials
router.post('/accounts/disconnect/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const disconnected = await socialOAuthService.disconnectAccount(id);
    res.json({ success: true, message: 'Account disconnected successfully.', account: disconnected });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── PHASE 2 REAL-TIME METRICS SYNC API ──────────────────────────────────────
router.post('/sync', async (req, res) => {
  try {
    const results = await socialSyncWorker.syncAllAccounts();
    res.json({ success: true, message: 'Real-time social media metrics sync completed.', results });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── PHASE 2 SCRIPT GENERATOR & APPROVAL WORKFLOW API ────────────────────────
router.post('/generate-script/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const idea = await prisma.contentIdea.findUnique({ where: { id } });
    if (!idea) {
      return res.status(404).json({ success: false, error: 'Content Idea not found.' });
    }

    const { script, safety } = socialAiService.generatePostScript(idea);

    const updated = await prisma.contentIdea.update({
      where: { id },
      data: {
        aiScript: script,
        complianceWarnings: safety.warnings.join(' | ') || null,
        status: safety.isSafe ? 'Awaiting Approval' : 'Draft',
        notes: `${idea.notes || ''} [Script Generated by AI]`
      }
    });

    res.json({
      success: true,
      message: safety.isSafe ? 'Script generated and submitted for Admin Approval.' : 'Script generated with compliance warnings. Status reset to Draft.',
      idea: updated,
      safety
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Explicit Admin Approval Handler
router.post('/approve-idea/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const idea = await prisma.contentIdea.findUnique({ where: { id } });
    if (!idea) {
      return res.status(404).json({ success: false, error: 'Content Idea not found.' });
    }

    // Safety Compliance Gate Check before granting approval
    const checkText = `${idea.title} ${idea.hook || ''} ${idea.aiScript || ''}`;
    const safety = socialAiService.checkContentSafety(checkText);

    if (!safety.isSafe) {
      return res.status(400).json({
        success: false,
        error: 'Approval DENIED by Safety Filter: Content contains forbidden financial/viral guarantee claims.',
        warnings: safety.warnings
      });
    }

    const updated = await prisma.contentIdea.update({
      where: { id },
      data: {
        status: 'Approved',
        approvedAt: new Date(),
        approvedBy: req.user?.email || 'Superadmin'
      }
    });

    res.json({ success: true, message: 'Content Idea APPROVED for scheduling & publishing.', idea: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── PHASE 2 PUBLISHING WORKER & GLOBAL SAFETY GATE API ──────────────────────
router.put('/strategy/toggle-autopublish', async (req, res) => {
  try {
    const { enabled } = req.body;
    const strategy = await prisma.socialStrategy.upsert({
      where: { id: 'GLOBAL' },
      update: { autoPublishEnabled: !!enabled },
      create: { id: 'GLOBAL', autoPublishEnabled: !!enabled }
    });

    res.json({
      success: true,
      message: `Global AUTO_PUBLISH_ENABLED setting is now ${strategy.autoPublishEnabled ? 'ENABLED (True)' : 'DISABLED (False)'}.`,
      autoPublishEnabled: strategy.autoPublishEnabled
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/publish-now/:calendarId', async (req, res) => {
  try {
    const { calendarId } = req.params;
    const result = await socialPublishWorker.publishScheduledItem(calendarId, true);
    res.json({ success: result.status === 'SUCCESS' || result.status === 'SIMULATED', result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/cancel-publish/:calendarId', async (req, res) => {
  try {
    const { calendarId } = req.params;
    const cancelled = await socialPublishWorker.cancelScheduledPublish(calendarId);
    res.json({ success: true, message: 'Publishing job cancelled.', entry: cancelled });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
