import type { Site, SocialObjects } from "./types";
import settings from "./data/settings.json"; // editable via Pages CMS ("Site settings")

export const SITE: Site = {
  website: "https://astro-paper.pages.dev/", // replace this with your deployed domain
  author: "Sat Naing",
  desc: "A minimal, responsive and SEO-friendly Astro blog theme.",
  title: settings.title,
  ogImage: "astropaper-og.jpg",
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

export const SOCIALS: SocialObjects = (
  settings.socials as { name: SocialObjects[number]["name"]; href: string }[]
)
  .filter(social => social.name && social.href)
  .map(social => ({
    name: social.name,
    href: social.href,
    linkTitle:
      social.name === "Mail"
        ? `Send an email to ${SITE.title}`
        : `${SITE.title} on ${social.name}`,
    active: true,
  }));
