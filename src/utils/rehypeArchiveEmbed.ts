import type { Element, ElementContent, Root, RootContent } from "hast";

/**
 * Turns an archive.org link that stands alone in a paragraph into an embedded
 * player, the way WordPress turns a pasted URL into an embed block:
 *
 *   https://archive.org/details/<identifier>
 *
 * The Internet Archive metadata API tells us what the item is, so the player
 * gets a fitting size (audio bar, video frame, book reader). A link with its
 * own text (`[слушать](https://archive.org/details/x)`) stays a link.
 */

type Layout =
  | { kind: "audio"; playlist: boolean }
  | { kind: "video"; ratio: string }
  | { kind: "book" }
  | { kind: "other" };

type ItemInfo = { title?: string; layout: Layout } | "skip";

const METADATA_TIMEOUT_MS = 8000;
const FALLBACK_TITLE = "Плеер Archive.org";

// Item types that have no player: the link is left as it is.
const NOT_EMBEDDABLE = new Set(["collection", "account", "web", "data"]);

const AUDIO_FILE = /\.(mp3|ogg|oga|opus|flac|wav|m4a|aiff?|shn)$/i;

const ITEM_URL =
  /^(?:https?:\/\/)?(?:www\.)?archive\.org\/(?:details|embed)\/([a-z0-9][a-z0-9._-]*)(?:[/?#].*)?$/i;

/** Item identifier from an archive.org details/embed URL, or null. */
export function archiveIdFromUrl(url: string): string | null {
  // The CMS editor may escape underscores in a pasted URL (`some\_id`) or
  // leave a hard-break backslash right after it; neither is part of the URL.
  const match = ITEM_URL.exec(url.trim().replace(/\\|%5C/gi, ""));
  return match ? match[1] : null;
}

type MetadataFile = {
  name?: string;
  length?: string;
  width?: string;
  height?: string;
};

type MetadataResponse = {
  metadata?: { mediatype?: string; title?: string | string[] };
  files?: MetadataFile[];
};

/** Picks the player layout for an item described by the metadata API. */
export function layoutFromMetadata(data: MetadataResponse): ItemInfo {
  const mediatype = data.metadata?.mediatype;
  // The API answers `{}` for an identifier that does not exist.
  if (!mediatype || NOT_EMBEDDABLE.has(mediatype)) return "skip";

  const rawTitle = data.metadata?.title;
  const title = Array.isArray(rawTitle) ? rawTitle[0] : rawTitle;
  const files = data.files ?? [];

  if (mediatype === "audio" || mediatype === "etree") {
    // One track comes in several formats (x.flac, x.mp3, x.ogg): count it once.
    const tracks = new Set(
      files
        .map(file => file.name ?? "")
        .filter(name => AUDIO_FILE.test(name))
        .map(name => name.replace(AUDIO_FILE, ""))
    );
    return { title, layout: { kind: "audio", playlist: tracks.size > 1 } };
  }

  if (mediatype === "movies") {
    // Video files carry a duration; stills (thumbnails) do not.
    const sized = files.find(
      file => file.length && +file.width! > 0 && +file.height! > 0
    );
    const ratio = sized ? `${+sized.width!} / ${+sized.height!}` : "4 / 3";
    return { title, layout: { kind: "video", ratio } };
  }

  if (mediatype === "texts") return { title, layout: { kind: "book" } };

  return { title, layout: { kind: "other" } };
}

const cache = new Map<string, Promise<ItemInfo>>();

function getItemInfo(id: string): Promise<ItemInfo> {
  let info = cache.get(id);
  if (!info) {
    info = fetchItemInfo(id);
    cache.set(id, info);
  }
  return info;
}

async function fetchItemInfo(id: string): Promise<ItemInfo> {
  try {
    const response = await fetch(`https://archive.org/metadata/${id}`, {
      signal: AbortSignal.timeout(METADATA_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const info = layoutFromMetadata(
      (await response.json()) as MetadataResponse
    );
    if (info === "skip") {
      warn(`"${id}" не найден или не имеет плеера — ссылка оставлена как есть`);
    }
    return info;
  } catch (error) {
    // archive.org is unreachable: still embed, in a generic frame, and let the
    // next render (dev server) ask again.
    cache.delete(id);
    warn(
      `не удалось получить сведения о "${id}" (${(error as Error).message}) — ` +
        `плеер вставлен в стандартном размере`
    );
    return { layout: { kind: "other" } };
  }
}

function warn(message: string) {
  console.warn(`[archive-embed] ${message}`);
}

function textOf(node: ElementContent): string {
  if (node.type === "text") return node.value;
  if (node.type === "element") return node.children.map(textOf).join("");
  return "";
}

/** Identifier when the paragraph holds nothing but a bare archive.org URL. */
function embedIdOf(paragraph: Element): string | null {
  const content = paragraph.children.filter(
    child =>
      !(child.type === "text" && child.value.trim() === "") &&
      !(child.type === "element" && child.tagName === "br")
  );
  if (content.length !== 1) return null;

  const [only] = content;
  if (only.type === "text") return archiveIdFromUrl(only.value);
  if (only.type !== "element" || only.tagName !== "a") return null;

  const href = only.properties.href;
  const id = typeof href === "string" ? archiveIdFromUrl(href) : null;
  // A link with a caption of its own is a regular link, not an embed.
  return id && archiveIdFromUrl(textOf(only)) === id ? id : null;
}

function playerElement(id: string, info: Exclude<ItemInfo, "skip">): Element {
  const { layout } = info;
  const playlist = layout.kind === "audio" && layout.playlist;
  const modifier = playlist ? "playlist" : layout.kind;

  return {
    type: "element",
    tagName: "iframe",
    properties: {
      className: ["archive-embed", `archive-embed-${modifier}`],
      src: `https://archive.org/embed/${id}${playlist ? "?playlist=1" : ""}`,
      title: info.title ?? FALLBACK_TITLE,
      loading: "lazy",
      allow: "fullscreen",
      allowFullScreen: true,
      ...(layout.kind === "video" && {
        style: `aspect-ratio: ${layout.ratio}`,
      }),
    },
    children: [],
  };
}

export default function rehypeArchiveEmbed() {
  return async (tree: Root) => {
    const jobs: Promise<void>[] = [];

    const walk = (parent: Root | Element) => {
      parent.children.forEach((node: RootContent, index: number) => {
        if (node.type !== "element") return;
        const id = node.tagName === "p" ? embedIdOf(node) : null;
        if (!id) return walk(node);

        jobs.push(
          getItemInfo(id).then(info => {
            if (info !== "skip") {
              parent.children[index] = playerElement(id, info);
            }
          })
        );
      });
    };

    walk(tree);
    await Promise.all(jobs);
  };
}
