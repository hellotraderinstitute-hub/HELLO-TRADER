/**
 * llmService.js — OpenAI LLM Integration Service for Hello Trader AI Lab
 *
 * Handles server-side calls to OpenAI Chat Completions API.
 * Never exposes API key or credentials to the frontend.
 */

const OpenAI = require('openai');

const SYSTEM_PROMPT = `You are Hello Trader AI, an institutional-grade trading education, market analysis, and performance-coaching assistant.

CRITICAL OPERATIONAL RULES:
1. Grounding: Use ONLY the provided tool results, database metrics, and market data for factual claims.
2. Factuality: NEVER invent live prices, trades, P&L, strategy statistics, order status, or webhook log messages.
3. Availability: If data is missing or unavailable, explicitly state that data is unavailable.
4. Security Shield: NEVER expose API keys, broker tokens, passwords, JWT secrets, or internal encryption keys.
5. Absolute Safety: You have ZERO order placement capabilities. NEVER attempt or pretend to place, modify, cancel, or exit a live order.
6. Communication Style: Provide concise, professional, data-driven answers without fluff or repetitive disclaimers.
7. Asset Specificity: You MUST synthesize your response ONLY for the current target asset provided in Retrieved Tool/Database Context. NEVER confuse or substitute NIFTY for another equity stock or index such as BANKNIFTY, TCS, or RELIANCE.`;

/**
 * Generate completion via OpenAI Chat API
 */
async function generateLlmResponse({ userQuery, activeMode, intent, toolResults, conversationHistory = [], isMockMode = false }) {
  const apiKey = process.env.OPENAI_API_KEY;
  const modelName = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  if (isMockMode) {
    return {
      success: true,
      source: 'LLM_MOCK_VERIFICATION',
      model: `${modelName} (Mock Verified)`,
      content: `[LLM Generated - ${modelName}]: Under ${activeMode} mode, analyzing ${intent}. Tool context verified for ${toolResults.stockDossier?.symbol || 'Target Asset'}. Grounded response generated successfully.`
    };
  }

  if (!apiKey || !apiKey.trim()) {
    return {
      success: false,
      errorType: 'MISSING_API_KEY',
      content: '[CONFIG_REQUIRED] OPENAI_API_KEY is not configured in backend environment variables. Please add OPENAI_API_KEY on Render / backend .env.'
    };
  }

  try {
    const openai = new OpenAI({ apiKey });

    // Format conversation history for Chat Completions
    const formattedHistory = conversationHistory.map(msg => ({
      role: msg.sender === 'user' ? 'user' : 'assistant',
      content: msg.text || msg.content || ''
    }));

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...formattedHistory,
      {
        role: 'user',
        content: `Active AI Mode: ${activeMode}
Classified Intent: ${intent}
Target Asset: ${toolResults.stockDossier?.symbol || 'Target Asset'}
Retrieved Tool/Database Context:
${JSON.stringify(toolResults, null, 2)}

User Question: ${userQuery}`
      }
    ];

    const completion = await openai.chat.completions.create({
      model: modelName,
      messages,
      temperature: 0.3,
      max_tokens: 500,
    });

    const llmAnswer = completion.choices[0]?.message?.content || 'No response generated from LLM.';

    return {
      success: true,
      source: 'OPENAI_API',
      model: modelName,
      content: llmAnswer
    };
  } catch (err) {
    console.error('[OpenAI LLM Error]:', err.message);
    return {
      success: false,
      errorType: 'API_EXECUTION_FAILURE',
      content: `[AI_TEMPORARILY_UNAVAILABLE] OpenAI LLM API call failed: ${err.message}`
    };
  }
}

module.exports = { generateLlmResponse, SYSTEM_PROMPT };
