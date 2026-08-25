const axios = require('axios');
const { PrismaClient } = require('../node_modules/@prisma/client');
const prisma = new PrismaClient();
const socialOAuthService = require('./socialOAuthService');

class SocialPublishWorker {
  /**
   * Main safe worker checking scheduled calendar items
   */
  async processScheduledQueue() {
    console.log('[SocialPublishWorker] Checking scheduled social media posts queue...');

    try {
      // 1. Verify Global Auto-Publish Safety Gate Switch
      let strategy = await prisma.socialStrategy.findUnique({ where: { id: 'GLOBAL' } });
      if (!strategy) {
        strategy = await prisma.socialStrategy.create({ data: { id: 'GLOBAL', autoPublishEnabled: false } });
      }

      if (!strategy.autoPublishEnabled) {
        console.log('[SocialPublishWorker] AUTO_PUBLISH_ENABLED is FALSE. Automatic background publishing is disabled by safety policy.');
        return { status: 'DISABLED', message: 'Global AUTO_PUBLISH_ENABLED setting is set to FALSE.' };
      }

      // 2. Fetch pending scheduled items reaching publish date/time
      const now = new Date();
      const pendingItems = await prisma.contentCalendar.findMany({
        where: {
          status: 'Scheduled',
          publishStatus: 'PENDING',
          date: { lte: now }
        }
      });

      console.log(`[SocialPublishWorker] Found ${pendingItems.length} scheduled items ready for publishing audit.`);

      const results = [];
      for (const item of pendingItems) {
        const result = await this.publishScheduledItem(item.id);
        results.push(result);
      }

      return { processed: pendingItems.length, results };
    } catch (err) {
      console.error('[SocialPublishWorker] Scheduled queue processing error (isolated):', err.message);
      return { status: 'ERROR', error: err.message };
    }
  }

  /**
   * Safe publishing executor with strict approval & duplicate protection
   */
  async publishScheduledItem(calendarId, manualOverride = false) {
    console.log(`[SocialPublishWorker] Initiating publishing check for calendar item: ${calendarId}`);

    try {
      const calendarEntry = await prisma.contentCalendar.findUnique({ where: { id: calendarId } });
      if (!calendarEntry) {
        throw new Error('Calendar entry not found.');
      }

      // 1. Duplicate Publish Protection Check
      if (calendarEntry.status === 'Published' || calendarEntry.publishStatus === 'SUCCESS') {
        return { status: 'SKIPPED', reason: 'Post has already been published (Duplicate publish protection active).' };
      }

      if (calendarEntry.status === 'Cancelled' || calendarEntry.publishStatus === 'CANCELLED') {
        return { status: 'SKIPPED', reason: 'Publishing was manually cancelled by admin.' };
      }

      // 2. Strict Content Idea Approval Verification Check
      if (calendarEntry.ideaId) {
        const idea = await prisma.contentIdea.findUnique({ where: { id: calendarEntry.ideaId } });
        if (!idea) {
          throw new Error('Associated Content Idea record not found.');
        }

        if (idea.status !== 'Approved' && idea.status !== 'Ready' && !manualOverride) {
          throw new Error(`Content Idea status is "${idea.status}". Only explicitly APPROVED content can be published.`);
        }
      }

      // 3. Platform Target & Account Lookup
      const account = await prisma.socialAccount.findFirst({
        where: {
          platform: calendarEntry.platform === 'ALL' ? 'INSTAGRAM' : calendarEntry.platform,
          status: 'CONNECTED'
        }
      });

      if (!account) {
        // Fallback: If no official account connected, mark test simulation
        await prisma.contentCalendar.update({
          where: { id: calendarId },
          data: {
            status: 'Published',
            publishStatus: 'SUCCESS',
            publishedAt: new Date(),
            notes: `${calendarEntry.notes || ''} [Published in Safe Simulation Mode - Connect API in Phase 2]`
          }
        });
        return { status: 'SIMULATED', message: 'Published in Safe Simulation Mode (No connected platform account)' };
      }

      const decryptedToken = socialOAuthService.getDecryptedAccessToken(account);

      // 4. Platform API Publisher Routing
      let publishResponse;
      if (account.platform === 'INSTAGRAM') {
        publishResponse = await this._publishToInstagram(account, decryptedToken, calendarEntry);
      } else if (account.platform === 'YOUTUBE') {
        publishResponse = await this._publishToYouTube(account, decryptedToken, calendarEntry);
      } else if (account.platform === 'FACEBOOK') {
        publishResponse = await this._publishToFacebook(account, decryptedToken, calendarEntry);
      } else {
        throw new Error(`Unsupported publishing platform: ${account.platform}`);
      }

      // 5. Update Calendar & Idea Status on Success
      await prisma.contentCalendar.update({
        where: { id: calendarId },
        data: {
          status: 'Published',
          publishStatus: 'SUCCESS',
          publishedAt: new Date(),
          platformPostId: publishResponse.postId || `POST_${Date.now()}`
        }
      });

      if (calendarEntry.ideaId) {
        await prisma.contentIdea.update({
          where: { id: calendarEntry.ideaId },
          data: { status: 'Published' }
        });
      }

      console.log(`[SocialPublishWorker] Successfully published item ${calendarId} to ${account.platform}`);
      return { status: 'SUCCESS', platformPostId: publishResponse.postId };

    } catch (err) {
      const errorMsg = err.response?.data?.error?.message || err.message;
      console.error(`[SocialPublishWorker] Publishing failed for ${calendarId}:`, errorMsg);

      // Update failure state in DB without throwing to server loop
      await prisma.contentCalendar.update({
        where: { id: calendarId },
        data: {
          publishStatus: 'FAILED',
          publishError: errorMsg
        }
      });

      return { status: 'FAILED', error: errorMsg };
    }
  }

  /**
   * Manually cancels a scheduled publishing job
   */
  async cancelScheduledPublish(calendarId) {
    return await prisma.contentCalendar.update({
      where: { id: calendarId },
      data: {
        status: 'Cancelled',
        publishStatus: 'CANCELLED',
        notes: 'Publishing manually cancelled by Superadmin.'
      }
    });
  }

  // ─── PLATFORM SPECIFIC PUBLISHERS ───

  async _publishToInstagram(account, token, entry) {
    if (!token || token.startsWith('DEMO_OAUTH_TOKEN')) {
      return { postId: `IG_MOCK_${Date.now()}` };
    }

    try {
      // 1. Create Media Container
      const containerRes = await axios.post(`https://graph.facebook.com/v18.0/${account.externalAccountId}/media`, null, {
        params: {
          caption: `${entry.contentTitle}\n\n#HelloTrader #StockMarket #TradingEducation`,
          media_type: entry.contentType === 'Reel' ? 'REELS' : 'IMAGE',
          access_token: token
        }
      });

      const containerId = containerRes.data.id;

      // 2. Publish Media Container
      const publishRes = await axios.post(`https://graph.facebook.com/v18.0/${account.externalAccountId}/media_publish`, null, {
        params: {
          creation_id: containerId,
          access_token: token
        }
      });

      return { postId: publishRes.data.id };
    } catch (err) {
      if (err.response?.status === 403 || err.response?.status === 400) {
        throw new Error('Not available with current platform permissions (Requires instagram_content_publish scope)');
      }
      throw err;
    }
  }

  async _publishToYouTube(account, token, entry) {
    if (!token || token.startsWith('DEMO_OAUTH_TOKEN')) {
      return { postId: `YT_MOCK_${Date.now()}` };
    }

    // YouTube Video Upload requires multipart binary upload with youtube.upload scope
    throw new Error('Not available with current platform permissions (Direct video file required for YouTube upload)');
  }

  async _publishToFacebook(account, token, entry) {
    if (!token || token.startsWith('DEMO_OAUTH_TOKEN')) {
      return { postId: `FB_MOCK_${Date.now()}` };
    }

    try {
      const fbRes = await axios.post(`https://graph.facebook.com/v18.0/${account.externalAccountId}/feed`, null, {
        params: {
          message: `${entry.contentTitle}\n\nHello Trader Institutional Learning`,
          access_token: token
        }
      });
      return { postId: fbRes.data.id };
    } catch (err) {
      if (err.response?.status === 403) {
        throw new Error('Not available with current platform permissions (Requires pages_manage_posts scope)');
      }
      throw err;
    }
  }
}

module.exports = new SocialPublishWorker();
