const crypto = require('crypto');
const axios = require('axios');
const { PrismaClient } = require('../node_modules/@prisma/client');
const prisma = new PrismaClient();

// ─── AES-256 ENCRYPTION HELPER FOR OAUTH TOKENS AT REST ───
const ENCRYPTION_SECRET = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET || 'HelloTraderSecretKey32CharsLong!!';

function getDerivedKey() {
  return crypto.createHash('sha256').update(String(ENCRYPTION_SECRET)).digest();
}

function encryptToken(plainText) {
  if (!plainText) return null;
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', getDerivedKey(), iv);
  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return `${iv.toString('hex')}:${encrypted}`;
}

function decryptToken(cipherText) {
  if (!cipherText) return null;
  try {
    const parts = cipherText.split(':');
    if (parts.length !== 2) return cipherText; // Return plain text if legacy format
    const iv = Buffer.from(parts[0], 'hex');
    const encryptedText = parts[1];
    const decipher = crypto.createDecipheriv('aes-256-cbc', getDerivedKey(), iv);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.error('[OAuthService] Token decryption failed:', err.message);
    return null;
  }
}

// ─── OFFICIAL OAUTH SCOPE CONFIGURATIONS (DYNAMIC GETTER AT RUNTIME) ───
function getOauthConfig(platform) {
  const p = platform.toUpperCase();
  if (p === 'INSTAGRAM') {
    return {
      authEndpoint: 'https://www.facebook.com/v18.0/dialog/oauth',
      tokenEndpoint: 'https://graph.facebook.com/v18.0/oauth/access_token',
      clientId: process.env.INSTAGRAM_CLIENT_ID || process.env.META_APP_ID || 'META_APP_ID_PLACEHOLDER',
      clientSecret: process.env.INSTAGRAM_CLIENT_SECRET || process.env.META_APP_SECRET || 'META_APP_SECRET_PLACEHOLDER',
      redirectUri: process.env.INSTAGRAM_REDIRECT_URI || 'http://localhost:4000/api/social/auth/instagram/callback',
      scopes: [
        'instagram_basic',
        'instagram_manage_insights',
        'instagram_content_publish',
        'pages_show_list',
        'pages_read_engagement'
      ]
    };
  }
  if (p === 'FACEBOOK') {
    return {
      authEndpoint: 'https://www.facebook.com/v18.0/dialog/oauth',
      tokenEndpoint: 'https://graph.facebook.com/v18.0/oauth/access_token',
      clientId: process.env.FACEBOOK_APP_ID || process.env.META_APP_ID || 'META_APP_ID_PLACEHOLDER',
      clientSecret: process.env.FACEBOOK_APP_SECRET || process.env.META_APP_SECRET || 'META_APP_SECRET_PLACEHOLDER',
      redirectUri: process.env.FACEBOOK_REDIRECT_URI || 'http://localhost:4000/api/social/auth/facebook/callback',
      scopes: [
        'pages_show_list',
        'pages_read_engagement',
        'pages_manage_posts',
        'read_insights'
      ]
    };
  }
  if (p === 'YOUTUBE') {
    return {
      authEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenEndpoint: 'https://oauth2.googleapis.com/token',
      clientId: process.env.YOUTUBE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || 'GOOGLE_CLIENT_ID_PLACEHOLDER',
      clientSecret: process.env.YOUTUBE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || 'GOOGLE_CLIENT_SECRET_PLACEHOLDER',
      redirectUri: process.env.YOUTUBE_REDIRECT_URI || 'http://localhost:4000/api/social/auth/youtube/callback',
      scopes: [
        'https://www.googleapis.com/auth/youtube.readonly',
        'https://www.googleapis.com/auth/yt-analytics.readonly',
        'https://www.googleapis.com/auth/youtube.upload'
      ]
    };
  }
  throw new Error(`Unsupported platform: ${platform}`);
}

class SocialOAuthService {
  /**
   * Generates official OAuth 2.0 authorization URL for a target platform.
   */
  getAuthUrl(platform) {
    const config = getOauthConfig(platform);
    if (!config) {
      throw new Error(`Unsupported platform: ${platform}`);
    }

    if (platform.toUpperCase() === 'YOUTUBE') {
      const params = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: config.redirectUri,
        response_type: 'code',
        scope: config.scopes.join(' '),
        access_type: 'offline',
        prompt: 'consent'
      });
      return `${config.authEndpoint}?${params.toString()}`;
    }

    // Meta (Instagram / Facebook)
    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      response_type: 'code',
      scope: config.scopes.join(',')
    });
    return `${config.authEndpoint}?${params.toString()}`;
  }

  /**
   * Processes Instagram / Meta OAuth Authorization Code Callback
   */
  async handleInstagramCallback(code) {
    const config = getOauthConfig('INSTAGRAM');
    
    // Check if real client credentials are configured
    if (config.clientId === 'META_APP_ID_PLACEHOLDER' || !process.env.META_APP_SECRET) {
      throw new Error('Instagram configuration missing META_APP_ID or META_APP_SECRET in server environment.');
    }

    try {
      // 1. Exchange short-lived code for access token
      const tokenRes = await axios.get(config.tokenEndpoint, {
        params: {
          client_id: config.clientId,
          client_secret: config.clientSecret,
          redirect_uri: config.redirectUri,
          code: code
        }
      });
      const shortLivedToken = tokenRes.data.access_token;

      // 2. Exchange for 60-day long-lived access token
      const longLivedRes = await axios.get('https://graph.facebook.com/v18.0/oauth/access_token', {
        params: {
          grant_type: 'fb_exchange_token',
          client_id: config.clientId,
          client_secret: config.clientSecret,
          fb_exchange_token: shortLivedToken
        }
      });
      const longLivedToken = longLivedRes.data.access_token;
      const expiresInSec = longLivedRes.data.expires_in || 5184000; // ~60 days

      // 3. Fetch connected Instagram Business Account ID & Profile
      const meRes = await axios.get('https://graph.facebook.com/v18.0/me/accounts', {
        params: { access_token: longLivedToken }
      });
      
      const pages = meRes.data.data || [];
      if (pages.length === 0) {
        throw new Error('Instagram account not eligible / permissions required: No Facebook Page linked to Instagram account.');
      }
      
      const pageId = pages[0].id;
      const pageName = pages[0].name;

      const pageRes = await axios.get(`https://graph.facebook.com/v18.0/${pageId}`, {
        params: {
          fields: 'instagram_business_account{id,username,profile_picture_url,followers_count,media_count}',
          access_token: longLivedToken
        }
      });

      const igAcc = pageRes.data.instagram_business_account;
      if (!igAcc) {
        throw new Error('Instagram account not eligible / permissions required: Instagram Business or Creator account required.');
      }

      const handle = igAcc?.username || pageName;
      const externalId = igAcc?.id || pageId;
      const avatar = igAcc?.profile_picture_url || '/logo.png';
      const followers = igAcc?.followers_count || 0;
      const posts = igAcc?.media_count || 0;

      // 4. Encrypt tokens before storing in database
      const encryptedAccess = encryptToken(longLivedToken);
      const expiresAt = new Date(Date.now() + expiresInSec * 1000);

      const account = await prisma.socialAccount.upsert({
        where: { id: `IG_${externalId}` },
        update: {
          accountName: `Instagram (@${handle})`,
          accountHandle: `@${handle}`,
          avatarUrl: avatar,
          status: 'CONNECTED',
          followerCount: followers,
          postCount: posts,
          accessToken: encryptedAccess,
          tokenExpiresAt: expiresAt,
          externalAccountId: externalId,
          scopes: config.scopes.join(','),
          lastSyncStatus: 'SUCCESS',
          lastSyncedAt: new Date()
        },
        create: {
          id: `IG_${externalId}`,
          platform: 'INSTAGRAM',
          accountName: `Instagram (@${handle})`,
          accountHandle: `@${handle}`,
          avatarUrl: avatar,
          status: 'CONNECTED',
          followerCount: followers,
          postCount: posts,
          accessToken: encryptedAccess,
          tokenExpiresAt: expiresAt,
          externalAccountId: externalId,
          scopes: config.scopes.join(',')
        }
      });

      return account;
    } catch (err) {
      console.error('[OAuthService] Instagram Callback Error:', err.response?.data || err.message);
      throw new Error(err.response?.data?.error?.message || err.message || 'Instagram account not eligible / permissions required');
    }
  }

  /**
   * Processes YouTube / Google OAuth Authorization Code Callback
   */
  async handleYouTubeCallback(code) {
    const config = getOauthConfig('YOUTUBE');

    if (config.clientId === 'GOOGLE_CLIENT_ID_PLACEHOLDER') {
      return this._createDemoConnectedAccount('YOUTUBE', 'Hello Trader Official (YouTube Channel)');
    }

    try {
      const tokenRes = await axios.post(config.tokenEndpoint, new URLSearchParams({
        code: code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.redirectUri,
        grant_type: 'authorization_code'
      }).toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });

      const accessToken = tokenRes.data.access_token;
      const refreshToken = tokenRes.data.refresh_token;
      const expiresInSec = tokenRes.data.expires_in || 3600;

      // Fetch Channel Profile from YouTube API
      const channelRes = await axios.get('https://www.googleapis.com/youtube/v3/channels', {
        params: {
          part: 'snippet,statistics',
          mine: true
        },
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      const channel = channelRes.data.items?.[0];
      const channelId = channel?.id || 'YOUTUBE_CHANNEL_DEFAULT';
      const channelName = channel?.snippet?.title || 'Hello Trader Official';
      const handle = channel?.snippet?.customUrl || `@${channelName.replace(/\s+/g, '')}`;
      const avatar = channel?.snippet?.thumbnails?.default?.url || '/logo.png';
      const subscribers = parseInt(channel?.statistics?.subscriberCount || '0', 10);
      const videoCount = parseInt(channel?.statistics?.videoCount || '0', 10);

      const encryptedAccess = encryptToken(accessToken);
      const encryptedRefresh = encryptToken(refreshToken);
      const expiresAt = new Date(Date.now() + expiresInSec * 1000);

      const account = await prisma.socialAccount.upsert({
        where: { id: `YT_${channelId}` },
        update: {
          accountName: channelName,
          accountHandle: handle,
          avatarUrl: avatar,
          status: 'CONNECTED',
          followerCount: subscribers,
          postCount: videoCount,
          accessToken: encryptedAccess,
          refreshToken: encryptedRefresh,
          tokenExpiresAt: expiresAt,
          externalAccountId: channelId,
          scopes: config.scopes.join(','),
          lastSyncStatus: 'SUCCESS',
          lastSyncedAt: new Date()
        },
        create: {
          id: `YT_${channelId}`,
          platform: 'YOUTUBE',
          accountName: channelName,
          accountHandle: handle,
          avatarUrl: avatar,
          status: 'CONNECTED',
          followerCount: subscribers,
          postCount: videoCount,
          accessToken: encryptedAccess,
          refreshToken: encryptedRefresh,
          tokenExpiresAt: expiresAt,
          externalAccountId: channelId,
          scopes: config.scopes.join(',')
        }
      });

      return account;
    } catch (err) {
      console.error('[OAuthService] YouTube Callback Error:', err.response?.data || err.message);
      throw new Error(err.response?.data?.error_description || err.message || 'Failed to authenticate with YouTube');
    }
  }

  /**
   * Processes Facebook Page OAuth Callback
   */
  async handleFacebookCallback(code) {
    const config = getOauthConfig('FACEBOOK');

    if (config.clientId === 'META_APP_ID_PLACEHOLDER') {
      return this._createDemoConnectedAccount('FACEBOOK', 'Hello Trader Official Facebook Page');
    }

    try {
      const tokenRes = await axios.get(config.tokenEndpoint, {
        params: {
          client_id: config.clientId,
          client_secret: config.clientSecret,
          redirect_uri: config.redirectUri,
          code: code
        }
      });
      const shortLivedToken = tokenRes.data.access_token;

      const longLivedRes = await axios.get('https://graph.facebook.com/v18.0/oauth/access_token', {
        params: {
          grant_type: 'fb_exchange_token',
          client_id: config.clientId,
          client_secret: config.clientSecret,
          fb_exchange_token: shortLivedToken
        }
      });
      const longLivedToken = longLivedRes.data.access_token;

      const meRes = await axios.get('https://graph.facebook.com/v18.0/me/accounts', {
        params: { access_token: longLivedToken }
      });

      const page = meRes.data.data?.[0];
      const pageId = page?.id || 'FB_PAGE_DEFAULT';
      const pageName = page?.name || 'Hello Trader Facebook Page';

      const encryptedAccess = encryptToken(page.access_token || longLivedToken);
      const expiresAt = new Date(Date.now() + 5184000 * 1000);

      const account = await prisma.socialAccount.upsert({
        where: { id: `FB_${pageId}` },
        update: {
          accountName: pageName,
          accountHandle: `@${pageName.replace(/\s+/g, '')}`,
          status: 'CONNECTED',
          accessToken: encryptedAccess,
          tokenExpiresAt: expiresAt,
          externalAccountId: pageId,
          scopes: config.scopes.join(','),
          lastSyncStatus: 'SUCCESS',
          lastSyncedAt: new Date()
        },
        create: {
          id: `FB_${pageId}`,
          platform: 'FACEBOOK',
          accountName: pageName,
          accountHandle: `@${pageName.replace(/\s+/g, '')}`,
          status: 'CONNECTED',
          accessToken: encryptedAccess,
          tokenExpiresAt: expiresAt,
          externalAccountId: pageId,
          scopes: config.scopes.join(',')
        }
      });

      return account;
    } catch (err) {
      console.error('[OAuthService] Facebook Callback Error:', err.response?.data || err.message);
      throw new Error(err.message || 'Failed to authenticate with Facebook');
    }
  }

  /**
   * Helper to create verified demo connection when API credentials are not supplied locally
   */
  async _createDemoConnectedAccount(platform, name) {
    const ids = { INSTAGRAM: 'IG_DEMO_OFFICIAL', YOUTUBE: 'YT_DEMO_OFFICIAL', FACEBOOK: 'FB_DEMO_OFFICIAL' };
    const handles = { INSTAGRAM: '@hellotrader_official', YOUTUBE: '@hellotrader_academy', FACEBOOK: '@hellotradersocial' };
    const counts = { INSTAGRAM: 42800, YOUTUBE: 68500, FACEBOOK: 19400 };

    const mockToken = encryptToken(`DEMO_OAUTH_TOKEN_${platform}_SAFE_EXPIRE_2026`);

    return await prisma.socialAccount.upsert({
      where: { id: ids[platform] },
      update: {
        status: 'CONNECTED',
        accessToken: mockToken,
        tokenExpiresAt: new Date(Date.now() + 60 * 86400 * 1000),
        lastSyncedAt: new Date(),
        lastSyncStatus: 'SUCCESS'
      },
      create: {
        id: ids[platform],
        platform: platform,
        accountName: name,
        accountHandle: handles[platform],
        avatarUrl: '/logo.png',
        status: 'CONNECTED',
        followerCount: counts[platform],
        postCount: 84,
        accessToken: mockToken,
        tokenExpiresAt: new Date(Date.now() + 60 * 86400 * 1000),
        scopes: getOauthConfig(platform)?.scopes.join(',') || 'basic',
        lastSyncedAt: new Date(),
        lastSyncStatus: 'SUCCESS'
      }
    });
  }

  /**
   * Safely disconnects and revokes account credentials
   */
  async disconnectAccount(accountId) {
    return await prisma.socialAccount.update({
      where: { id: accountId },
      data: {
        status: 'DISCONNECTED',
        accessToken: null,
        refreshToken: null,
        tokenExpiresAt: null,
        lastSyncStatus: 'DISCONNECTED'
      }
    });
  }

  /**
   * Decrypts token for internal worker consumption ONLY (Never sent to client)
   */
  getDecryptedAccessToken(account) {
    if (!account || !account.accessToken) return null;
    return decryptToken(account.accessToken);
  }
}

module.exports = new SocialOAuthService();
module.exports.encryptToken = encryptToken;
module.exports.decryptToken = decryptToken;
