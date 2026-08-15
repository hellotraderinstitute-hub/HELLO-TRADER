/**
 * marketNewsService.js — Live Indian & Global Market News Aggregator Service
 * ═══════════════════════════════════════════════════════════════════════════
 * Source: Live Financial RSS Market News Streams
 * 
 * Features:
 *   - Fetches live real headlines (Indian Stock Market & Global Economy)
 *   - Classifies articles into INDIAN, GLOBAL, INSTITUTIONAL
 *   - Auto-assigns sentiment (BULLISH, BEARISH, NEUTRAL) based on headline keywords
 *   - Server-side 5-minute TTL cache
 *   - Zero static/hardcoded mock news
 * ═══════════════════════════════════════════════════════════════════════════
 */

const https = require('https');

const NEWS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

class MarketNewsService {
  constructor() {
    this._cache = null;
    this._lastFetchTime = 0;
  }

  _fetchRss(targetUrl) {
    return new Promise((resolve, reject) => {
      const parsed = new URL(targetUrl);
      const options = {
        hostname: parsed.hostname,
        port: 443,
        path: parsed.pathname + parsed.search,
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept': 'application/rss+xml, application/xml, text/xml, */*',
        },
        timeout: 10000,
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      });

      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
      req.end();
    });
  }

  async getLiveNews(requestedCategory = 'ALL') {
    const now = Date.now();

    // Return fresh cache if available
    if (this._cache && (now - this._lastFetchTime) < NEWS_CACHE_TTL_MS) {
      return this._filterNews(this._cache, requestedCategory, true);
    }

    try {
      const [indianRss, globalRss] = await Promise.allSettled([
        this._fetchRss('https://news.google.com/rss/search?q=Indian+Stock+Market+NSE+NIFTY+RBI&hl=en-IN&gl=IN&ceid=IN:en'),
        this._fetchRss('https://news.google.com/rss/search?q=Global+Stock+Market+US+Fed+Crude+Economy&hl=en-IN&gl=IN&ceid=IN:en')
      ]);

      const articles = [];
      let idCounter = 1;

      // Parse Indian News
      if (indianRss.status === 'fulfilled' && indianRss.value.status === 200) {
        const parsedIndian = this._parseXmlFeed(indianRss.value.body, 'INDIAN', idCounter);
        articles.push(...parsedIndian);
        idCounter += parsedIndian.length;
      }

      // Parse Global News
      if (globalRss.status === 'fulfilled' && globalRss.value.status === 200) {
        const parsedGlobal = this._parseXmlFeed(globalRss.value.body, 'GLOBAL', idCounter);
        articles.push(...parsedGlobal);
      }

      if (articles.length > 0) {
        // Sort by publication time descending
        articles.sort((a, b) => new Date(b.pubDateRaw).getTime() - new Date(a.pubDateRaw).getTime());

        this._cache = articles;
        this._lastFetchTime = Date.now();

        return this._filterNews(articles, requestedCategory, false);
      }
    } catch (err) {
      console.error('[MarketNewsService] Error fetching news RSS:', err.message);
    }

    if (this._cache) {
      return this._filterNews(this._cache, requestedCategory, true);
    }

    return {
      success: false,
      error: 'NEWS_UNAVAILABLE',
      message: 'Live market news feed is currently unavailable.',
      articles: [],
    };
  }

  _filterNews(articles, category, cached) {
    const cat = String(category).toUpperCase();
    let filtered = articles;
    if (cat !== 'ALL') {
      filtered = articles.filter(a => a.category === cat);
    }

    return {
      success: true,
      category: cat,
      totalCount: articles.length,
      filteredCount: filtered.length,
      lastUpdated: new Date(this._lastFetchTime).toISOString(),
      cached,
      articles: filtered,
    };
  }

  _parseXmlFeed(xmlText, defaultCategory, startId) {
    const items = [];
    const itemRegex = /<item>[\s\S]*?<\/item>/gi;
    const matches = xmlText.match(itemRegex) || [];

    let currentId = startId;
    for (const match of matches.slice(0, 15)) {
      const titleMatch   = match.match(/<title>(.*?)<\/title>/i);
      const linkMatch    = match.match(/<link>(.*?)<\/link>/i);
      const pubDateMatch = match.match(/<pubDate>(.*?)<\/pubDate>/i);
      const sourceMatch  = match.match(/<source[^>]*>(.*?)<\/source>/i);

      if (!titleMatch) continue;

      let rawTitle = titleMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim();
      let source = sourceMatch ? sourceMatch[1].trim() : 'Financial News';

      // Clean title and source
      if (rawTitle.includes(' - ')) {
        const parts = rawTitle.split(' - ');
        source = parts.pop().trim();
        rawTitle = parts.join(' - ').trim();
      }

      const pubDateRaw = pubDateMatch ? pubDateMatch[1].trim() : new Date().toUTCString();
      const relativeTime = this._formatRelativeTime(pubDateRaw);
      const sentiment = this._detectSentiment(rawTitle);
      const impact = this._detectImpact(rawTitle);

      // Determine category (check if institutional)
      let category = defaultCategory;
      const titleUpper = rawTitle.toUpperCase();
      if (titleUpper.includes('FII') || titleUpper.includes('DII') || titleUpper.includes('INSTITUTIONAL') || titleUpper.includes('SMART MONEY') || titleUpper.includes('MUTUAL FUND')) {
        category = 'INSTITUTIONAL';
      }

      items.push({
        id: currentId++,
        category,
        title: rawTitle,
        source,
        link: linkMatch ? linkMatch[1].trim() : null,
        pubDateRaw,
        time: relativeTime,
        sentiment,
        impact,
      });
    }

    return items;
  }

  _detectSentiment(title) {
    const t = title.toUpperCase();
    const bullishWords = ['SURGE', 'RALLY', 'GAIN', 'HIGH', 'BOOST', 'UP', 'BULL', 'GROWTH', 'RECORD', 'POSITIVE', 'BUY', 'JUMP', 'RISE', 'OUTPERFORM'];
    const bearishWords = ['PLUNGE', 'DROP', 'FALL', 'CRASH', 'DOWN', 'BEAR', 'LOSS', 'SLUMP', 'NEGATIVE', 'SELL', 'DIP', 'CUT', 'SINK', 'WEAK'];

    let bullScore = 0;
    let bearScore = 0;

    bullishWords.forEach(w => { if (t.includes(w)) bullScore++; });
    bearishWords.forEach(w => { if (t.includes(w)) bearScore++; });

    if (bullScore > bearScore) return 'BULLISH';
    if (bearScore > bullScore) return 'BEARISH';
    return 'NEUTRAL';
  }

  _detectImpact(title) {
    const t = title.toUpperCase();
    if (t.includes('RBI') || t.includes('FED') || t.includes('INFLATION') || t.includes('GDP') || t.includes('CRUDE') || t.includes('NIFTY') || t.includes('FII')) {
      return 'HIGH';
    }
    return 'MEDIUM';
  }

  _formatRelativeTime(dateStr) {
    try {
      const pubDate = new Date(dateStr);
      const diffMs = Date.now() - pubDate.getTime();
      const diffMins = Math.floor(diffMs / 60000);

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours}h ago`;
      return `${Math.floor(diffHours / 24)}d ago`;
    } catch {
      return 'Recent';
    }
  }
}

// Export singleton
const marketNewsService = new MarketNewsService();
module.exports = marketNewsService;
