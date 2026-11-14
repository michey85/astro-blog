import { getImage } from "astro:assets";
import type { CollectionEntry } from "astro:content";

export type Thumbnail = { src: string; srcset: string };

/** Rendered edge length (CSS px) of the square thumbnail box in Card. */
const THUMBNAIL_SIZE = 96;

/**
 * Builds an optimized thumbnail that fully covers a THUMBNAIL_SIZE square.
 * Astro's sharp service resizes by width only (height is ignored when both
 * are given), so pick the width that makes the image's *short* side equal
 * THUMBNAIL_SIZE; `object-cover` in Card then crops the long side.
 */
const getThumbnail = async (
  data: CollectionEntry<"blog">["data"]
): Promise<Thumbnail | undefined> => {
  if (!data.featuredImage) return undefined;

  const { width, height } = data.featuredImage;
  const coverWidth =
    width > height
      ? Math.round((THUMBNAIL_SIZE * width) / height)
      : THUMBNAIL_SIZE;

  const img = await getImage({
    src: data.featuredImage,
    width: coverWidth,
    densities: [1, 2],
    format: "webp",
  });

  return {
    src: img.src,
    srcset: img.srcSet.attribute,
  };
};

export default getThumbnail;
