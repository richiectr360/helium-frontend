import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";

export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const {
      translations,
    }: { translations: Array<{ key: string; en: string }> } = await req.json();

    if (
      !translations ||
      !Array.isArray(translations) ||
      translations.length === 0
    ) {
      return Response.json(
        { error: "Invalid request: translations array required" },
        { status: 400 }
      );
    }

    // Collect all English texts
    const englishTexts = translations.map((t) => t.en);

    // Single prompt to get all translations at once
    const prompt = `You are a professional translator. Translate the following English UI text strings into Spanish, French, German, Japanese, and Chinese.

Return ONLY a JSON object with this exact structure:
{
  "es": { "English text 1": "Spanish translation 1", "English text 2": "Spanish translation 2" },
  "fr": { "English text 1": "French translation 1", "English text 2": "French translation 2" },
  "de": { "English text 1": "German translation 1", "English text 2": "German translation 2" },
  "ja": { "English text 1": "Japanese translation 1", "English text 2": "Japanese translation 2" },
  "zh": { "English text 1": "Chinese translation 1", "English text 2": "Chinese translation 2" }
}

Texts to translate:
${englishTexts.map((text, i) => `${i + 1}. "${text}"`).join("\n")}

Do not include any explanation, markdown formatting, or code blocks. Return ONLY the JSON.`;

    const { text } = await generateText({
      model: openai("gpt-4o-mini"), // Use mini for cost efficiency
      prompt,
      temperature: 0.3,
    });

    try {
      // Extract JSON from response (handle markdown code blocks)
      let jsonStr = text.trim();

      // Remove markdown code blocks if present
      if (jsonStr.startsWith("```")) {
        const lines = jsonStr.split("\n");
        lines.shift(); // Remove first line (```json or ```)
        if (lines[lines.length - 1].trim() === "```") {
          lines.pop(); // Remove last line (```)
        }
        jsonStr = lines.join("\n");
      }

      // Try to find JSON object
      const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        jsonStr = jsonMatch[0];
      }

      const parsed = JSON.parse(jsonStr);

      // Validate structure
      const locales = ["es", "fr", "de", "ja", "zh"];
      const results: Record<string, Record<string, string>> = {};

      for (const locale of locales) {
        results[locale] = {};
        // Get translations from parsed response
        if (parsed[locale] && typeof parsed[locale] === "object") {
          results[locale] = parsed[locale];
        }

        // Ensure all translations have values (fill missing ones)
        for (const t of translations) {
          if (!results[locale][t.en] || results[locale][t.en].trim() === "") {
            // If translation is missing or empty, try to get it or leave empty
            // Don't set empty string - let it be undefined so we don't overwrite
            if (results[locale][t.en] === undefined) {
              results[locale][t.en] = "";
            }
          }
        }
      }

      return Response.json({ translations: results });
    } catch (e) {
      console.error("Failed to parse translation response:", e);
      console.error("Raw response text:", text.substring(0, 500));

      // Return error instead of empty results - let the client handle retry
      return Response.json(
        {
          error: "Failed to parse translation response",
          details: e instanceof Error ? e.message : "Unknown error",
        },
        { status: 500 }
      );
    }
  } catch (error: unknown) {
    console.error("Translation API error:", error);
    const err = error as { message: string };
    return Response.json(
      { error: err.message || "Translation failed" },
      { status: 500 }
    );
  }
}
