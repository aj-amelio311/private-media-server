import 'dotenv/config';
// utils/getEmbedding.mjs
// Uses OpenAI text-embedding-3-small
import OpenAI from 'openai';
import fetch, { Headers, Request, Response, FormData } from 'node-fetch';
globalThis.fetch = fetch;
globalThis.Headers = Headers;
globalThis.Request = Request;
globalThis.Response = Response;
globalThis.FormData = FormData;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || 'YOUR_OPENAI_API_KEY_HERE', fetch });

/**
 * Get embedding from OpenAI API
 * @param {string} text
 * @returns {Promise<number[]>}
 */
export async function getEmbedding(text) {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });
  return response.data[0].embedding;
}
