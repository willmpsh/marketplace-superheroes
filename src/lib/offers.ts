export type Offer = {
  id: string;
  slug: string;
  name: string;
};

/**
 * Maps a Facebook/AC campaign or sheet name to an offer slug by keyword match.
 * Campaign naming convention observed in the account: "JG - <Offer keyword> ...".
 */
const OFFER_KEYWORDS: Array<{ slug: string; keywords: string[] }> = [
  { slug: "glgp", keywords: ["glgp", "go live get paid", "whatnot"] },
  { slug: "kickstart", keywords: ["kickstart", "kks", "zero to profit", "ztp"] },
  { slug: "accelerate", keywords: ["accelerate", "acc "] },
  { slug: "elevate", keywords: ["elevate"] },
  { slug: "ascension", keywords: ["ascension", "asc "] },
  { slug: "amplify", keywords: ["amplify"] },
  { slug: "catalyst", keywords: ["catalyst"] },
  { slug: "ignite", keywords: ["ignite"] },
];

export function inferOfferSlug(name: string): string {
  const lower = name.toLowerCase();
  for (const { slug, keywords } of OFFER_KEYWORDS) {
    if (keywords.some((kw) => lower.includes(kw))) return slug;
  }
  return "other";
}
