import { getCollection, type CollectionEntry } from "astro:content";
import getSortedPosts from "./getSortedPosts";

export type Rubric = CollectionEntry<"rubrics">;

/** All rubrics in menu order (then by title). */
export const getRubrics = async (): Promise<Rubric[]> =>
  (await getCollection("rubrics")).sort(
    (a, b) =>
      a.data.menuOrder - b.data.menuOrder ||
      a.data.title.localeCompare(b.data.title)
  );

/** Published posts of a rubric, newest first. */
export const getPostsByRubric = (
  posts: CollectionEntry<"blog">[],
  rubricId: string
) => getSortedPosts(posts.filter(post => post.data.rubrics.includes(rubricId)));

/**
 * Rubrics of a post, in menu order. A slug that no longer matches a rubric
 * (deleted or renamed in the CMS) is skipped with a build warning.
 */
export const getPostRubrics = (
  post: CollectionEntry<"blog">,
  rubrics: Rubric[]
) => {
  const known = new Set(rubrics.map(rubric => rubric.id));
  for (const slug of post.data.rubrics) {
    if (!known.has(slug)) {
      // eslint-disable-next-line no-console
      console.warn(
        `[rubrics] Post "${post.id}" refers to unknown rubric "${slug}" — ignored`
      );
    }
  }
  return rubrics.filter(rubric => post.data.rubrics.includes(rubric.id));
};
