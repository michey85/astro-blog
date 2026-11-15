import { slugifyStr } from "@utils/slugify";
import Datetime from "./Datetime";
import type { CollectionEntry } from "astro:content";
import type { Thumbnail } from "@utils/getThumbnail";

export interface Props {
  href?: string;
  frontmatter: CollectionEntry<"blog">["data"];
  secHeading?: boolean;
  thumbnail?: Thumbnail;
}

export default function Card({
  href,
  frontmatter,
  secHeading = true,
  thumbnail,
}: Props) {
  const { title, pubDatetime, modDatetime, description } = frontmatter;

  const headerProps = {
    style: { viewTransitionName: slugifyStr(title) },
    className: "text-lg font-medium decoration-dashed hover:underline",
  };

  return (
    <li className="my-6 flex gap-4">
      {thumbnail && (
        <a href={href} tabIndex={-1} aria-hidden="true" className="shrink-0">
          <img
            src={thumbnail.src}
            srcSet={thumbnail.srcset}
            alt=""
            width={96}
            height={96}
            loading="lazy"
            decoding="async"
            className="h-20 w-20 rounded-md object-cover sm:h-24 sm:w-24"
          />
        </a>
      )}
      <div className="min-w-0">
        <a
          href={href}
          className="text-skin-accent inline-block text-lg font-medium decoration-dashed underline-offset-4 focus-visible:no-underline focus-visible:underline-offset-0"
        >
          {secHeading ? (
            <h2 {...headerProps}>{title}</h2>
          ) : (
            <h3 {...headerProps}>{title}</h3>
          )}
        </a>
        <Datetime pubDatetime={pubDatetime} modDatetime={modDatetime} />
        {description && <p>{description}</p>}
      </div>
    </li>
  );
}
