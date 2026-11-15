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
 *
 * The result depends on that API answer, which Astro's content cache knows
 * nothing about, so the production build runs with `--force` (package.json):
 * every build renders the posts anew instead of reusing a player that was
 * laid out while archive.org was unreachable.
 */

type Layout =
  | { kind: "audio"; playlist: boolean }
  | { kind: "video"; ratio: string; playlist: boolean }
  | { kind: "book" }
  | { kind: "other" };

type ItemInfo = { title?: string; layout: Layout } | "skip";

const METADATA_TIMEOUT_MS = 8000;
const METADATA_ATTEMPTS = 2;
const RETRY_DELAY_MS = 1000;
// All posts render at once; keep archive.org from seeing a burst of requests.
const MAX_PARALLEL_REQUESTS = 4;
const FALLBACK_TITLE = "Плеер Archive.org";

// Item types that have no player: the link is left as it is.
const NOT_EMBEDDABLE = new Set(["collection", "account", "web", "data"]);

const AUDIO_FILE = /\.(mp3|ogg|oga|opus|flac|wav|m4a|aiff?|shn)$/i;
const VIDEO_FILE = /\.(mp4|m4v|mov|avi|mkv|mpe?g|ogv|webm|wmv|flv)$/i;

const ITEM_URL =
  /^(?:https?:\/\/)?(?:www\.)?archive\.org\/(?:details|embed)\/([a-z0-9][a-z0-9._-]*)(?:[/?#].*)?$/i;

/** Item identifier from an archive.org details/embed URL, or null. */
export function archiveIdFromUrl(url: string): string | null {
  // The CMS editor may escape underscores in a pasted URL (`some\_id`) or
  // leave a hard-break backslash right after it; neither is part of the URL.
  const match = ITEM_URL.exec(url.trim().replace(/\\|%5C/gi, ""));
  return match ? match[1] : null;
}

/** Same, for visible text: smartypants has turned `--` and `...` into — and …. */
function archiveIdFromText(text: string): string | null {
  return archiveIdFromUrl(text.replace(/—/g, "--").replace(/…/g, "..."));
}

type MetadataFile = {
  name?: string;
  source?: string;
  length?: string;
  width?: string;
  height?: string;
};

export type MetadataResponse = {
  metadata?: { mediatype?: string; title?: unknown };
  files?: MetadataFile[];
};

/**
 * How many recordings the uploader put into the item. Only originals count:
 * archive.org derives extra formats from each (x.ogg, x_64kb.mp3), and one
 * recording uploaded in two formats (x.flac + x.mp3) is still one.
 */
function countOriginals(files: MetadataFile[], pattern: RegExp): number {
  const names = files
    .filter(file => file.source === "original")
    .map(file => file.name ?? "")
    .filter(name => pattern.test(name))
    .map(name => name.replace(pattern, ""));
  return new Set(names).size;
}

/** Picks the player layout for an item described by the metadata API. */
export function layoutFromMetadata(data: MetadataResponse): ItemInfo {
  const mediatype = data.metadata?.mediatype;
  // The API answers `{}` for an identifier that does not exist.
  if (!mediatype || NOT_EMBEDDABLE.has(mediatype)) return "skip";

  const rawTitle: unknown = [data.metadata?.title].flat()[0];
  const title =
    typeof rawTitle === "string" && rawTitle.trim()
      ? rawTitle.trim()
      : undefined;
  const files = data.files ?? [];

  if (mediatype === "audio" || mediatype === "etree") {
    const playlist = countOriginals(files, AUDIO_FILE) > 1;
    return { title, layout: { kind: "audio", playlist } };
  }

  if (mediatype === "movies") {
    // Video files carry a duration; stills (thumbnails) do not.
    const sized = files.find(
      file => file.length && +file.width! > 0 && +file.height! > 0
    );
    const ratio = sized ? `${+sized.width!} / ${+sized.height!}` : "4 / 3";
    const playlist = countOriginals(files, VIDEO_FILE) > 1;
    return { title, layout: { kind: "video", ratio, playlist } };
  }

  if (mediatype === "texts") return { title, layout: { kind: "book" } };

  return { title, layout: { kind: "other" } };
}

let activeRequests = 0;
const requestQueue: (() => void)[] = [];

/** Runs `task` once one of the MAX_PARALLEL_REQUESTS slots is free. */
async function withRequestSlot<T>(task: () => Promise<T>): Promise<T> {
  if (activeRequests < MAX_PARALLEL_REQUESTS) activeRequests++;
  else await new Promise<void>(resolve => requestQueue.push(resolve));
  try {
    return await task();
  } finally {
    // Hand the slot straight to the next in line, if any.
    const next = requestQueue.shift();
    if (next) next();
    else activeRequests--;
  }
}

async function requestMetadata(id: string): Promise<MetadataResponse> {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(`https://archive.org/metadata/${id}`, {
        signal: AbortSignal.timeout(METADATA_TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return (await response.json()) as MetadataResponse;
    } catch (error) {
      if (attempt >= METADATA_ATTEMPTS) throw error;
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }
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
    const data = await withRequestSlot(() => requestMetadata(id));
    const info = layoutFromMetadata(data);
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
  if (only.type === "text") return archiveIdFromText(only.value);
  if (only.type !== "element" || only.tagName !== "a") return null;

  const href = only.properties.href;
  const id = typeof href === "string" ? archiveIdFromUrl(href) : null;
  // A link with a caption of its own is a regular link, not an embed.
  return id && archiveIdFromText(textOf(only)) === id ? id : null;
}

function playerElement(id: string, info: Exclude<ItemInfo, "skip">): Element {
  const { layout } = info;
  const playlist = "playlist" in layout && layout.playlist;

  return {
    type: "element",
    tagName: "iframe",
    properties: {
      className: [
        "archive-embed",
        `archive-embed-${layout.kind}`,
        ...(playlist ? ["archive-embed-playlist"] : []),
      ],
      src: `https://archive.org/embed/${id}${playlist ? "?playlist=1" : ""}`,
      title: info.title ?? FALLBACK_TITLE,
      loading: "lazy",
      allow: "fullscreen",
      allowFullScreen: true,
      ...(layout.kind === "video" && {
        style: `--archive-ratio: ${layout.ratio}`,
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
