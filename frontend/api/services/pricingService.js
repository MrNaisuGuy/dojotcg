import { normalizeValue } from "../utils/normalizeCard.js";

const POKEMON_JP_MULTIPLIERS = {
  bulk: 0.50,
  regularRare: 0.60,
  exVOrGX: 0.65,
  fullArt: 0.75,
  altArt: 0.90,
  trainerWaifu: 1.10,
  vintage: 1.20,
  trophyOrExclusive: 1.50,
};
const POKEMON_KR_MULTIPLIERS_FROM_JP = {
  bulk: 0.20,
  regularRare: 0.25,
  exVOrGX: 0.30,
  fullArt: 0.35,
  altArt: 0.45,
  trainerWaifu: 0.60,
  vintage: 0.65,
  trophyOrExclusive: 0.75,
};
const POKEMON_TRAINER_WAIFU_NAMES =
  /lillie|marnie|iono|rosa|erika|misty|cynthia|jessie|serena|lusamine|skyla|bianca|elesa|nessa|sabrina|gardenia|candice|whitney|jasmine|clair|flannery|roxanne|winona|dawn|may/i;
const ONE_PIECE_JP_MULTIPLIERS = {
  bulk: 0.55,
  lowRare: 0.65,
  sr: 0.70,
  sec: 0.85,
  altArt: 0.95,
  popularAltArt: 1.10,
  manga: 1.25,
  tournamentPromo: 1.50,
};
const ONE_PIECE_KR_MULTIPLIERS_FROM_JP = {
  bulk: 0.25,
  lowRare: 0.30,
  sr: 0.35,
  sec: 0.45,
  altArt: 0.50,
  popularAltArt: 0.60,
  manga: 0.75,
  tournamentPromo: 0.80,
};
const ONE_PIECE_CHARACTER_MULTIPLIERS = {
  generic: 0.90,
  normal: 1.00,
  strawHat: 1.15,
  popular: 1.25,
  waifuOrIconic: 1.35,
  gear5OrTopChase: 1.50,
};
const MTG_JP_MULTIPLIERS = {
  normalBulk: 0.90,
  normalPlayable: 1.05,
  commanderStaple: 1.10,
  modernLegacyVintageStaple: 1.15,
  foilPlayable: 1.25,
  premiumVariant: 1.30,
  oldRareOrScarce: 1.35,
};
const MTG_KR_MULTIPLIERS = {
  normalBulk: 0.95,
  normalPlayable: 1.10,
  commanderStaple: 1.20,
  modernLegacyVintageStaple: 1.35,
  foilPlayable: 1.50,
  premiumVariant: 1.60,
  oldRareOrScarce: 1.75,
};

function roundPrice(price) {
  return typeof price === "number" && Number.isFinite(price) ? Math.round(price * 100) / 100 : null;
}

function getUsableEnglishPrice(candidate) {
  return typeof candidate.lowestPrice === "number" && Number.isFinite(candidate.lowestPrice) && candidate.lowestPrice > 0
    ? candidate.lowestPrice
    : null;
}

function getNumericPathValue(source, path) {
  return path.reduce((value, key) => value?.[key], source);
}

function getExactRegionalPrice(candidate, paths) {
  for (const path of paths) {
    const value = getNumericPathValue(candidate, path);

    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      return value;
    }
  }

  return null;
}

function getCandidateSearchText(candidate) {
  return [
    candidate.name,
    candidate.set,
    candidate.rarity,
    candidate.cardType,
    candidate.priceVariant,
  ]
    .filter(Boolean)
    .join(" ");
}

function getRegionalEstimateBase(candidate) {
  const englishPrice = getUsableEnglishPrice(candidate);

  return {
    game: candidate.game,
    us: roundPrice(englishPrice),
    jp: null,
    kr: null,
    basePrice: roundPrice(englishPrice),
    baseEnglishPrice: roundPrice(englishPrice),
    estimatedJapanesePrice: null,
    estimatedKoreanPrice: null,
    pricingSource: englishPrice ? "english_market_price_with_regional_estimates" : "missing_english_price",
    confidence: "low",
    pricingNotes: englishPrice
      ? "Calculated regional estimates are not market prices. Exact API or sold-listing regional prices should override estimates."
      : "No regional estimate returned because the English/base price is missing, zero, or not numeric.",
  };
}

function getPokemonSearchText(candidate) {
  return [
    candidate.name,
    candidate.set,
    candidate.rarity,
    candidate.cardType,
    candidate.priceVariant,
  ]
    .filter(Boolean)
    .join(" ");
}

function getPokemonReleaseYear(candidate) {
  const releaseDate = candidate.releaseDate;
  const releaseYear = releaseDate ? Number(String(releaseDate).slice(0, 4)) : null;
  const copyrightYear = Number(candidate.copyrightYear);

  return Number.isFinite(releaseYear) ? releaseYear : Number.isFinite(copyrightYear) ? copyrightYear : null;
}

export function getPokemonPriceTier(candidate) {
  const searchText = getPokemonSearchText(candidate);
  const releaseYear = getPokemonReleaseYear(candidate);
  const isTrainer = /trainer|supporter/i.test(searchText);

  if (/trophy|championship|world championship|prize card|staff|pokemon center|exclusive/i.test(searchText)) {
    return "trophyOrExclusive";
  }

  if (releaseYear && releaseYear <= 2003) {
    return "vintage";
  }

  if (isTrainer && POKEMON_TRAINER_WAIFU_NAMES.test(candidate.name || searchText)) {
    return "trainerWaifu";
  }

  if (/special illustration rare|illustration rare|alternate art|alt art|special art rare|\bsar\b/i.test(searchText)) {
    return "altArt";
  }

  if (/full art|ultra rare|secret rare|rainbow rare|hyper rare|gold rare/i.test(searchText)) {
    return "fullArt";
  }

  if (/\b(ex|v|gx|vmax|vstar)\b|rare holo (ex|v|gx|vmax|vstar)/i.test(searchText)) {
    return "exVOrGX";
  }

  if (/rare|holo/i.test(searchText)) {
    return "regularRare";
  }

  return "bulk";
}

function estimatePokemonRegionalPrices(candidate) {
  const englishPrice = getUsableEnglishPrice(candidate);

  if (!englishPrice) {
    return getRegionalEstimateBase(candidate);
  }

  const tier = getPokemonPriceTier(candidate);
  const jpMultiplier = POKEMON_JP_MULTIPLIERS[tier];
  const koreanLiquidityMultiplier = POKEMON_KR_MULTIPLIERS_FROM_JP[tier];
  const jpEstimate = englishPrice * jpMultiplier;
  const krEstimate = jpEstimate * koreanLiquidityMultiplier;

  return {
    game: candidate.game,
    us: roundPrice(englishPrice),
    jp: roundPrice(jpEstimate),
    kr: roundPrice(krEstimate),
    basePrice: roundPrice(englishPrice),
    baseEnglishPrice: roundPrice(englishPrice),
    estimatedJapanesePrice: roundPrice(jpEstimate),
    estimatedKoreanPrice: roundPrice(krEstimate),
    pricingSource: "english_market_price_with_pokemon_regional_estimate",
    confidence: "low",
    pricingNotes:
      "Pokemon Japanese estimates use rarity/collector-demand multipliers, and Korean estimates are liquidity-discounted from Japanese. Exact API or sold-listing regional prices should override estimates.",
    priceTier: tier,
    jpMultiplier,
    koreanLiquidityMultiplier,
  };
}

function getOnePieceSearchText(candidate) {
  return getCandidateSearchText(candidate);
}

function getOnePieceCharacterTier(candidate) {
  const name = normalizeValue(candidate.name);
  const searchText = normalizeValue(getOnePieceSearchText(candidate));

  if (/gear 5|nika|manga luffy|monkey d luffy/.test(searchText) && /manga|wanted|special|parallel|alt/.test(searchText)) {
    return "gear5OrTopChase";
  }

  if (/nami|boa hancock|hancock|uta|yamato|robin|nico robin|perona|rebecca|vivi|shanks|trafalgar law|ace|portgas d ace/.test(name)) {
    return "waifuOrIconic";
  }

  if (/zoro|roronoa zoro|sanji|trafalgar law|law|ace|sabo|shanks|mihawk|kid|eustass kid|kaido|boa hancock/.test(name)) {
    return "popular";
  }

  if (/luffy|zoro|nami|usopp|sanji|chopper|robin|franky|brook|jinbe|jimbei/.test(name)) {
    return "strawHat";
  }

  if (/event|stage|don/.test(searchText)) {
    return "generic";
  }

  return "normal";
}

function getOnePiecePriceTier(candidate, characterTier = getOnePieceCharacterTier(candidate)) {
  const searchText = getOnePieceSearchText(candidate);

  if (/tournament|championship|winner|serial|treasure cup|store championship|flagship|promo/i.test(searchText)) {
    return "tournamentPromo";
  }

  if (/manga/i.test(searchText)) {
    return "manga";
  }

  if (/alternate art|alt art|parallel|special art|wanted/i.test(searchText)) {
    return ["popular", "waifuOrIconic", "gear5OrTopChase"].includes(characterTier) ? "popularAltArt" : "altArt";
  }

  if (/\bsec\b|secret/i.test(searchText)) {
    return "sec";
  }

  if (/\bsr\b|super rare/i.test(searchText)) {
    return "sr";
  }

  if (/\br\b|rare|leader|character/i.test(searchText)) {
    return "lowRare";
  }

  return "bulk";
}

function estimateOnePieceRegionalPrices(candidate) {
  const englishPrice = getUsableEnglishPrice(candidate);

  if (!englishPrice) {
    return getRegionalEstimateBase(candidate);
  }

  const characterTier = getOnePieceCharacterTier(candidate);
  const priceTier = getOnePiecePriceTier(candidate, characterTier);
  const jpMultiplier = ONE_PIECE_JP_MULTIPLIERS[priceTier];
  const characterMultiplier = ONE_PIECE_CHARACTER_MULTIPLIERS[characterTier];
  const koreanLiquidityMultiplier = ONE_PIECE_KR_MULTIPLIERS_FROM_JP[priceTier];
  const calculatedJpEstimate = englishPrice * jpMultiplier * characterMultiplier;
  const calculatedKrEstimate = calculatedJpEstimate * koreanLiquidityMultiplier;
  const exactJapanesePrice = getExactRegionalPrice(candidate, [
    ["price_jp"],
    ["japanesePrice"],
    ["regionalMarketPrices", "jp"],
  ]);
  const exactKoreanPrice = getExactRegionalPrice(candidate, [
    ["price_kr"],
    ["koreanPrice"],
    ["regionalMarketPrices", "kr"],
  ]);
  const jpEstimate = exactJapanesePrice ?? calculatedJpEstimate;
  const krEstimate = exactKoreanPrice ?? calculatedKrEstimate;
  const hasExactRegionalPrice = Boolean(exactJapanesePrice || exactKoreanPrice);

  return {
    game: candidate.game,
    us: roundPrice(englishPrice),
    jp: roundPrice(jpEstimate),
    kr: roundPrice(krEstimate),
    basePrice: roundPrice(englishPrice),
    baseEnglishPrice: roundPrice(englishPrice),
    estimatedJapanesePrice: roundPrice(jpEstimate),
    estimatedKoreanPrice: roundPrice(krEstimate),
    pricingSource: hasExactRegionalPrice
      ? "regional_api_market_price_with_estimate_fallback"
      : "english_market_price_with_one_piece_regional_estimate",
    confidence: hasExactRegionalPrice ? "high" : "low",
    pricingNotes:
      "One Piece Japanese estimates use rarity and character-demand multipliers. One Piece Korean is liquidity-discounted from Japanese, not directly from English. Exact API or sold-listing regional prices should override estimates.",
    priceTier,
    characterTier,
    jpMultiplier,
    characterMultiplier,
    koreanLiquidityMultiplier,
  };
}

function getMtgReleaseYear(candidate) {
  const releaseDate = candidate.releaseDate || candidate.releasedAt;
  const releaseYear = releaseDate ? Number(String(releaseDate).slice(0, 4)) : null;

  return Number.isFinite(releaseYear) ? releaseYear : null;
}

function getMtgPriceTier(candidate) {
  const searchText = getCandidateSearchText(candidate);
  const releaseYear = getMtgReleaseYear(candidate);

  if (/serialized|numbered|judge gift|judge promo|invention|expedition|masterpiece|secret lair|showcase|borderless|extended art|etched|surge foil|textured foil|collector booster|promo/i.test(searchText)) {
    return "premiumVariant";
  }

  if (releaseYear && releaseYear <= 2003 && /rare|mythic|reserved list|scarce|old border/i.test(searchText)) {
    return "oldRareOrScarce";
  }

  if (/foil/i.test(searchText) && /commander|modern|legacy|vintage|staple|playable|fetch land|shock land|mana crypt|rhystic study|cyclonic rift|force of will|the one ring/i.test(searchText)) {
    return "foilPlayable";
  }

  if (/legacy|vintage|modern|staple|fetch land|shock land|force of will|wasteland|dual land|the one ring|ragavan|orcish bowmasters/i.test(searchText)) {
    return "modernLegacyVintageStaple";
  }

  if (/commander|edh|sol ring|mana crypt|rhystic study|cyclonic rift|doubling season|smothering tithe|dockside extortionist/i.test(searchText)) {
    return "commanderStaple";
  }

  if (/rare|mythic|playable|staple|standard|pioneer/i.test(searchText)) {
    return "normalPlayable";
  }

  return "normalBulk";
}

function estimateMtgRegionalPrices(candidate) {
  const englishPrice = getUsableEnglishPrice(candidate);

  if (!englishPrice) {
    return getRegionalEstimateBase(candidate);
  }

  const priceTier = getMtgPriceTier(candidate);
  const jpMultiplier = MTG_JP_MULTIPLIERS[priceTier];
  const krMultiplier = MTG_KR_MULTIPLIERS[priceTier];
  const calculatedJpEstimate = englishPrice * jpMultiplier;
  const calculatedKrEstimate = englishPrice * krMultiplier;
  const exactJapanesePrice = getExactRegionalPrice(candidate, [
    ["price_jp"],
    ["japanesePrice"],
    ["regionalMarketPrices", "jp"],
  ]);
  const exactKoreanPrice = getExactRegionalPrice(candidate, [
    ["price_kr"],
    ["koreanPrice"],
    ["regionalMarketPrices", "kr"],
  ]);
  const jpEstimate = exactJapanesePrice ?? calculatedJpEstimate;
  const krEstimate = exactKoreanPrice ?? calculatedKrEstimate;
  const hasExactRegionalPrice = Boolean(exactJapanesePrice || exactKoreanPrice);

  return {
    game: candidate.game,
    us: roundPrice(englishPrice),
    jp: roundPrice(jpEstimate),
    kr: roundPrice(krEstimate),
    basePrice: roundPrice(englishPrice),
    baseEnglishPrice: roundPrice(englishPrice),
    estimatedJapanesePrice: roundPrice(jpEstimate),
    estimatedKoreanPrice: roundPrice(krEstimate),
    pricingSource: hasExactRegionalPrice
      ? "regional_api_market_price_with_estimate_fallback"
      : "english_market_price_with_mtg_regional_estimate",
    confidence: hasExactRegionalPrice ? "high" : "low",
    pricingNotes:
      "MTG Korean/Japanese may carry premiums instead of discounts, especially for foil, old, scarce, promo, or highly playable cards. Exact API or sold-listing regional prices should override estimates.",
    priceTier,
    jpMultiplier,
    krMultiplier,
  };
}

export function estimateRegionalPrices(candidate) {
  const gameKey = candidate.game ? normalizeValue(candidate.game) : "";
  if (gameKey.includes("pokemon")) {
    return estimatePokemonRegionalPrices(candidate);
  }

  if (gameKey.includes("one piece") || gameKey.includes("onepiece")) {
    return estimateOnePieceRegionalPrices(candidate);
  }

  if (gameKey.includes("magic") || gameKey === "mtg") {
    return estimateMtgRegionalPrices(candidate);
  }

  const englishPrice = getUsableEnglishPrice(candidate);

  return {
    ...getRegionalEstimateBase(candidate),
    us: roundPrice(englishPrice),
    basePrice: roundPrice(englishPrice),
    baseEnglishPrice: roundPrice(englishPrice),
  };
}
