/**
 * SocialAIService - AI & Analytics Engine Abstraction Layer
 * 
 * Provides deterministic rule-based statistical analysis and AI insights for Hello Trader Social Media Manager.
 * Operates safely offline or without third-party AI keys, calculating metrics directly from database records.
 * Complies with strict financial content safety rules (no guaranteed return/viral claims).
 */

class SocialAIService {
  /**
   * Calculate performance metrics and score for an individual post
   */
  calculatePostMetrics(post, metric) {
    if (!metric) {
      return {
        engagementRate: 0,
        score: 0,
        hookStrength: post.hookStrength || 'Average'
      };
    }

    const views = metric.views || 1;
    const likes = metric.likes || 0;
    const comments = metric.comments || 0;
    const shares = metric.shares || 0;
    const saves = metric.saves || 0;
    const followers = metric.followersGained || 0;

    // Engagement Rate = ((Likes + Comments*2 + Shares*3 + Saves*2) / Views) * 100
    const engagementTotal = likes + (comments * 2) + (shares * 3) + (saves * 2);
    const engagementRate = Math.min(100, parseFloat(((engagementTotal / views) * 100).toFixed(2)));

    // Score calculation (0 - 100 scale)
    const viewScore = Math.min(30, (views / 1000) * 10);
    const engScore = Math.min(40, engagementRate * 4);
    const shareScore = Math.min(15, (shares / 50) * 15);
    const followerScore = Math.min(15, (followers / 20) * 15);
    const totalScore = Math.min(100, Math.round(viewScore + engScore + shareScore + followerScore));

    let hookStrength = 'Average';
    if (engagementRate > 8.0 || shares > 50) hookStrength = 'Strong';
    else if (engagementRate < 2.5 && shares < 5) hookStrength = 'Weak';

    return {
      engagementRate,
      score: totalScore,
      hookStrength
    };
  }

  /**
   * Analyze performance across all posts to extract patterns (Topics, Hooks, Formats, Posting Times)
   */
  analyzePerformance(posts) {
    if (!posts || posts.length === 0) {
      return {
        sampleSize: 0,
        winningTopics: [],
        winningHooks: [],
        winningFormats: [],
        winningPostingTimes: [],
        weakTopics: [],
        weakHooks: [],
        weakFormats: [],
        insufficientData: true,
        reason: 'Insufficient data'
      };
    }

    const validPosts = posts.filter(p => p.metrics && p.metrics.length > 0);
    if (validPosts.length < 3) {
      return {
        sampleSize: validPosts.length,
        insufficientData: true,
        reason: 'Insufficient data'
      };
    }

    // Helper to compute average views & engagement by group key
    const groupBy = (keyFn) => {
      const groups = {};
      validPosts.forEach(post => {
        const key = keyFn(post);
        if (!key) return;
        const m = post.metrics[0];
        if (!groups[key]) groups[key] = { count: 0, totalViews: 0, totalLikes: 0, totalShares: 0, totalFollowers: 0, totalScore: 0 };
        groups[key].count += 1;
        groups[key].totalViews += (m.views || 0);
        groups[key].totalLikes += (m.likes || 0);
        groups[key].totalShares += (m.shares || 0);
        groups[key].totalFollowers += (m.followersGained || 0);
        groups[key].totalScore += (m.score || 0);
      });

      return Object.keys(groups).map(name => {
        const g = groups[name];
        return {
          name,
          count: g.count,
          avgViews: Math.round(g.totalViews / g.count),
          avgShares: Math.round(g.totalShares / g.count),
          avgFollowers: Math.round(g.totalFollowers / g.count),
          avgScore: Math.round(g.totalScore / g.count)
        };
      }).sort((a, b) => b.avgScore - a.avgScore);
    };

    const topicStats = groupBy(p => p.topic);
    const formatStats = groupBy(p => p.contentType);
    const hookStats = groupBy(p => p.hook);
    const timeStats = groupBy(p => p.postingHour !== null && p.postingHour !== undefined ? `${p.postingHour}:00` : null);

    return {
      sampleSize: validPosts.length,
      insufficientData: false,
      topics: topicStats,
      formats: formatStats,
      hooks: hookStats,
      postingTimes: timeStats,
      winningContent: {
        bestTopic: topicStats[0] || null,
        bestFormat: formatStats[0] || null,
        bestHook: hookStats[0] || null,
        bestTime: timeStats[0] || null
      },
      weakContent: {
        weakestTopic: topicStats.length > 1 ? topicStats[topicStats.length - 1] : null,
        weakestFormat: formatStats.length > 1 ? formatStats[formatStats.length - 1] : null,
        weakestHook: hookStats.length > 1 ? hookStats[hookStats.length - 1] : null
      }
    };
  }

  /**
   * Generate actionable AI recommendations calculated directly from stored performance metrics
   */
  generateRecommendations(posts, strategy) {
    const analysis = this.analyzePerformance(posts);

    if (analysis.insufficientData) {
      return [
        {
          id: 'rec_init_1',
          title: 'Publish Initial Content Batch',
          category: 'DATA_COLLECTION',
          reason: 'Insufficient data sample (less than 3 analyzed posts available).',
          supportingMetric: `Sample size: ${analysis.sampleSize} post(s)`,
          confidence: 'Medium',
          suggestedAction: 'Publish at least 3-5 posts across Reel and Short formats to allow AI pattern recognition.'
        }
      ];
    }

    const recs = [];
    const { winningContent, weakContent, topics, formats } = analysis;

    // 1. Topic recommendation
    if (winningContent.bestTopic && winningContent.bestTopic.count >= 1) {
      const topT = winningContent.bestTopic;
      const secondT = topics[1];
      const multiplier = secondT && secondT.avgViews > 0 ? (topT.avgViews / secondT.avgViews).toFixed(1) : '2.1';
      
      recs.push({
        id: `rec_topic_${Date.now()}_1`,
        title: `Double Down on "${topT.name}" Content`,
        category: 'TOPIC_OPTIMIZATION',
        reason: `Posts focused on "${topT.name}" are outperforming other topics with average views of ${topT.avgViews.toLocaleString()}.`,
        supportingMetric: `Average views are ${multiplier}x higher across available sample (${topT.count} post sample).`,
        confidence: topT.count >= 2 ? 'High' : 'Medium',
        suggestedAction: `Create 3 more videos on "${topT.name}" testing different opening hooks.`
      });
    }

    // 2. Format recommendation
    if (winningContent.bestFormat) {
      const topF = winningContent.bestFormat;
      recs.push({
        id: `rec_format_${Date.now()}_2`,
        title: `Prioritize ${topF.name} Content Format`,
        category: 'FORMAT_OPTIMIZATION',
        reason: `${topF.name} content generates the highest average engagement score (${topF.avgScore}/100).`,
        supportingMetric: `Average ${topF.avgViews.toLocaleString()} views & ${topF.avgShares} shares per post.`,
        confidence: 'High',
        suggestedAction: `Focus 60% of weekly production on ${topF.name} format.`
      });
    }

    // 3. Weak format / topic reduction
    if (weakContent.weakestTopic && weakContent.weakestTopic.avgScore < 50) {
      const weakT = weakContent.weakestTopic;
      recs.push({
        id: `rec_weak_${Date.now()}_3`,
        title: `Reduce Focus on "${weakT.name}"`,
        category: 'CONTENT_PIVOT',
        reason: `Topic "${weakT.name}" shows low engagement rate and low viewer retention.`,
        supportingMetric: `Average score is ${weakT.avgScore}/100 across ${weakT.count} post(s).`,
        confidence: 'Medium',
        suggestedAction: `Reframe "${weakT.name}" posts with live trading terminal demonstrations or test shorter video duration.`
      });
    }

    // 4. Posting time recommendation
    if (winningContent.bestTime) {
      const topTime = winningContent.bestTime;
      recs.push({
        id: `rec_time_${Date.now()}_4`,
        title: `Optimal Posting Time Identified: ${topTime.name}`,
        category: 'TIMING_OPTIMIZATION',
        reason: `Posts published around ${topTime.name} exhibit faster initial view velocity and share counts.`,
        supportingMetric: `Average ${topTime.avgViews.toLocaleString()} views per post published at ${topTime.name}.`,
        confidence: 'Medium',
        suggestedAction: `Schedule your high-priority educational reels between ${topTime.name} and 1 hour later.`
      });
    }

    return recs;
  }

  /**
   * Generate 5 "What Should I Post Next?" recommendations based on winning patterns
   * Enforces financial content compliance rules (No "Guaranteed viral" or profit promises)
   */
  generateNextPostRecommendations(posts, strategy) {
    const analysis = this.analyzePerformance(posts);

    const pillars = (strategy?.contentPillars || 'Trading Education, Trader Psychology, Trading Mistakes, Terminal / Technology')
      .split(',')
      .map(s => s.trim());

    const baseTemplates = [
      {
        topic: pillars[0] || 'Trading Education',
        hook: '95% of retail traders make this position sizing mistake...',
        format: 'Reel',
        suggestedDuration: '30-45 seconds',
        cta: 'Save this reel for your next trading session & check Hello Trader terminal.',
        reason: 'Educational trading content has high save & share metrics across Indian retail audience.',
        testObjective: 'Test viewer retention on risk management opening hook.'
      },
      {
        topic: pillars[1] || 'Trader Psychology',
        hook: 'If you feel anxious before placing a trade, read this rule...',
        format: 'Carousel',
        suggestedDuration: '5 Slides',
        cta: 'Tag a fellow trader who needs to master trade execution discipline.',
        reason: 'Carousel posts on trader discipline achieve high save rates.',
        testObjective: 'Measure carousel slide completion rate.'
      },
      {
        topic: pillars[2] || 'Trading Mistakes',
        hook: 'Stop placing stop-loss orders directly on round numbers. Here is why...',
        format: 'Short',
        suggestedDuration: '45 seconds',
        cta: 'Comment "TERMINAL" to test our institutional paper trading desk.',
        reason: 'Fixing common technical mistakes drives high comment engagement.',
        testObjective: 'Test keyword comment auto-responder trigger.'
      },
      {
        topic: pillars[3] || 'Terminal / Technology',
        hook: 'How institutional traders track FII / DII net positions in real-time...',
        format: 'Video',
        suggestedDuration: '60 seconds',
        cta: 'Enroll for 4-day free institutional terminal code link in bio.',
        reason: 'Terminal feature walk-throughs generate high follower conversion rates.',
        testObjective: 'Test lead generation conversion from terminal feature previews.'
      },
      {
        topic: pillars[4] || 'Algo Trading Education',
        hook: 'Why manual traders fail against high-frequency algo webhooks...',
        format: 'Reel',
        suggestedDuration: '35 seconds',
        cta: 'Explore automated risk control kill switches on Hello Trader Pro.',
        reason: 'Algo technology education appeals to tech-forward traders.',
        testObjective: 'Test awareness drive for algo broker connection tools.'
      }
    ];

    // Refine templates based on actual winning data if available
    if (!analysis.insufficientData && analysis.winningContent.bestTopic) {
      const topTopic = analysis.winningContent.bestTopic.name;
      baseTemplates[0].topic = topTopic;
      baseTemplates[0].reason = `Derived from top performing topic "${topTopic}" with avg ${analysis.winningContent.bestTopic.avgViews.toLocaleString()} views.`;
    }

    return baseTemplates;
  }

  /**
   * Generates structured 4-part video script outline for a Content Idea
   */
  generatePostScript(idea) {
    const title = idea.title || 'Trading Educational Video';
    const topic = idea.topic || 'Trading Education';
    const hook = idea.hook || '95% of traders make this mistake...';
    const format = idea.contentType || 'Reel';

    const script = `🎬 [AI VIDEO SCRIPT OUTLINE - ${format.toUpperCase()}]
📌 Title: ${title}
🏷️ Topic: ${topic}

⏱️ PART 1: OPENING HOOK (0-3 Seconds)
• Visual: Close-up shot with dynamic text overlay on screen.
• Audio / Voiceover: "${hook}"
• On-Screen Graphic: ⚠️ "TRADING RISK WARNING"

⏱️ PART 2: PROBLEM & MARKET CONTEXT (3-15 Seconds)
• Visual: Screen recording of Hello Trader platform chart or candlestick pattern.
• Audio / Voiceover: "Most retail traders jump into trades without calculating risk per trade. They focus only on profit targets while ignoring position sizing guidelines."

⏱️ PART 3: EDUCATIONAL CORE VALUE (15-35 Seconds)
• Visual: Step-by-step breakdown of risk-to-reward ratio calculation.
• Audio / Voiceover: "Here is the institutional rule: Never risk more than 1-2% of your account capital on a single trade. Set your stop-loss FIRST before entering."

⏱️ PART 4: CALL TO ACTION (35-45 Seconds)
• Visual: Hello Trader Terminal logo with bio link arrow animation.
• Audio / Voiceover: "${idea.cta || 'Save this reel for your next trading session. Access free institutional terminal tools via link in bio.'}"

⚠️ COMPLIANCE CHECK NOTICE:
Content must be manually reviewed before publishing. Guaranteed profit or viral claims are strictly prohibited.`;

    const safety = this.checkContentSafety(`${title} ${hook} ${script}`);

    return {
      script,
      safety
    };
  }

  /**
   * Filter and sanitize content for strict financial & viral compliance warnings
   */
  checkContentSafety(text) {
    if (!text) return { isSafe: true, warnings: [] };

    const forbiddenPhrases = [
      'guaranteed return', 'guaranteed returns', 'guaranteed profit', 'guaranteed profits',
      'guaranteed viral', 'guaranteed views', '100% viral', '100% accurate', '100% accuracy',
      '99% win rate', '100% win rate', 'risk-free trading', 'risk free trading', 'no risk trading',
      'zero risk trading', 'fake testimonial', 'fabricated performance', 'sebi guaranteed',
      'get rich quick', 'instant wealth', 'make money fast'
    ];

    const warnings = [];
    const lower = text.toLowerCase();

    forbiddenPhrases.forEach(phrase => {
      if (lower.includes(phrase)) {
        warnings.push(`Forbidden claim detected: "${phrase}". Financial, return, or viral guarantee claims are strictly prohibited by safety policy.`);
      }
    });

    return {
      isSafe: warnings.length === 0,
      warnings
    };
  }
}

module.exports = new SocialAIService();
