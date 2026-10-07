# Design review: character levels 1–10, all classes and difficulties (2026-10-07)

## How this review was done

Four expert-designer passes were run, one per class, each covering Pilgrim, Penitent and Martyr from level 1
to level 10. Level 10 is reached around floor 5, so the review covers all of Act I, the boss Grulk, and floor 4.

The evidence is:
- about 56 bot playthroughs
- fight simulations at levels 1, 4, 7 and 10
- hit counts
- single-target damage probes on a dummy
- Grulk fights at several hero levels
- screenshots

The bot is not a human, and each pass judged it that way. Numbers are medians unless a range is given.

## The one-sentence version

Act I is a one-button game for every class. A free first skill replaces the basic attack, the class
resource never constrains you, and the class fantasy (build up, then spend) only switches on at level 6–12.
On top of that, difficulty modes only scale numbers, and Grulk's difficulty swings on one or two character levels.

## Systemic findings (all four classes agree)

| # | Finding | Evidence |
|---|---|---|
| S1 | **The first skill replaces the basic attack.** | <ul><li>Fighter: Bash is free, does 2.1× weapon damage and builds double rage (dummy: 166 vs 76 DPS).</li><li>Assassin: Tiger Strike costs 8 energy against 18/s regen, so energy never drops below 8 in combat.</li><li>Valkyrie: Multishot is free (5.8 s vs 15.9 s on a 4-pack), and Aimed Shot spam at low focus beats waiting.</li><li>Magician: left-click is a wand doing about 8 DPS against about 45 for Firebolt.</li></ul> |
| S2 | **Class resources do nothing in Act I.** | <ul><li>Fighter rage averages 82, with Momentum active 80% of the time.</li><li>The Assassin's energy orb never matters.</li><li>The Magician's mana sits full, because cantrips are free and keep Surge.</li><li>Holding Valkyrie focus is punished.</li></ul> |
| S3 | **Tier 2 unlocks at level 6, so there is no second skill tier in Act I.** | <ul><li>No spender for the Fighter until level 12.</li><li>No Assassin finisher until level 6.</li><li>Magician reactions are effectively absent: 13 Thermal Shocks, 0 Overloads and 0 Flash Freezes in a whole run.</li><li>Levels 7–11 unlock nothing.</li></ul> |
| S4 | **Levelling is slow early, then lumpy.** | <ul><li>Level on arrival at floors 1–5 is 1, 2, 4, 7, 9–10. The spec says level = area level + 1, which would be 2, 4, 7, 9, 11.</li><li>Floor 1 gives a single level; floor 3 alone gives three.</li></ul> |
| S5 | **Grulk's difficulty swings on one or two levels.** | <ul><li>At level 4: Assassin wins 9 of 16, Magician 2 of 6 deaths, Fighter on Martyr 10 of 12 deaths.</li><li>At level 7 (where players actually arrive after clearing floor 3): 20–30 s fights against a 60–100 s target.</li><li>His damage is mostly plain jabs (about 1.1× the hero's life per fight) and adds, with only 0.2× from his telegraphed moves.</li><li>He can be kited forever: he steps every 450 ms, the hero every 250 ms.</li></ul> |
| S6 | **Difficulty is only a multiplier, and Martyr undercuts itself.** | <ul><li>Martyr's +25% XP puts the hero 2–3 levels ahead by floor 4.</li><li>Magician on Martyr beat Grulk faster than on Penitent (45–77 s vs 80–100 s).</li><li>Martyr is a brutal floor 1 at level 1 that then gets easier.</li><li>Pilgrim gets the same XP from fewer monsters, so it trails by about 2 levels.</li></ul> |
| S7 | **Elites are slow.** | <ul><li>Bot champion kill time on Penitent: 14–31 s, against a 5–9 s band.</li><li>Act I Keepers take 37–45 hits.</li><li>The balance harness says elites are in band, but it measures a different hero than the one players bring.</li></ul> |
| S8 | **Floor 4 is a cliff.** | <ul><li>Act life multiplier jumps from 2.25 to 3.75.</li><li>Crypt Guards and Ghouls top damage taken in every run.</li><li>Fresh level-7 heroes lose 137–172% of their life to one pack.</li></ul> |
| S9 | **Act I punishes melee and is thin.** | <ul><li>4 of 6 Act I monsters kite or flee; the Fighter takes 39 s against Quill Nest.</li><li>Only 4 packs and 6 monster types, and nothing teaches flanking.</li></ul> |
| S10 | **Loot is generous.** | 9–27 rares, 1–6 legendaries and 8–19 gear swaps by floor 5. |

## Class findings (top items)

### Fighter
- **No real spender before level 12.** Berserk Strike and Earthshaker are tier 3. "Build rage, spend it on crushing
  moves" never happens.
- **Bash should be a builder.** Lower its rank scaling or give it a short cooldown, raise basic-attack rage, or
  make rage decay between packs.
- **War Cry gives +3% damage and its Fear scatters the clump Bash wants.** It would work better as a Taunt or pull.
- **No answer to kiters before Charge.** Either give one (Bash rank 3 shockwave, Charge cooldown 4 s) or reduce
  kiters on floors 1–2.

### Assassin
- **Tiger Strike is a free, better basic attack.** Suggested fix: builders generate energy and cost nothing,
  regen drops to about 8/s, and only finishers spend.
- **Tiger Strike's breakpoints reward never spending charges.** Move the crit bonus onto the finisher
  ("per charge spent") and raise Dragon Talon's per-charge scaling.
- **No finisher until level 6.** Make Dragon Talon tier 1, or label the basic attack's charge release as a finisher.
- **Lightning Sentry beats the Martial path** (63.9 vs 55.1 DPS at level 8).
- **Shadowstep's payoff is thin.** Add the spec's Ambush bonus.

### Magician
- **Cantrips only until level 6.** The reaction system, the class's selling point, is invisible in Act I.
- **Fireball is a power cliff.** Clear time changes about 20× between level 4 and level 7, and Fireball does 46%
  of all damage once learned. Raise cantrip scaling or lower Fireball's base.
- **Spark and Ice Shard were cut below spec, making Spark a trap first pick.** Restore their damage, and raise
  Spark's Shock chance to 25–30% so reactions can happen early.
- **Onboarding:** the left-click wand is a trap, and the mana hint never mentions Surge.

### Valkyrie
- **Spamming Aimed Shot at low focus is optimal.** Its 0.3 s cast ignores weapon speed. Scale the draw with attack
  speed, require at least 2 focus, and move its value into the per-focus bonus.
- **Multishot is free and replaces the basic shot.** Give it a cost (1 focus) or lower per-arrow damage, and make
  the basic shot the focus builder.
- **Javelin is a trap first skill.** Shorten its cooldown to about 1 s at rank 1.
- **Piercing Shot eats focus that Aimed Shot needs.** Make it generate focus per enemy pierced instead.
- **Valkyrie's Call is undervalued.**
- **Bow skills fire arrows while a sword is equipped.**
- **Aimed Shot's text says 1.6×; the data says 1.75×.**

## Recommendations, ranked

1. **Unlock tier 2 at level 3–4 and space the later tiers out** (e.g. 1 / 4 / 8 / 13), so every class has a second
   skill before Grulk and something to unlock between levels 7 and 11. *(data: `balance.skills.tierLevel`)*
2. **Restore build-and-spend for every class.** The basic attack and builders generate the resource, spenders cost
   it, and no free skill outperforms the basic attack:
   - **Fighter:** Bash.
   - **Assassin:** Tiger Strike and energy regen.
   - **Valkyrie:** Multishot and Aimed Shot.
   - **Magician:** cantrip damage restored to spec, with clicking an enemy casting the cantrip.

   This is the change that makes the classes play like their descriptions. *(data plus some skill code)*
3. **Front-load XP to the spec's arrival curve** (level 2 within floor 1, level 4 by floor 2). *(data: `balance.xp`)*
4. **Make Grulk a fight, not a gear check.**
   - Tune him for the level players actually arrive at.
   - Move damage from plain jabs into telegraphed moves.
   - Add a gap-closer so he can't be kited forever.
   - Point the balance harness's boss test at that hero.

   *(data plus tools)*
5. **Make difficulty about behaviour, not just numbers.**
   - **Martyr:** drop most of the XP bonus. Add shorter wind-ups, more ranged units and champion mods from floor 1,
     with less of the extra life.
   - **Pilgrim:** +15% XP.
   - **Data cleanup:** make trap visibility a difficulty field instead of a check for Pilgrim in the code.
6. **Smooth the Act I → II cliff.** Ramp `actHp` and `actDmg` per floor instead of per act. Bring elite kill times
   back into the 5–9 s / 15–25 s bands measured on real playthroughs.
7. **Content:**
   - 1–2 more Act I packs, including a shield-bearer to teach flanking.
   - Fewer kiters on floors 1–2.
   - Somewhat stingier loot.
8. **Tooling:**
   - The `fight.js` level argument is fixed (2026-10-07).
   - The bot's `skillUse` counts attempts, not casts.
   - The bot's 1.5 s retry lock halves Magician cantrip use.
   - The bot plays one build per class, so Lightning Sentry, Whirlwind, Brace, Second Wind and Valkyrie's Call
     never get measured.
