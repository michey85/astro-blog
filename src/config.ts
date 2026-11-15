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

// Pages CMS saves cleared fields as "" (or null) — treat both as "not set".
const optionalText = <T extends z.ZodType>(schema: T) =>
  z.preprocess(
    v =>
      (typeof v === "string" && v.trim() === "") || v === null ? undefined : v,
    schema.optional()
  );

const analyticsSchema = z
  .object({
    yandexMetrikaId: optionalText(
      z
        .string()
        .trim()
        .regex(/^\d+$/, "Yandex Metrika ID must contain digits only")
    ),
    yandexWebvisor: z
      .boolean()
      .nullish()
      .transform(v => v ?? false),
    googleAnalyticsId: optionalText(
      z
        .string()
        .trim()
        .regex(/^G-[A-Z0-9]+$/, "Google Analytics ID must look like G-XXXXXXX")
    ),
    headCode: optionalText(z.string()),
    bodyCode: optionalText(z.string()),
  })
  .nullish()
  .transform(v => v ?? { yandexWebvisor: false });

// Optional public asset: a root-relative path or a full URL; empty → undefined.
const assetPath = (field: string, example: string) =>
  z
    .string()
    .trim()
    .nullish()
    // "//x.png" would be protocol-relative (host "x.png"); collapse to "/x.png".
    .transform(v => v?.replace(/^\/{2,}/, "/") || undefined)
    .refine(v => !v || v.startsWith("/") || /^https?:\/\//.test(v), {
      message: `Site settings: ${field} must be a path like ${example} or a full URL`,
    });

// http(s) origin only: no path, query, hash or credentials.
const isBareOrigin = (v: string) => {
  if (/[?#\s]/.test(v) || !URL.canParse(v)) return false;
  const u = new URL(v);
  return (
    /^https?:$/.test(u.protocol) &&
    u.pathname === "/" &&
    !u.username &&
    !u.password
  );
};

const faviconTypes: Record<string, string> = {
  svg: "image/svg+xml",
  png: "image/png",
  ico: "image/x-icon",
  webp: "image/webp",
};

const settingsSchema = z.object({
  analytics: analyticsSchema,
  title: z.string().trim().min(1, "Site settings: title must not be empty"),
  website: z
    .string()
    .trim()
    // .pages.yml has a looser regex for the same field (YAML can't import this).
    .refine(
      isBareOrigin,
      "Site settings: website must be a bare origin like https://example.com"
    )
    .transform(v => (v.endsWith("/") ? v : `${v}/`)),
  description: z
    .string()
    .trim()
    .min(1, "Site settings: description must not be empty"),
  author: z.string().trim().min(1, "Site settings: author must not be empty"),
  ogImage: assetPath("ogImage", "/og.jpg"),
  favicon: assetPath("favicon", "/favicon.png").transform(
    v => v ?? "/favicon.svg"
  ),
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

// MIME type for <link rel="icon">; undefined for unknown extensions.
export const FAVICON_TYPE: string | undefined =
  faviconTypes[
    SITE.favicon.split(/[?#]/)[0].split(".").pop()?.toLowerCase() ?? ""
  ];

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

// Counters / custom snippets from "Настройки сайта → Метрика и счётчики".
// Rendered only in production builds so local dev doesn't pollute stats.
export const ANALYTICS = settings.analytics;

export const SOCIALS: SocialObjects = settings.socials.map(social => ({
  name: social.name,
  href: social.href,
  linkTitle:
    social.name === "Mail"
      ? `Send an email to ${SITE.title}`
      : `${SITE.title} on ${social.name}`,
  active: social.active,
}));
