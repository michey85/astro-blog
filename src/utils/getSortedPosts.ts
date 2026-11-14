import type { CollectionEntry } from "astro:content";
import postFilter from "./postFilter";

const getSortedPosts = (posts: CollectionEntry<"blog">[]) => {
  return posts.filter(postFilter).sort(
    (a, b) =>
      Math.floor(
        new Date(b.data.modDatetime ?? b.data.pubDatetime).getTime() / 1000
      ) -
        Math.floor(
          new Date(a.data.modDatetime ?? a.data.pubDatetime).getTime() / 1000
        ) ||
      // Same date: order by id so the result doesn't depend on file order
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
};

export default getSortedPosts;
