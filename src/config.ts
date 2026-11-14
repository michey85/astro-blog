import { z } from "astro/zod";
import type { Site, SocialObjects } from "./types";
import socialIcons from "./assets/socialIcons";
import rawSettings from "./data/settings.json"; // editable via Pages CMS ("Site settings")

// Validate CMS output so a bad edit fails the build with a clear message
// instead of crashing or silently rendering broken markup.
const socialNames = Object.keys(socialIcons) as [
  keyof typeof socialIcons,
  ...(keyof typeof socialIcons)[],
];

const settingsSchema = z.object({
  title: z.string().trim().min(1, "Site settings: title must not be empty"),
  website: z
    .string()
    .trim()
    .regex(
      /^https?:\/\/[^/\s]+\/?$/,
      "Site settings: website must be a bare origin like https://example.com"
    )
    .transform(v => (v.endsWith("/") ? v : `${v}/`)),
  description: z
    .string()
    .trim()
    .min(1, "Site settings: description must not be empty"),
  author: z.string().trim().min(1, "Site settings: author must not be empty"),
  ogImage: z
    .string()
    .trim()
    .nullish()
    .transform(v => v || undefined)
    .refine(v => !v || v.startsWith("/") || /^https?:\/\//.test(v), {
      message:
        "Site settings: ogImage must be a path like /og.jpg or a full URL",
    }),
  favicon: z
    .string()
    .trim()
    .nullish()
    .transform(v => v || "/favicon.svg")
    .refine(v => v.startsWith("/") || /^https?:\/\//.test(v), {
      message:
        "Site settings: favicon must be a path like /favicon.png or a full URL",
    }),
  socials: z
    .array(
      z.object({
        name: z.enum(socialNames),
        href: z.string().trim().min(1),
        active: z
          .boolean()
          .nullish()
          .transform(v => v ?? true),
      })
    )
    .nullish()
    .transform(v => v ?? []),
});

const parsedSettings = settingsSchema.safeParse(rawSettings);
if (!parsedSettings.success) {
  throw new Error(
    `Invalid src/data/settings.json:\n${parsedSettings.error.issues
      .map(i => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n")}`
  );
}
const settings = parsedSettings.data;

export const SITE: Site = {
  website: settings.website, // canonical, og:image, sitemap, RSS
  author: settings.author,
  desc: settings.description,
  title: settings.title,
  favicon: settings.favicon,
  ogImage: settings.ogImage, // empty → auto-generated /og.png
  lightAndDarkMode: true,
  postPerPage: 10,
  scheduledPostMargin: 15 * 60 * 1000, // 15 minutes
};

export const LOCALE = {
  lang: "ru", // html lang code. Set this empty and default will be "en"
  langTag: ["ru-RU"], // BCP 47 Language Tags. Set this empty [] to use the environment default
} as const;

export const LOGO_IMAGE = {
  enable: false,
  svg: true,
  width: 216,
  height: 46,
};

export const SOCIALS: SocialObjects = settings.socials.map(social => ({
  name: social.name,
  href: social.href,
  linkTitle:
    social.name === "Mail"
      ? `Send an email to ${SITE.title}`
      : `${SITE.title} on ${social.name}`,
  active: social.active,
}));
