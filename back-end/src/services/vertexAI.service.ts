/**
 * Generates an AI summary of text using Vertex AI (Gemini).
 *
 * ⚠️ STUB: returns a placeholder summary so the app runs without GCP
 * credentials. Replace the stub body with the real implementation below.
 */
export async function summarize(text: string): Promise<string> {
  // --- STUB implementation ---------------------------------------------------
  const preview = text.slice(0, 120);
  const ellipsis = text.length > 120 ? '…' : '';
  return (
    `[stub] AI summary placeholder. Source text preview: "${preview}${ellipsis}". ` +
    'Wire up Vertex AI (Gemini) to replace this with a real generated summary.'
  );

  // --- Real Vertex AI implementation (uncomment + fill in) -------------------
  //
  // import { VertexAI } from '@google-cloud/vertexai';
  // import { env } from '../config/env';
  //
  // const vertex = new VertexAI({
  //   project: env.gcp.projectId,
  //   location: env.gcp.vertexLocation,
  // });
  // const model = vertex.getGenerativeModel({ model: env.gcp.vertexModel });
  //
  // const prompt = `Summarize the following document concisely:\n\n${text}`;
  // const result = await model.generateContent(prompt);
  // return result.response.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}
