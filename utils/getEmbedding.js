
// Uses OpenAI text-embedding-3-small
const OpenAI = require('openai');
let openai = null;
async function getOpenAI() {
  if (!openai) {
    // Dynamically import node-fetch for ESM compatibility
    const mod = await import('node-fetch');
    global.fetch = mod.default;
    global.Headers = mod.Headers;
    global.Request = mod.Request;
    global.Response = mod.Response;
    global.FormData = mod.FormData;
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || 'YOUR_OPENAI_API_KEY_HERE', fetch: mod.default });
  }
  return openai;
}

/**
 * Get embedding from OpenAI API
 * @param {string} text
 * @returns {Promise<number[]>}
 */

async function getEmbedding(text) {
  const openai = await getOpenAI();
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });
  return response.data[0].embedding;
}

module.exports = { getEmbedding };
