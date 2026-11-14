import { SITE } from "@config";
import { defineCollection, z } from "astro:content";

const blog = defineCollection({
  type: "content",
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
            message: "OpenGraph image must be at least 1200 X 630 pixels!",
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
        message: "featuredImageAlt is required when featuredImage is set",
        path: ["featuredImageAlt"],
      }),
});

const pages = defineCollection({
  type: "content",
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
