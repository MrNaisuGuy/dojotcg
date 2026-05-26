# DojoTCG / DojoGPT Future Vision Notes

## Early Concept Brainstorm

This document represents long-term feature ideas and product direction brainstorming.

The current app is still in early MVP development focused primarily on:

- [x] Card scanning
- [x] OCR / vision recognition
- [x] Metadata matching
- [x] Basic pricing display
- [x] Core UI/UX

Most ideas below are not planned for immediate implementation and should be treated as:

- Future roadmap concepts
- Experimental features
- Long-term ecosystem ideas

Current priority remains:

1. Reliable card recognition
2. Metadata normalization
3. Exact-match confidence
4. Stable pricing integration
5. Clean scalable architecture

## Current MVP Foundation

Existing core features:

- [x] AI-powered card scanning
- [x] OCR text extraction
- [x] Fuzzy matching system
- [x] Confidence-based candidate matching
- [x] Multi-language support
  - [x] English
  - [x] Japanese
  - [x] Korean
- [ ] Cross-region pricing concepts
- [x] Mobile-first scan interface

## Current Data Architecture Direction

- [x] Build a Supabase-backed card catalog so runtime scans do not depend on third-party lookup APIs.
- [x] Sync Pokemon card data from PokemonTCG into `cards`.
- [x] Store normalized fields such as game, external id, name, set id, set name, number, printed total, rarity, and image URL.
- [x] Query Supabase first for card identity and images.
- [x] Use third-party APIs as background sync sources or fallbacks instead of primary scan-time dependencies.
- [ ] Store price history in Supabase where allowed by source terms.
- [ ] Use marketplace SKU data in the future to look up precise variant-level prices.
  - [ ] Store SKU/provider mappings in the card catalog where available.
  - [ ] Resolve prices by card identity plus variant details such as condition, foil treatment, language, and printing.
  - [ ] Cache marketplace price snapshots in Supabase to reduce dependency on live third-party queries.

## Long-Term Product Direction

Goal: create a real-world TCG companion app rather than only a card scanner.

Potential long-term ecosystem:

- [x] Scanner
- [ ] Collection management
- [ ] Wishlist intelligence
- [ ] Trade matching
- [ ] Local player discovery
- [ ] Convention utility tools
- [ ] Cross-market pricing intelligence

## Wishlist System

Basic wishlist:

- [ ] Save wanted cards
- [ ] Organize by game/set
- [ ] Priority tagging
- [ ] Favorite/grail tracking

Smart wishlist features:

- [ ] Target price alerts
- [ ] Cross-region pricing alerts
- [ ] Price-drop notifications
- [ ] Historical price tracking

Examples:

- [ ] Notify if KR version falls below target price.
- [ ] Notify if JP version becomes cheaper than EN.

Collection completion:

- [ ] Set completion percentage
- [ ] Missing card tracking
- [ ] Cheapest completion suggestions
- [ ] Alternative language suggestions

Scan-to-wishlist:

- [ ] Scan screenshots/photos directly into wishlist.
- [ ] Quick-add from identified cards.

## Trade System

Trade binder states:

- [ ] For Trade
- [ ] Trade Pending
- [ ] Not Available

Nearby trade discovery:

- [ ] Radius-based discovery
- [ ] Convention/local card shop optimized
- [ ] Proximity-only awareness
- [ ] No exact location sharing

Smart trade matching checks:

- [ ] Your wishlist
- [ ] Their trade binder
- [ ] Their wishlist
- [ ] Your available cards

Then generates:

- [ ] Match notifications
- [ ] Suggested trade opportunities

Example:

- [ ] "You have cards they want and they have cards you want."

Trade requests workflow:

1. Nearby match detected.
2. View public trade summary.
3. Send trade interest.
4. Accept / deny request.
5. Mutual acceptance unlocks DM access.

Messaging direction:

- [x] Messaging should remain utility-focused and permission-based.
- [x] Avoid open public messaging.
- [x] Avoid social-media-style systems.
- [ ] Prefer temporary/private communication.
- [ ] Prefer trade-focused interactions only.

Privacy and safety:

- [x] No exact GPS location exposure
- [ ] Proximity-only discovery
- [x] Permission-based communication
- [ ] Anti-spam protections

## Profiles And Friend Connections

Profile page concept:

- [ ] Add a Linktree/link.me-style user profile page.
- [ ] Let users list external social/contact accounts they choose to share.
- [x] Keep profile pages lightweight and utility-focused.
- [x] Support collector/player identity without turning the app into a feed-based social platform.

Possible profile fields:

- [ ] Display name
- [ ] Avatar
- [ ] Bio/status
- [ ] Primary games
- [ ] Favorite formats
- [ ] Trade availability
- [ ] Battle availability
- [ ] Public wishlist highlights
- [ ] Public trade binder highlights
- [ ] External links/social accounts

Friend system:

- [ ] Allow users to add friends.
- [ ] Support friend-only visibility for selected profile details, wishlist, trade binder, or collection summaries.
- [ ] Keep friend connections useful for trading, battling, and local event coordination.

Messaging direction:

- [x] Keep direct chat out of the app for now.
- [x] Prefer external social/contact links for conversation.
- [ ] If communication is needed later, keep it permission-based and task-focused, such as temporary trade/battle request coordination.

## Battle / Player Matchmaking

Battle availability toggle:

- [ ] Looking for Battle ON/OFF

Nearby player discovery filters:

- [ ] Game
- [ ] Format
- [ ] Casual / Competitive
- [ ] Skill level
- [ ] Beginner-friendly

Match request workflow:

1. Nearby player detected.
2. Send battle request.
3. Accept / deny request.
4. Temporary DM unlock after acceptance.

Goal:

- [ ] Help players find casual games.
- [ ] Help players meet others at conventions.
- [ ] Fill downtime between tournament rounds.
- [ ] Discover local community activity.

## Event / Convention Features

Event mode:

- [ ] Convention-aware experience
- [ ] Localized player/trader discovery

Possible event features:

- [ ] Nearby trade ecosystem
- [ ] Nearby battle matchmaking
- [ ] Vendor integration
- [ ] Event-specific alerts
- [ ] Trade heatmaps
- [ ] Most-wanted cards at event

## Long-Term Advanced Ideas

Slab support:

- [ ] PSA
- [ ] BGS
- [ ] CGC

Possible slab features:

- [ ] Label scanning
- [ ] Population data
- [ ] Graded pricing

Condition analysis:

- [ ] Edge wear detection
- [ ] Surface issue detection
- [ ] Centering estimation
- [ ] Approximate grading prediction

Cross-market intelligence:

- [ ] EN vs JP vs KR arbitrage insights
- [ ] Historical region pricing comparisons
- [ ] Market inefficiency detection

## Mobile App Path

- [x] Keep the current React/Vite experience working as a web app.
- [ ] Later wrap the web app with Capacitor for iOS/Android.
- [ ] Add app-only features where browsers are limited.
  - [ ] Better camera access
  - [ ] Local/offline cache
  - [ ] Native storage
  - [ ] Push notifications
  - [ ] Sharing/import/export flows

## Data Sync

- [x] Add repeatable sync jobs for supported games.
  - [x] Pokemon first
  - [ ] MTG/Scryfall bulk data later
  - [ ] One Piece catalog sync or curated import later
- [ ] Track sync runs.
  - [ ] Source
  - [ ] Started/finished timestamps
  - [ ] Rows inserted/updated
  - [ ] Errors

## Product Direction Notes

Avoid becoming:

- [x] Generic social media
- [x] Feed-based content platform
- [x] Influencer/community app

Preferred direction:

- [x] Utility-first ecosystem
- [x] Collector/player tools
- [ ] Real-world interaction enhancement
- [ ] Convention/local play support

Core philosophy:

- [x] Enhance existing collector/player behavior rather than replacing it.

## Current Development Priorities

Immediate focus should remain:

1. Accurate scanning
2. Exact metadata matching
3. Canonical card database architecture
4. Stable pricing integrations
5. Performance optimization
6. Scalable backend structure

Future social/trade/player systems should only be considered after:

- [ ] Scanner reliability is strong
- [ ] Metadata system is stable
- [ ] Core infrastructure is production-ready

## Current Project Status

Current project stage:

- [x] Functional MVP / prototype
- [x] Not production-ready

Focus should remain on:

- [x] Stability
- [x] Accuracy
- [x] Data structure
- [x] Core functionality

before advanced ecosystem features are attempted.
