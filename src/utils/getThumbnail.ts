import { getImage } from "astro:assets";
import type { CollectionEntry } from "astro:content";

export type Thumbnail = { src: string; srcset: string; alt: string };

/** Builds an optimized square-ish thumbnail for a post's featured image. */
const getThumbnail = async (
  data: CollectionEntry<"blog">["data"]
): Promise<Thumbnail | undefined> => {
  if (!data.featuredImage) return undefined;

  const img = await getImage({
    src: data.featuredImage,
    width: 96,
    height: 96,
    densities: [1, 2],
    format: "webp",
  });

  return {
    src: img.src,
    srcset: img.srcSet.attribute,
    alt: data.featuredImageAlt ?? "",
  };
};

export default getThumbnail;
