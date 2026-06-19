/**
 * Builds the Gemini image generation prompt.
 *
 * onImageText — if provided, ONLY these words appear as rendered text in the image.
 *               The caption is passed as background context only and must never appear as image text.
 * copy        — the social media caption, used only for thematic/visual inspiration.
 * style       — brand style instructions.
 */
export function buildImagePrompt(opts: {
  copy: string;
  onImageText?: string | null;
  styleInstructions?: string;
}): string {
  const { copy, onImageText, styleInstructions } = opts;

  if (onImageText) {
    return [
      "You are creating a social media graphic.",
      "",
      "=== TEXT TO RENDER IN THE IMAGE ===",
      "The ONLY words that may appear as visible text anywhere in this image are listed below.",
      "Spell every word letter-for-letter exactly as written. Do NOT change, add, or omit any word.",
      "Do NOT include any portion of the BACKGROUND CONTEXT section as visible text.",
      "",
      onImageText,
      "",
      "=== BACKGROUND CONTEXT (for visual theme only — do NOT render as text) ===",
      copy,
      styleInstructions ? `\n=== STYLE DIRECTION ===\n${styleInstructions}` : "",
    ].filter(s => s !== undefined).join("\n");
  }

  return [
    "You are creating a social media graphic.",
    "IMPORTANT: Do NOT include any visible text, words, letters, or numbers anywhere in this image. Pure visuals only.",
    "",
    "=== VISUAL THEME (do not render as text) ===",
    copy,
    styleInstructions ? `\n=== STYLE DIRECTION ===\n${styleInstructions}` : "",
  ].filter(s => s !== undefined).join("\n");
}
