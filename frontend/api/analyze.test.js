import assert from "node:assert/strict";
import test from "node:test";
import { estimateRegionalPrices, getPokemonPriceTier } from "./analyze.js";
import {
  buildCandidateMatchData,
  buildMatchContext,
  scoreCandidate,
} from "./utils/cardScoring.js";
import { dedupeCandidateMatches } from "./services/supabaseCards.js";

function pokemonCandidate(overrides) {
  return {
    game: "pokemon",
    name: "Test Card",
    lowestPrice: 100,
    rarity: "Common",
    raw: {
      set: {
        name: "Test Set",
        releaseDate: "2024/01/01",
      },
      subtypes: [],
    },
    ...overrides,
  };
}

test("Pokemon Japanese alt art uses the alt-art JP multiplier", () => {
  const candidate = pokemonCandidate({
    name: "Umbreon VMAX",
    rarity: "Special Illustration Rare",
    raw: {
      set: {
        name: "Evolving Skies",
        releaseDate: "2021/08/27",
      },
      subtypes: ["VMAX"],
    },
  });

  assert.equal(getPokemonPriceTier(candidate), "altArt");
  const prices = estimateRegionalPrices(candidate);

  assert.equal(prices.priceTier, "altArt");
  assert.equal(prices.estimatedJapanesePrice, 90);
  assert.equal(prices.estimatedKoreanPrice, 40.5);
  assert.equal(prices.confidence, "low");
});

test("Pokemon Korean alt art is estimated from the Japanese alt-art estimate", () => {
  const prices = estimateRegionalPrices(pokemonCandidate({
    name: "Gengar VMAX",
    rarity: "Alternate Art Secret Rare",
  }));

  assert.equal(prices.priceTier, "altArt");
  assert.equal(prices.jp, 90);
  assert.equal(prices.kr, 40.5);
});

test("Pokemon Japanese trainer/waifu card uses the trainer-waifu JP multiplier", () => {
  const candidate = pokemonCandidate({
    name: "Lillie",
    rarity: "Ultra Rare",
    raw: {
      supertype: "Trainer",
      subtypes: ["Supporter"],
      set: {
        name: "Ultra Prism",
        releaseDate: "2018/02/02",
      },
    },
  });

  assert.equal(getPokemonPriceTier(candidate), "trainerWaifu");
  assert.equal(estimateRegionalPrices(candidate).jp, 110);
});

test("Pokemon Korean vintage card uses the vintage Korean liquidity multiplier", () => {
  const prices = estimateRegionalPrices(pokemonCandidate({
    name: "Charizard",
    rarity: "Rare Holo",
    raw: {
      set: {
        name: "Base Set",
        releaseDate: "1999/01/09",
      },
      subtypes: ["Stage 2"],
    },
  }));

  assert.equal(prices.priceTier, "vintage");
  assert.equal(prices.jp, 120);
  assert.equal(prices.kr, 78);
});

test("One Piece manga rare JP/KR uses manga and Korean-from-Japanese multipliers", () => {
  const prices = estimateRegionalPrices({
    game: "onepiece",
    name: "Monkey.D.Luffy",
    lowestPrice: 100,
    rarity: "Manga SEC",
    raw: {
      card_type: "Character",
    },
  });

  assert.equal(prices.priceTier, "manga");
  assert.equal(prices.characterTier, "gear5OrTopChase");
  assert.equal(prices.estimatedJapanesePrice, 187.5);
  assert.equal(prices.estimatedKoreanPrice, 140.63);
  assert.match(prices.pricingNotes, /Korean is liquidity-discounted from Japanese/);
});

test("One Piece normal SR JP/KR uses SR rarity and normal character demand", () => {
  const prices = estimateRegionalPrices({
    game: "onepiece",
    name: "Borsalino",
    lowestPrice: 20,
    rarity: "SR",
    raw: {
      card_type: "Character",
    },
  });

  assert.equal(prices.priceTier, "sr");
  assert.equal(prices.characterTier, "normal");
  assert.equal(prices.estimatedJapanesePrice, 14);
  assert.equal(prices.estimatedKoreanPrice, 4.9);
});

test("MTG Japanese playable foil uses the foil-playable premium", () => {
  const prices = estimateRegionalPrices({
    game: "mtg",
    name: "Force of Will",
    lowestPrice: 80,
    rarity: "Rare",
    priceVariant: "foil",
    raw: {
      oracle_text: "Legacy Vintage playable staple",
      finishes: ["foil"],
      released_at: "2022-09-09",
    },
  });

  assert.equal(prices.priceTier, "foilPlayable");
  assert.equal(prices.estimatedJapanesePrice, 100);
  assert.equal(prices.estimatedKoreanPrice, 120);
  assert.match(prices.pricingNotes, /premiums instead of discounts/);
});

test("MTG Korean old/scarce card uses the old rare/scarce premium", () => {
  const prices = estimateRegionalPrices({
    game: "mtg",
    name: "Gaea's Cradle",
    lowestPrice: 500,
    rarity: "Rare",
    raw: {
      oracle_text: "Reserved List scarce old border",
      released_at: "1998-10-12",
    },
  });

  assert.equal(prices.priceTier, "oldRareOrScarce");
  assert.equal(prices.estimatedJapanesePrice, 675);
  assert.equal(prices.estimatedKoreanPrice, 875);
});

test("Missing price returns null regional estimates", () => {
  const prices = estimateRegionalPrices({
    game: "onepiece",
    name: "Nami",
    lowestPrice: 0,
    rarity: "SR",
  });

  assert.equal(prices.baseEnglishPrice, null);
  assert.equal(prices.estimatedJapanesePrice, null);
  assert.equal(prices.estimatedKoreanPrice, null);
  assert.equal(prices.jp, null);
  assert.equal(prices.kr, null);
  assert.equal(prices.pricingSource, "missing_english_price");
});

function scoreCardMatch(cardData, candidate) {
  return scoreCandidate(
    buildMatchContext({
      gameConfidence: 98,
      setConfidence: 97,
      nameConfidence: 96,
      collectorNumberConfidence: 99,
      ...cardData,
    }),
    buildCandidateMatchData(candidate),
  );
}

test("exact game + set_id + number match scores very high", () => {
  const match = scoreCardMatch(
    {
      game: "Pokemon",
      card: "Umbreon VMAX",
      setId: "swsh7",
      number: "215/203",
    },
    {
      game: "pokemon",
      name: "Umbreon VMAX",
      setId: "swsh7",
      number: "215/203",
    },
  );

  assert.equal(match.confidenceReason, "exact game + set_id + number match");
  assert.ok(match.score >= 90);
  assert.ok(match.score <= 98);
  assert.ok(match.matchedFields.includes("set_id"));
  assert.ok(match.matchedFields.includes("number"));
});

test("exact game + number + exact normalized name scores high", () => {
  const match = scoreCardMatch(
    {
      game: "Magic: The Gathering",
      card: "Lightning Bolt",
      number: "150",
    },
    {
      game: "mtg",
      name: "Lightning Bolt",
      number: "150",
    },
  );

  assert.equal(match.confidenceReason, "exact game + number + name match");
  assert.ok(match.score >= 85);
  assert.ok(match.score <= 95);
});

test("exact external_id match scores very high", () => {
  const match = scoreCardMatch(
    {
      game: "One Piece",
      card: "Monkey.D.Luffy",
      cardID: "OP05-119",
      number: "119",
    },
    {
      game: "onepiece",
      name: "Monkey.D.Luffy",
      externalId: "OP05-119",
      number: "119",
    },
  );

  assert.equal(match.confidenceReason, "exact external_id match");
  assert.ok(match.score >= 95);
  assert.ok(match.score <= 99);
});

test("fuzzy name only scores low to medium", () => {
  const match = scoreCardMatch(
    {
      game: "Pokemon",
      card: "Charizard",
    },
    {
      game: "pokemon",
      name: "Charizard ex",
    },
  );

  assert.equal(match.confidenceReason, "fuzzy name + game match");
  assert.ok(match.score >= 40);
  assert.ok(match.score <= 70);
});

test("correct game but weak match does not create meaningful confidence", () => {
  const match = scoreCardMatch(
    {
      game: "Pokemon",
      card: "Pikachu",
      number: "25",
    },
    {
      game: "pokemon",
      name: "Squirtle",
      number: "7",
    },
  );

  assert.equal(match.confidenceReason, "game only match");
  assert.ok(match.score >= 1);
  assert.ok(match.score < 30);
});

test("missing optional metadata does not crush a strong match", () => {
  const match = scoreCardMatch(
    {
      game: "Pokemon",
      card: "Mew",
      setId: "sv3pt5",
      number: "151",
    },
    {
      game: "pokemon",
      name: "Mew",
      setId: "sv3pt5",
      number: "151",
    },
  );

  assert.equal(match.confidenceReason, "exact game + set_id + number match");
  assert.ok(match.score >= 90);
  assert.deepEqual(match.conflictingFields, []);
});

test("conflicting set_id penalizes but does not collapse a number and name match", () => {
  const match = scoreCardMatch(
    {
      game: "Pokemon",
      card: "Pikachu",
      setId: "base1",
      number: "58/102",
    },
    {
      game: "pokemon",
      name: "Pikachu",
      setId: "base2",
      number: "58/102",
    },
  );

  assert.equal(match.confidenceReason, "exact game + number + name match");
  assert.ok(match.conflictingFields.includes("set_id"));
  assert.ok(match.score >= 60);
  assert.ok(match.score < 88);
});

test("candidate dedupe keeps one copy and preserves lookup stages", () => {
  const duplicateCandidates = [
    {
      id: "card-1",
      externalId: "OP01-016",
      game: "onepiece",
      name: "Nami",
      setId: "OP01",
      number: "016",
      language: "en",
      matchScore: 94,
      matchReasons: ["set id match"],
      lookupStage: "exact game + set_id + number",
      lookupStages: ["exact game + set_id + number"],
    },
    {
      id: "card-1",
      externalId: "OP01-016",
      game: "onepiece",
      name: "Nami",
      setId: "OP01",
      number: "016",
      language: "en",
      matchScore: 97,
      matchReasons: ["external_id match"],
      lookupStage: "exact external_id",
      lookupStages: ["exact external_id"],
    },
  ];

  const result = dedupeCandidateMatches(duplicateCandidates);

  assert.equal(result.candidates.length, 1);
  assert.equal(result.debug.beforeCount, 2);
  assert.equal(result.debug.afterCount, 1);
  assert.equal(result.candidates[0].matchScore, 97);
  assert.equal(result.candidates[0].lookupStage, "exact external_id");
  assert.deepEqual(result.candidates[0].lookupStages.sort(), [
    "exact external_id",
    "exact game + set_id + number",
  ].sort());
});
