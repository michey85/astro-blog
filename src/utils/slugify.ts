import { slug as slugger } from "github-slugger";

// Russian → Latin transliteration so slugs (tag URLs, OG image paths) stay ASCII
const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "e",
  ж: "zh",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "kh",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "shch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
};

const transliterate = (str: string) =>
  str.toLowerCase().replace(/[а-яё]/g, ch => CYRILLIC_TO_LATIN[ch] ?? ch);

export const slugifyStr = (str: string) => slugger(transliterate(str));

export const slugifyAll = (arr: string[]) => arr.map(str => slugifyStr(str));
