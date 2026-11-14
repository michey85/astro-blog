import type { MarkdownInstance } from "astro";

// Elements that count as content even without any text inside.
const MEDIA_TAG = /<(img|picture|video|audio|iframe|svg|hr|table)\b/i;

/**
 * True when a markdown file renders to something visible. Checks the rendered
 * HTML rather than the source, so a file holding only frontmatter, an HTML
 * comment, `&nbsp;` or a stray hard break counts as empty.
 */
export default async function hasRenderedContent(
  markdown: Pick<MarkdownInstance<Record<string, unknown>>, "compiledContent">
): Promise<boolean> {
  const html = (await markdown.compiledContent()).replace(
    /<!--[\s\S]*?-->/g,
    ""
  );
  if (MEDIA_TAG.test(html)) return true;

  const text = html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;|&#160;|&#xa0;| /gi, "")
    // a lone backslash is a hard break the editor left behind
    .replace(/\\/g, "")
    .trim();
  return text.length > 0;
}
