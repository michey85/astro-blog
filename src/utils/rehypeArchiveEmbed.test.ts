// Run with `npm test` (Node's built-in test runner; no network needed).
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Element, ElementContent, Root } from "hast";
import rehypeArchiveEmbed, {
  archiveIdFromUrl,
  layoutFromMetadata,
  type MetadataResponse,
} from "./rehypeArchiveEmbed.ts";

const BASE = "https://archive.org/details/";

test("archiveIdFromUrl accepts item URLs in the forms an editor may paste", () => {
  const cases: [string, string | null][] = [
    [`${BASE}Some_Item-1.2`, "Some_Item-1.2"],
    ["http://www.archive.org/details/item/", "item"],
    ["archive.org/embed/item?start=10", "item"],
    [`${BASE}item/file.mp3`, "item"],
    [`${BASE}item/page/n5/mode/2up`, "item"],
    // Pages CMS: escaped underscores, hard-break backslash after the URL
    [`${BASE}some\\_item\\_id`, "some_item_id"],
    [`${BASE}item\\`, "item"],
    [`${BASE}item%5C`, "item"],
    [BASE, null],
    ["https://archive.org/search?query=yoga", null],
    ["https://web.archive.org/web/2020/https://example.com", null],
    ["https://notarchive.org/details/item", null],
    [`https://example.com/?u=${BASE}item`, null],
  ];
  for (const [url, id] of cases) assert.equal(archiveIdFromUrl(url), id, url);
});

const original = (name: string, extra = {}) => ({
  name,
  source: "original",
  ...extra,
});
const derivative = (name: string, extra = {}) => ({
  name,
  source: "derivative",
  ...extra,
});

test("layoutFromMetadata skips items that have no player", () => {
  assert.equal(layoutFromMetadata({}), "skip");
  assert.equal(
    layoutFromMetadata({ metadata: { mediatype: "collection" } }),
    "skip"
  );
});

test("layoutFromMetadata counts recordings, not their derived formats", () => {
  const single = layoutFromMetadata({
    metadata: { mediatype: "audio", title: "Lecture" },
    files: [
      original("lecture_128kb.mp3"),
      derivative("lecture.mp3"),
      derivative("lecture.ogg"),
      derivative("lecture_64kb.mp3"),
    ],
  });
  assert.deepEqual(single, {
    title: "Lecture",
    layout: { kind: "audio", playlist: false },
  });

  const twoFormats = layoutFromMetadata({
    metadata: { mediatype: "audio" },
    files: [original("talk.flac"), original("talk.mp3")],
  });
  assert.deepEqual(twoFormats, {
    title: undefined,
    layout: { kind: "audio", playlist: false },
  });

  const album = layoutFromMetadata({
    metadata: { mediatype: "etree" },
    files: [original("01.flac"), original("02.flac"), derivative("01.mp3")],
  });
  assert.deepEqual(album, {
    title: undefined,
    layout: { kind: "audio", playlist: true },
  });
});

test("layoutFromMetadata takes the video ratio and playlist from the files", () => {
  assert.deepEqual(
    layoutFromMetadata({
      metadata: { mediatype: "movies" },
      files: [
        original("__ia_thumb.jpg"),
        original("film.avi"),
        derivative("film.mp4", { width: "640", height: "360", length: "596" }),
      ],
    }),
    {
      title: undefined,
      layout: { kind: "video", ratio: "640 / 360", playlist: false },
    }
  );

  assert.deepEqual(
    layoutFromMetadata({
      metadata: { mediatype: "movies" },
      files: [original("part1.mp4"), original("part2.mp4")],
    }),
    {
      title: undefined,
      layout: { kind: "video", ratio: "4 / 3", playlist: true },
    }
  );
});

test("layoutFromMetadata keeps only a usable title", () => {
  const titleOf = (title: unknown) => {
    const info = layoutFromMetadata({
      metadata: { mediatype: "texts", title },
    });
    return info === "skip" ? info : info.title;
  };
  assert.equal(titleOf(["First", "Second"]), "First");
  assert.equal(titleOf("  Padded "), "Padded");
  assert.equal(titleOf(""), undefined);
  assert.equal(titleOf([]), undefined);
  assert.equal(titleOf(42), undefined);
});

// --- the plugin itself, with the metadata API stubbed ---

const items: Record<string, MetadataResponse> = {
  "audio-one": {
    metadata: { mediatype: "audio", title: "One track" },
    files: [original("a.mp3")],
  },
  "pod--cast...x": {
    metadata: { mediatype: "audio", title: "" },
    files: [original("1.mp3"), original("2.mp3")],
  },
  portrait: {
    metadata: { mediatype: "movies", title: "Phone clip" },
    files: [
      original("clip.mp4", { width: "720", height: "1280", length: "9" }),
    ],
  },
  "some-collection": { metadata: { mediatype: "collection" } },
};

let requests: string[] = [];
globalThis.fetch = async input => {
  const id = String(input).split("/metadata/")[1];
  requests.push(id);
  if (id.startsWith("down")) return new Response("busy", { status: 503 });
  return Response.json(items[id] ?? {});
};

const text = (value: string): ElementContent => ({ type: "text", value });
const el = (
  tagName: string,
  children: ElementContent[],
  properties = {}
): Element => ({ type: "element", tagName, properties, children });
const link = (href: string, caption = href) =>
  el("a", [text(caption)], { href });

async function transform(...children: Element[]): Promise<Element[]> {
  const tree: Root = { type: "root", children };
  await rehypeArchiveEmbed()(tree);
  return tree.children as Element[];
}

test("a bare link becomes a player sized for the item", async () => {
  const [audio, video] = await transform(
    el("p", [link(`${BASE}audio-one`)]),
    // trailing hard break and whitespace left by the editor
    el("p", [link(`${BASE}portrait`), el("br", []), text("\n ")])
  );

  assert.equal(audio.tagName, "iframe");
  assert.deepEqual(audio.properties, {
    className: ["archive-embed", "archive-embed-audio"],
    src: "https://archive.org/embed/audio-one",
    title: "One track",
    loading: "lazy",
    allow: "fullscreen",
    allowFullScreen: true,
  });

  assert.deepEqual(video.properties.className, [
    "archive-embed",
    "archive-embed-video",
  ]);
  assert.equal(video.properties.style, "--archive-ratio: 720 / 1280");
});

test("an identifier that smartypants rewrote in the link text still embeds", async () => {
  const href = `${BASE}pod--cast...x`;
  const [fromLink, fromText] = await transform(
    el("p", [link(href, `${BASE}pod—cast…x`)]),
    el("p", [text("archive.org/details/pod—cast…x")])
  );

  for (const player of [fromLink, fromText]) {
    assert.deepEqual(player.properties.className, [
      "archive-embed",
      "archive-embed-audio",
      "archive-embed-playlist",
    ]);
    assert.equal(
      player.properties.src,
      "https://archive.org/embed/pod--cast...x?playlist=1"
    );
    // an empty title in the metadata falls back to the generic one
    assert.equal(player.properties.title, "Плеер Archive.org");
  }
});

test("links that are not a bare item URL stay links", async () => {
  requests = [];
  const paragraphs = [
    el("p", [link(`${BASE}audio-one`, "слушать")]),
    el("p", [text("см. "), link(`${BASE}audio-one`)]),
    el("p", [link(`${BASE}audio-one`), link(`${BASE}portrait`)]),
    el("p", [link("https://example.com/")]),
  ];
  const result = await transform(...paragraphs);

  assert.deepEqual(
    result.map(node => node.tagName),
    ["p", "p", "p", "p"]
  );
  assert.deepEqual(requests, []);
});

test("collections and unknown items stay links", async () => {
  const result = await transform(
    el("p", [link(`${BASE}some-collection`)]),
    el("p", [link(`${BASE}no-such-item`)])
  );
  assert.deepEqual(
    result.map(node => node.tagName),
    ["p", "p"]
  );
});

test("when the API keeps failing, the player is embedded in a generic frame", async () => {
  requests = [];
  const [player] = await transform(el("p", [link(`${BASE}down-item`)]));

  assert.deepEqual(requests, ["down-item", "down-item"]); // one retry
  assert.deepEqual(player.properties.className, [
    "archive-embed",
    "archive-embed-other",
  ]);
  assert.equal(player.properties.src, "https://archive.org/embed/down-item");
});

test("metadata requests are limited to four at a time", async () => {
  let active = 0;
  let peak = 0;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    peak = Math.max(peak, ++active);
    await new Promise(resolve => setTimeout(resolve, 10));
    active--;
    return Response.json(items["audio-one"]);
  };
  try {
    const paragraphs = Array.from({ length: 12 }, (_, i) =>
      el("p", [link(`${BASE}burst-${i}`)])
    );
    const result = await transform(...paragraphs);
    assert.ok(result.every(node => node.tagName === "iframe"));
    assert.equal(peak, 4);
  } finally {
    globalThis.fetch = realFetch;
  }
});
