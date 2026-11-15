import { getCollection, type CollectionEntry } from "astro:content";
import byMenuOrder from "./byMenuOrder";
import getPageNumbers from "./getPageNumbers";
import getSortedPosts from "./getSortedPosts";

export type Rubric = CollectionEntry<"rubrics">;

/** All rubrics in menu order (then by title). */
export const getRubrics = async (): Promise<Rubric[]> =>
  (await getCollection("rubrics")).sort(byMenuOrder);

/** Published posts of a rubric, newest first. */
export const getPostsByRubric = (
  posts: CollectionEntry<"blog">[],
  rubricId: string
) => getSortedPosts(posts.filter(post => post.data.rubrics.includes(rubricId)));

/**
 * Every rubric with its posts and page numbers, for `getStaticPaths` of the
 * rubric routes. Page 1 is `/rubrics/<slug>/`; numbered routes start at 2.
 */
export const getRubricPages = async () => {
  const posts = await getCollection("blog");

  return (await getRubrics()).map(rubric => {
    const rubricPosts = getPostsByRubric(posts, rubric.id);
    return {
      rubric,
      rubricPosts,
      pageNumbers: getPageNumbers(rubricPosts.length),
    };
  });
};

/**
 * Rubrics of a post, in menu order. A slug that no longer matches a rubric
 * (deleted or renamed in the CMS) is skipped; see `warnUnknownRubrics`.
 */
export const getPostRubrics = (
  post: CollectionEntry<"blog">,
  rubrics: Rubric[]
) => rubrics.filter(rubric => post.data.rubrics.includes(rubric.id));

/**
 * One build warning listing every rubric slug used by posts that matches no
 * rubric, with the posts that use it.
 */
export const warnUnknownRubrics = (
  posts: CollectionEntry<"blog">[],
  rubrics: Rubric[]
) => {
  const known = new Set(rubrics.map(rubric => rubric.id));
  const unknown = new Map<string, string[]>();
  for (const post of posts) {
    for (const slug of post.data.rubrics) {
      if (!known.has(slug))
        unknown.set(slug, [...(unknown.get(slug) ?? []), post.id]);
    }
  }
  if (unknown.size === 0) return;

  const lines = [...unknown].map(
    ([slug, ids]) => `  "${slug}" — ${ids.join(", ")}`
  );
  // eslint-disable-next-line no-console
  console.warn(
    `[rubrics] Posts refer to unknown rubrics (ignored):\n${lines.join("\n")}`
  );
};
