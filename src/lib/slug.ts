/**
 * Profile slugs.
 *
 * Georgian has no case and no Latin equivalent in a URL, so a display name has
 * to be transliterated rather than lowercased. The mapping below is the
 * ordinary national scheme; it does not have to be reversible, only stable and
 * readable, because the slug is an address and the display name is what people
 * actually read.
 */

const GEORGIAN_TO_LATIN: Record<string, string> = {
  ა: 'a', ბ: 'b', გ: 'g', დ: 'd', ე: 'e', ვ: 'v', ზ: 'z', თ: 't',
  ი: 'i', კ: 'k', ლ: 'l', მ: 'm', ნ: 'n', ო: 'o', პ: 'p', ჟ: 'zh',
  რ: 'r', ს: 's', ტ: 't', უ: 'u', ფ: 'p', ქ: 'k', ღ: 'gh', ყ: 'q',
  შ: 'sh', ჩ: 'ch', ც: 'ts', ძ: 'dz', წ: 'ts', ჭ: 'ch', ხ: 'kh',
  ჯ: 'j', ჰ: 'h',
};

export function transliterate(input: string): string {
  return [...input]
    .map((character) => GEORGIAN_TO_LATIN[character] ?? character)
    .join('');
}

/**
 * A URL-safe slug, or an empty string when nothing usable survives. The caller
 * decides what to do with that, because "give it a random name" is a policy
 * and not something this function should assume.
 */
export function slugify(input: string): string {
  return transliterate(input)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}
