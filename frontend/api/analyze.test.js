import assert from "node:assert/strict";
import test from "node:test";
import { estimateRegionalPrices, getPokemonPriceTier } from "./analyze.js";
import {
  buildCandidateMatchData,
  buildMatchContext,
  getLocalLookupNames,
  scoreCandidate,
} from "./utils/cardScoring.js";
import { normalizeCardName, normalizeExtractedCardData } from "./utils/normalizeCard.js";
import { dedupeCandidateMatches, pruneWeakDistractors } from "./services/supabaseCards.js";

function pokemonCandidate(overrides) {
  return {
    game: "pokemon",
    name: "Test Card",
    lowestPrice: 100,
    rarity: "Common",
    set: "Test Set",
    releaseDate: "2024/01/01",
    ...overrides,
  };
}

test("Pokemon Japanese alt art uses the alt-art JP multiplier", () => {
  const candidate = pokemonCandidate({
    name: "Umbreon VMAX",
    rarity: "Special Illustration Rare",
    set: "Evolving Skies",
    releaseDate: "2021/08/27",
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
    cardType: "Trainer Supporter",
    set: "Ultra Prism",
    releaseDate: "2018/02/02",
  });

  assert.equal(getPokemonPriceTier(candidate), "trainerWaifu");
  assert.equal(estimateRegionalPrices(candidate).jp, 110);
});

test("Pokemon Korean vintage card uses the vintage Korean liquidity multiplier", () => {
  const prices = estimateRegionalPrices(pokemonCandidate({
    name: "Charizard",
    rarity: "Rare Holo",
    set: "Base Set",
    releaseDate: "1999/01/09",
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
    cardType: "Character",
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
    cardType: "Character",
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
    cardType: "Legacy Vintage playable staple",
    releasedAt: "2022-09-09",
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
    cardType: "Reserved List scarce old border",
    releasedAt: "1998-10-12",
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

test("card name normalization removes punctuation, accents, symbols, and dash differences", () => {
  assert.equal(normalizeCardName("Ho-Oh"), "ho oh");
  assert.equal(normalizeCardName("Ho Oh"), "ho oh");
  assert.equal(normalizeCardName("Nidoran♀"), "nidoran");
  assert.equal(normalizeCardName("Farfetch'd"), "farfetchd");
  assert.equal(normalizeCardName("Master-Weaver Web Protector"), "master weaver web protector");
  assert.equal(normalizeCardName("Charizard EX"), "charizard ex");
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

  assert.equal(match.confidenceReason, "pokemon weighted visible-field match");
  assert.ok(match.score >= 90);
  assert.ok(match.score <= 99);
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

  assert.equal(match.confidenceReason, "mtg weighted visible-field match");
  assert.ok(match.score >= 85);
  assert.ok(match.score <= 95);
});

test("exact external_id match scores very high", () => {
  const match = scoreCardMatch(
    {
      game: "Magic: The Gathering",
      card: "Lightning Bolt",
      externalId: "scryfall-123",
    },
    {
      game: "mtg",
      name: "Lightning Bolt",
      externalId: "scryfall-123",
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

  assert.equal(match.confidenceReason, "pokemon weighted visible-field match");
  assert.ok(match.score >= 40);
  assert.ok(match.score <= 70);
});

test("One Piece exact name and printed card id scores very high", () => {
  const match = scoreCardMatch(
    {
      game: "One Piece",
      card: "Nami",
      collectorNumber: "OP01-016",
      rarity: "R",
    },
    {
      game: "onepiece",
      name: "Nami",
      externalId: "OP01-016",
      number: "016",
      rarity: "R",
    },
  );

  assert.equal(match.confidenceReason, "onepiece weighted visible-field match");
  assert.ok(match.score >= 90);
  assert.ok(match.matchedFields.includes("printed_card_id"));
  assert.ok(match.matchedFields.includes("printed_card_id_number"));
});

test("One Piece printed card id alone ranks strongly", () => {
  const match = scoreCardMatch(
    {
      game: "One Piece",
      collectorNumber: "OP01-016",
    },
    {
      game: "onepiece",
      name: "Nami",
      externalId: "OP01-016",
      number: "016",
    },
  );

  assert.equal(match.confidenceReason, "onepiece weighted visible-field match");
  assert.ok(match.score >= 35);
  assert.ok(match.score <= 45);
});

test("One Piece printed card id is not capped by generic set conflict", () => {
  const match = scoreCardMatch(
    {
      game: "One Piece",
      card: "Nami",
      collectorNumber: "OP01-016",
      setId: "wrong-set",
    },
    {
      game: "onepiece",
      name: "Nami",
      externalId: "OP01-016",
      setId: "OP01",
      number: "016",
    },
  );

  assert.equal(match.confidenceReason, "onepiece weighted visible-field match");
  assert.ok(!match.capsApplied.some((cap) => cap.reason === "set conflict cap"));
  assert.ok(match.score >= 90);
});

test("One Piece name conflict still caps printed card id matches low", () => {
  const match = scoreCardMatch(
    {
      game: "One Piece",
      card: "Nami",
      collectorNumber: "OP01-016",
    },
    {
      game: "onepiece",
      name: "Zoro",
      externalId: "OP01-016",
      number: "016",
    },
  );

  assert.ok(match.conflictingFields.includes("name"));
  assert.ok(match.score <= 20);
});

test("MTG exact same-name variant remains high without collector number", () => {
  const match = scoreCardMatch(
    {
      game: "Magic: The Gathering",
      card: "Spectacular Spider-Man",
    },
    {
      game: "mtg",
      name: "Spectacular Spider-Man",
      number: "233",
    },
  );

  assert.equal(match.confidenceReason, "mtg weighted visible-field match");
  assert.ok(match.score >= 60);
  assert.ok(match.score < 100);
});

test("MTG treatment clue improves same-name variant ranking", () => {
  const pixelMatch = scoreCardMatch(
    {
      game: "Magic: The Gathering",
      card: "Spectacular Spider-Man",
      number: "233",
      visibleText: ["pixel art"],
    },
    {
      game: "mtg",
      name: "Spectacular Spider-Man",
      number: "233",
      priceVariant: "pixel art foil",
    },
  );
  const normalMatch = scoreCardMatch(
    {
      game: "Magic: The Gathering",
      card: "Spectacular Spider-Man",
      number: "233",
      visibleText: ["pixel art"],
    },
    {
      game: "mtg",
      name: "Spectacular Spider-Man",
      number: "233",
    },
  );

  assert.equal(pixelMatch.confidenceReason, "mtg weighted visible-field match");
  assert.ok(pixelMatch.score > normalMatch.score);
});

test("MTG wrong-name candidate cannot score high", () => {
  const match = scoreCardMatch(
    {
      game: "Magic: The Gathering",
      card: "Spectacular Spider-Man",
      number: "233",
    },
    {
      game: "mtg",
      name: "Different Hero",
      number: "233",
    },
  );

  assert.ok(match.conflictingFields.includes("name"));
  assert.ok(match.score <= 20);
});

test("MTG set code and card number create a deterministic match", () => {
  const match = scoreCardMatch(
    {
      game: "Magic: The Gathering",
      displayName: "Master Weaver, Web Protector",
      oracleName: "Arasta of the Endless Web",
      card: "Arasta of the Endless Web",
      cardNumber: "0032",
      setCode: "MAR",
    },
    {
      game: "mtg",
      name: "Arasta of the Endless Web",
      setId: "mar",
      number: "32",
    },
  );

  assert.equal(match.confidenceReason, "mtg set code + card number match");
  assert.equal(match.identityDebug.setCodeScore, 1);
  assert.equal(match.identityDebug.numberScore, 1);
  assert.ok(match.score >= 95);
});

test("MTG exact name, collector number, and rarity scores near-perfect without set name", () => {
  const match = scoreCardMatch(
    {
      game: "Magic: The Gathering",
      card: "Assault on Osgiliath",
      cardNumber: "285",
      rarity: "rare",
    },
    {
      game: "mtg",
      name: "Assault on Osgiliath",
      set: "The Lord of the Rings: Tales of Middle-earth",
      number: "285",
      rarity: "rare",
    },
  );

  assert.equal(match.confidenceReason, "mtg weighted visible-field match");
  assert.equal(match.identityDebug.nameScore, 1);
  assert.equal(match.identityDebug.numberScore, 1);
  assert.equal(match.identityDebug.rarityScore, 1);
  assert.ok(!match.conflictingFields.includes("printed_total"));
  assert.ok(match.score >= 95);
});

test("MTG cardName prefers displayName while oracleName remains alternate lookup", () => {
  const parsed = normalizeExtractedCardData({
    game: "Magic: The Gathering",
    displayName: "Master Weaver, Web Protector",
    oracleName: "Arasta of the Endless Web",
    cardName: "Master Weaver, Web Protector",
    cardNumber: "0032",
    setCode: "MAR",
  });

  assert.equal(parsed.cardName, "Master Weaver, Web Protector");
  assert.equal(parsed.card, "Master Weaver, Web Protector");
  assert.equal(parsed.oracleName, "Arasta of the Endless Web");
  assert.deepEqual(getLocalLookupNames(parsed).slice(0, 2), [
    "Master Weaver, Web Protector",
    "Arasta of the Endless Web",
  ]);
});

test("MTG oracleName can score alternate-name database matches when set code and number confirm", () => {
  const match = scoreCardMatch(
    {
      game: "Magic: The Gathering",
      displayName: "Master Weaver, Web Protector",
      oracleName: "Arasta of the Endless Web",
      card: "Master Weaver, Web Protector",
      cardNumber: "0032",
      setCode: "MAR",
    },
    {
      game: "mtg",
      name: "Arasta of the Endless Web",
      setId: "mar",
      number: "32",
    },
  );

  assert.equal(match.confidenceReason, "mtg set code + card number match");
  assert.equal(match.identityDebug.nameScore < 0.65, true);
  assert.equal(match.identityDebug.oracleNameScore, 1);
  assert.equal(match.identityDebug.bestNameScore, 1);
  assert.ok(match.score >= 95);
});

test("punctuation-normalized names score as exact or near-exact matches", () => {
  const examples = [
    ["Ho-Oh", "Ho Oh"],
    ["Nidoran♀", "Nidoran"],
    ["Farfetch'd", "Farfetchd"],
    ["Master Weaver, Web Protector", "Master-Weaver Web Protector"],
    ["Charizard ex", "Charizard EX"],
  ];

  for (const [scanName, candidateName] of examples) {
    const match = scoreCardMatch(
      {
        game: "Pokemon",
        card: scanName,
        number: "1",
      },
      {
        game: "pokemon",
        name: candidateName,
        number: "1",
      },
    );

    assert.ok(match.identityDebug.nameScore >= 0.95, `${scanName} vs ${candidateName}`);
  }
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

  assert.equal(match.confidenceReason, "pokemon weighted visible-field match");
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

  assert.equal(match.confidenceReason, "pokemon weighted visible-field match");
  assert.ok(!match.conflictingFields.includes("set"));
  assert.ok(!match.capsApplied.some((cap) => cap.reason === "set conflict cap"));
  assert.ok(match.score >= 70);
});

test("collector number alone cannot produce high confidence", () => {
  const match = scoreCardMatch(
    {
      game: "Pokemon",
      card: "Umbreon ex",
      number: "161",
    },
    {
      game: "pokemon",
      name: "Lickitung",
      number: "161",
    },
  );

  assert.equal(match.confidenceReason, "pokemon weighted visible-field match");
  assert.ok(match.conflictingFields.includes("name"));
  assert.ok(match.score <= 10);
  assert.doesNotMatch(match.reasons?.join(" ") || "", /100% confident/);
});

test("Pokemon name, set, and collector number dominate wrong same-number candidates", () => {
  const exactMatch = scoreCardMatch(
    {
      game: "Pokemon",
      card: "Umbreon ex",
      setName: "Prismatic Evolutions",
      number: "161/131",
    },
    {
      game: "pokemon",
      name: "Umbreon ex",
      set: "Prismatic Evolutions",
      number: "161/131",
      printedTotal: 131,
    },
  );
  const wrongSameNumber = scoreCardMatch(
    {
      game: "Pokemon",
      card: "Umbreon ex",
      setName: "Prismatic Evolutions",
      number: "161/131",
    },
    {
      game: "pokemon",
      name: "Lickitung",
      set: "Different Set",
      number: "161/131",
      printedTotal: 131,
    },
  );

  assert.ok(exactMatch.score >= 90);
  assert.ok(wrongSameNumber.score <= 10);
  assert.ok(exactMatch.identityDebug.nameScore > 0.9);
  assert.ok(wrongSameNumber.identityDebug.nameScore < 0.65);
});

test("Pokemon cardNumber with printed total matches candidate collector number only", () => {
  const match = scoreCardMatch(
    {
      game: "Pokemon",
      card: "Umbreon ex",
      cardNumber: "161/131",
      printed_total: 131,
    },
    {
      game: "pokemon",
      name: "Umbreon ex",
      number: "161",
      printedTotal: 131,
    },
  );

  assert.equal(match.identityDebug.rawExtractedCardNumber, "161/131");
  assert.equal(match.identityDebug.normalizedExtractedCollectorNumber, "161");
  assert.equal(match.identityDebug.candidateCollectorNumber, "161");
  assert.equal(match.identityDebug.numberScore, 1);
  assert.equal(match.identityDebug.printedTotalScore, 1);
  assert.ok(match.score >= 95);
});

test("set and number match with wrong name is capped by name conflict", () => {
  const match = scoreCardMatch(
    {
      game: "Pokemon",
      card: "Umbreon ex",
      setId: "sv8",
      number: "161",
    },
    {
      game: "pokemon",
      name: "Lickitung",
      setId: "sv8",
      number: "161",
    },
  );

  assert.equal(match.confidenceReason, "pokemon weighted visible-field match");
  assert.ok(match.conflictingFields.includes("name"));
  assert.ok(match.score <= 20);
});

test("exact name and collector number beats collector-number-only candidates", () => {
  const exactMatch = scoreCardMatch(
    {
      game: "Pokemon",
      card: "Umbreon ex",
      number: "161",
    },
    {
      game: "pokemon",
      name: "Umbreon ex",
      number: "161",
    },
  );
  const numberOnlyMatch = scoreCardMatch(
    {
      game: "Pokemon",
      card: "Umbreon ex",
      number: "161",
    },
    {
      game: "pokemon",
      name: "Jangmo-o",
      number: "161",
    },
  );

  assert.ok(exactMatch.score >= 70);
  assert.ok(numberOnlyMatch.score < 10);
  assert.ok(exactMatch.score > numberOnlyMatch.score);
});

test("setCode mismatch does not cap exact name and collector number match", () => {
  const match = scoreCardMatch(
    {
      game: "Pokemon",
      card: "Umbreon ex",
      setCode: "MEG",
      number: "161",
    },
    {
      game: "pokemon",
      name: "Umbreon ex",
      setId: "sv8",
      number: "161",
    },
  );

  assert.equal(match.confidenceReason, "pokemon weighted visible-field match");
  assert.ok(!match.conflictingFields.includes("set"));
  assert.ok(match.score >= 70);
});

test("Pokemon printed total conflict does not crush exact name and collector number", () => {
  const match = scoreCardMatch(
    {
      game: "Pokemon",
      card: "Umbreon ex",
      number: "161/182",
      printedTotal: 182,
    },
    {
      game: "pokemon",
      name: "Umbreon ex",
      number: "161/191",
      printedTotal: 191,
    },
  );

  assert.equal(match.confidenceReason, "pokemon weighted visible-field match");
  assert.ok(match.conflictingFields.includes("printed_total"));
  assert.ok(!match.capsApplied.some((cap) => cap.reason === "printed total conflict cap"));
  assert.ok(match.score >= 70);
});

test("Pokemon debug reasons include visible-field match details", () => {
  const match = scoreCardMatch(
    {
      game: "Pokemon",
      card: "Umbreon ex",
      number: "161/182",
      printedTotal: 182,
      setName: "Mega Evolution",
    },
    {
      game: "pokemon",
      name: "Umbreon ex",
      number: "161/182",
      printedTotal: 182,
      set: "Mega Evolution",
    },
  );

  assert.ok(match.pokemonDebugReasons.includes("pokemon name match"));
  assert.ok(match.pokemonDebugReasons.includes("pokemon collector number match"));
  assert.ok(match.pokemonDebugReasons.includes("pokemon printed total match"));
  assert.ok(!match.pokemonDebugReasons.includes("pokemon set name match"));
});

test("wrong name with same set and collector number is capped and pruned", () => {
  const match = scoreCardMatch(
    {
      game: "Pokemon",
      card: "Umbreon ex",
      setId: "sv8",
      number: "161",
    },
    {
      game: "pokemon",
      name: "Lickitung",
      setId: "sv8",
      number: "161",
    },
  );

  assert.equal(match.confidenceReason, "pokemon weighted visible-field match");
  assert.ok(match.conflictingFields.includes("name"));
  assert.ok(match.score <= 20);
});

test("number-only distractors are pruned when a strong identity match exists", () => {
  const candidates = [
    {
      id: "umbreon-161",
      name: "Umbreon ex",
      matchScore: 88,
      matchReasons: ["game match", "exact name", "collector number match"],
    },
    {
      id: "lickitung-161",
      name: "Lickitung",
      matchScore: 8,
      matchReasons: ["game match", "collector number match", "name conflict"],
    },
  ];

  const pruned = pruneWeakDistractors(candidates);

  assert.equal(pruned.length, 1);
  assert.equal(pruned[0].id, "umbreon-161");
});

test("low-score name conflicts are pruned when a strong identity match exists", () => {
  const candidates = [
    {
      id: "umbreon-161",
      name: "Umbreon ex",
      matchScore: 88,
      matchReasons: ["game match", "exact name", "collector number match"],
    },
    {
      id: "lickitung-161",
      name: "Lickitung",
      matchScore: 20,
      matchReasons: ["game match", "set id match", "collector number match", "name conflict"],
    },
  ];

  const pruned = pruneWeakDistractors(candidates);

  assert.equal(pruned.length, 1);
  assert.equal(pruned[0].id, "umbreon-161");
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
