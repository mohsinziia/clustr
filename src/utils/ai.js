import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.ZAI_API_KEY,
  baseURL: "https://api.z.ai/api/paas/v4/"
});

/**
 * Generates a concise, lowercase username using Z.AI (GLM)
 * @returns {Promise<string>}
 */
export const generateUsernameAI = async () => {
  if (!process.env.ZAI_API_KEY) {
    throw new Error("ZAI_API_KEY is not configured in the environment");
  }

  const prompt = `Generate a single concise, creative, and unique username for a social media platform.
The username should be cool, catchy, and abstract.

The username must:
1. Be strictly lowercase.
2. Contain only letters and numbers (no spaces or special characters).
3. Be between 5 and 12 characters long.
4. Respond with ONLY the username string itself. No explanations, no quotes, no extra text.`;

  try {
    const completion = await client.chat.completions.create({
      model: "glm-4.7-flash",
      messages: [{ role: "system", content: "You are a one-word generator. No reasoning. No thinking. Just the word." }, { role: "user", content: prompt }],
      temperature: 0.2,
      top_p: 0.7,
      max_tokens: 256,
    });

    const rawUsername = completion.choices[0]?.message?.content?.trim().toLowerCase() || "";
    const cleaned = rawUsername.replace(/[^a-z0-9]/g, "");

    if (cleaned.length >= 3) return cleaned;
  } catch (error) {
    console.error("AI Generation failed:", error.message);
  }

  // Final fallback: fast, zero API calls, guaranteed clean
  return `user-${Math.floor(1000 + Math.random() * 9000)}`;
};
