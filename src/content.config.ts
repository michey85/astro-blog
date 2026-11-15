import { SITE } from "@config";
import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

// Pages CMS may save an empty string or null for a field left blank;
// treat both as "not set".
const blank = (v: unknown) =>
  (typeof v === "string" && v.trim() === "") || v === null ? undefined : v;

// Tolerate a file path or file name stored instead of the bare slug
// ("src/content/rubrics/yoga.md" → "yoga").
const rubricSlug = (v: string) =>
  v.trim().split("/").pop()!.replace(/\.md$/, "");

const blog = defineCollection({
  loader: glob({ pattern: "**/[^_]*.md", base: "./src/content/blog" }),
  schema: ({ image }) =>
    z
      .object({
        // Blank author → site author.
        author: z.preprocess(blank, z.string().default(SITE.author)),
        pubDatetime: z.date(),
        modDatetime: z.date().optional().nullable(),
        title: z.string(),
        featured: z.boolean().optional(),
        draft: z.boolean().optional(),
        tags: z.array(z.string()).default(["others"]),
        // Rubric slugs, picked in Pages CMS from the "rubrics" collection.
        // Kept as plain strings (not reference()) so that deleting a rubric
        // still used by a post doesn't fail the build; see utils/rubrics.ts.
        rubrics: z.preprocess(
          blank,
          z.array(z.string().transform(rubricSlug)).default([])
        ),
        ogImage: z.preprocess(
          blank,
          image()
            .refine(img => img.width >= 1200 && img.height >= 630, {
              error: "OpenGraph image must be at least 1200 X 630 pixels!",
            })
            .or(z.string())
            .optional()
        ),
        featuredImage: z.preprocess(blank, image().optional()),
        featuredImageAlt: z.string().optional(),
        // Blank description → meta tags fall back to the site description.
        description: z.preprocess(blank, z.string().optional()),
        canonicalURL: z.string().optional(),
      })
      .refine(data => !data.featuredImage || data.featuredImageAlt?.trim(), {
        error: "featuredImageAlt is required when featuredImage is set",
        path: ["featuredImageAlt"],
      }),
});

const pages = defineCollection({
  loader: glob({ pattern: "**/[^_]*.md", base: "./src/content/pages" }),
  schema: z.object({
    title: z.string(),
    description: z.preprocess(blank, z.string().optional()),
    draft: z.boolean().optional(),
    showInMenu: z.boolean().optional(),
    menuLabel: z.string().optional(),
    menuOrder: z.number().default(100),
  }),
});

// The `slug` frontmatter field (set in Pages CMS) becomes the entry id,
// i.e. the URL: /rubrics/<slug>/.
const rubrics = defineCollection({
  loader: glob({ pattern: "**/[^_]*.md", base: "./src/content/rubrics" }),
  schema: z.object({
    title: z.string().trim().min(1),
    description: z.preprocess(blank, z.string().optional()),
    showInMenu: z.preprocess(blank, z.boolean().default(true)),
    menuOrder: z.preprocess(blank, z.number().default(100)),
  }),
});

export const collections = { blog, pages, rubrics };
