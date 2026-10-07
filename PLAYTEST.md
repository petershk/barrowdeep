# Playtest notes (M10)

Observations from seeded bot runs (`node tools/bot.js <class> <seed> 13 180`), the balance harness and
headless screenshots. Human playtesting should confirm or overrule these.

## How a run plays (bot, Penitent)
- 14 of 16 seeded runs win. Typical run 32–56 minutes of game time; a floor takes ~2.7 minutes.
- Heroes reach level 28–29 for Malgoth. Bosses last 65–100 s, Malgoth ~3 minutes.
- Deaths: almost none on floors 1–3, ~5% per floor visit afterwards, mostly at act bosses.

## Things that felt wrong and were changed
- Act I trash died in one hit while Act IV trash took 5+ seconds: monster life now follows the hero's
  real power curve (fast growth early, slower late).
- Hell Knight Keepers and champion packs were 60-second walls for melee: elite life now comes from the
  act's average, frontal block is softer.
- The assassin starved for energy and couldn't touch blockers or kiters: cheaper builders, Shadowstep
  used to flank.
- Valkyrie Multishot deleted bosses (every arrow of a volley hit the big target): a volley now hits an
  enemy at most twice.
- Fireball hit its target twice; magician numbers were rebuilt after the fix.
- Winning the Ferryman's Bargain left the hero unable to die again (fixed); a Cursed Chest could lock
  you in a barred room forever if a blinking monster left it (fixed); some loot piles couldn't be opened
  because a corpse prop sat on the same tile (fixed).

## Pilgrim (easy) tuning, 2026-10-07
Playtest target from the designer: on Pilgrim, regular enemies die in 2–3 hits and bosses in 3–5× that.
Pilgrim now has extra life multipliers for elites (per act) and bosses (per boss) in
`BD.data.difficulties.pilgrim` (`eliteHp`, `bossHp`). Valkyrie, 6 bot runs (`node tools/hits.js valkyrie pilgrim 6`),
median hits to kill:
- regular enemies 2 in every act; champions 4–5; Keepers 6–9
- bosses: Grulk 9, Mortis 7 per twin shade, Mygra 12, Hakthul 12, Malgoth 14
- other classes on Pilgrim: Fighter bosses 5–10 hits, Assassin 9–19 (more, smaller hits), Magician 6–12
  except Grulk at 20 (few spells at that level)
Boss fights on Pilgrim now last seconds, so most boss mechanics barely show; Penitent and Martyr are unchanged.

## Open questions for human players
- Run length: the bot is quicker than a person. Does a full descent take you 60–90 minutes?
- Mygra (Act III boss) is the hardest matchup for the assassin: kill the egg clutches first. Too hard?
- Act I champions are on the slow side (~8–9 s). Do they feel like a speed bump or a fight?
- Is the floor-1 Keeper fair for a level-1 hero with starting gear?
- Gamepad and touch were verified with synthetic input only; real devices need a check.

## Tools
- `node test/run.js balance`: the balance bands (per act). `node tools/balance_report.js quick|full`
  prints the numbers; `node tools/curve_snapshot.js` refreshes the bot-curve fixture after big changes.
- `node tools/perf.js`: sim step budget. `index.html?debug=1&autotest=perf`: render budget.
- `index.html?debug=1`: F3 overlay, F4 arena (spawn, forge, godmode, DPS dummy, bot watch, Data Lab).
