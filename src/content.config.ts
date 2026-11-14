import { SITE } from "@config";
import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const blog = defineCollection({
  loader: glob({ pattern: "**/[^_]*.md", base: "./src/content/blog" }),
  schema: ({ image }) =>
    z
      .object({
        author: z.string().default(SITE.author),
        pubDatetime: z.date(),
        modDatetime: z.date().optional().nullable(),
        title: z.string(),
        featured: z.boolean().optional(),
        draft: z.boolean().optional(),
        tags: z.array(z.string()).default(["others"]),
        ogImage: image()
          .refine(img => img.width >= 1200 && img.height >= 630, {
            error: "OpenGraph image must be at least 1200 X 630 pixels!",
          })
          .or(z.string())
          .optional(),
        featuredImage: z.preprocess(
          v => (v === "" || v === null ? undefined : v),
          image().optional()
        ),
        featuredImageAlt: z.string().optional(),
        description: z.string(),
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
    description: z.string().optional(),
    draft: z.boolean().optional(),
    showInMenu: z.boolean().optional(),
    menuLabel: z.string().optional(),
    menuOrder: z.number().default(100),
  }),
});

export const collections = { blog, pages };
