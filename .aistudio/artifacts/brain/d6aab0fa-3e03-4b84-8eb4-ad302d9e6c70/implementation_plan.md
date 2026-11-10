# Personal Bots Column & Creator Privacy Management

Ensure the **Personal Bots** section is immediately accessible and visible to platform owners and bot creators in Studio mode and the Play Bots picker, with clear lock badges and private assignment controls.

## User Review & Critical Decisions

> [!IMPORTANT]
> Based on your feedback, Personal Bots are designed specifically for owners and studio creators:
> - **Studio Private Column**: In Studio Mode, a dedicated "Personal Bots" filter and management column allows owners/creators to mark, assign, and edit private bots.
> - **Play Bots Tier**: In the Bot Picker, the **🔒 Personal Bots (Private)** category is visible to owners/creators, featuring a lock badge and an inline "Create Personal Bot" shortcut when empty.

- **Confirmed Choice 1**: Personal Bots section is visible in Studio and the Bot Picker strictly for platform owners and bot creators.
- **Confirmed Choice 2**: Personal bots carry a lock badge (`🔒`) to distinguish private training bots from public roster bots.

---

## 1. Overview & Core Concept

- **What It Does**: Provides a dedicated, private "Personal Bots" tier and Studio column where users with creator/owner privileges can build, test, and play against non-public custom bots.
- **Target Audience**: Platform owners and studio creators designing personalized training opponents.
- **Key Value**: Guarantees privacy for work-in-progress or personal test bots while making the category obvious and actionable in the UI.

---

## 2. User Experience & Visual Design

- **Studio Mode**:
  - Add a **Category Filter** in the Studio roster sidebar (All / Standard Tiers / 🔒 Personal Bots).
  - Add a visual **🔒 Personal Bot** badge in the identity card with a toggle to switch a bot between public and private Personal status.
- **Play Bots Panel**:
  - Always render the **🔒 Personal Bots (Private)** accordion tier for logged-in owners and creators.
  - When the tier has 0 personal bots, display an inviting empty state card: *"No personal bots created yet. Open Studio to create your first private bot!"* with a direct link to `/studio`.
  - Display a clean lock icon badge (`🔒`) over personal bot avatars in the bot selection grid.

---

## 3. Key Product Decisions & Trade-Offs

- **Visibility Model**:
  - *Chosen Approach*: Show the Personal tier in the Bot Picker to any logged-in user who is an owner or has created a bot, rendering an informative empty state if they haven't created one yet.
  - *Why*: Solves the issue where a user couldn't see the category because 0 personal bots had been instantiated under their user ID.
- **Data Security**:
  - *Chosen Approach*: Filter queries and local store lists so non-creator public users never see personal bots belonging to others.

---

## 4. Technical Architecture & Data Strategy

```
┌─────────────────────────────────────────────────────────┐
│                    Studio / Roster                      │
│   Category Filter: [ All | Standard | 🔒 Personal ]     │
│   Bot Settings: [x] Private Personal Bot (Owner Only)   │
└────────────────────────────┬────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────┐
│                  botStore.ts (State)                    │
│   - category: "Personal"                                │
│   - createdBy: user.id                                  │
└────────────────────────────┬────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────┐
│               PlayBotsPanel.tsx (Picker)                │
│   - Section: 🔒 Personal Bots (Private)                 │
│   - If empty & authorized: Show "Create in Studio" card │
│   - Lock Badge on Bot Grid Tiles                        │
└─────────────────────────────────────────────────────────┘
```

- **Component Updates**:
  - `PlayBotsPanel.tsx`: Update `tiers.map` so `"Personal"` is visible to `user` (or `isOwner`), displaying an inline call-to-action when 0 personal bots exist.
  - `StudioBotEditor.tsx`: Add a dedicated "🔒 Personal Bots" filter tab in the left roster sidebar and a prominent "🔒 Private Personal Bot" toggle in the Identity card.
