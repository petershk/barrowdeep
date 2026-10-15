# Skill design: Forms, Attunements and builds (Magician first, 2026-10-14)

## The lens: concentrated coolness

Concentrated coolness is the rule Blizzard used for Diablo III's skills: every option should be exciting on its own,
fewer strong options beat many filler ones, and no choice is a "+5%". Applied here:

1. **One verb per choice.** Each option is a different thing you *do* (pierce, sweep, wade in, haunt), visible on
   screen. If it can only be described as a number, it is a rank, not a choice.
2. **Real alternatives.** Each choice is an either-or between two options that are both good, but at different jobs,
   so the decision depends on the build, not on which one is correct.
3. **Free to experiment.** Forms can be changed at any time, like Diablo III's runes. Builds come from trying
   combinations, so trying one must cost nothing. Only the identity choice (Attunement) is sticky.
4. **One shared language.** Every Form either *makes* a status (Burning, Chill, Freeze, Shock) or *cashes one in*.
   Builds appear when a player pairs makers with cashers, often across trees.

## Structure

| Layer | What the player picks | Rule |
|---|---|---|
| Skills | which skills go on the six bar slots | unchanged: 3 trees × 4 skills |
| **Forms** | one of two Forms for every active skill | open at rank 2 (`balance.skills.formRank`); free to switch; respec clears them |
| **Attunement** | one keystone: Pyre, Shatter or Energy Shield | either-or for the Magician (`balance.skills.exclusiveKeystones`) |

Forms sit on top of the existing ranks and breakpoints. When a Form replaces a breakpoint (Glacial Lance has no use
for "4 shards"), the tooltip says so: "(replaced by Glacial Lance)".

## The Magician's eighteen Forms

| Skill | Form A | Form B |
|---|---|---|
| Firebolt | **Kindling** (ignite): always Burns, Burning lasts 4.5 s, −10% damage | **Searing** (consume): hitting a Burning enemy cashes in the burn ×3; never ignites, +15% damage |
| Fireball | **Napalm** (deny): 4 s of burning ground | **Implosion** (gather): pulls enemies within 3 tiles 2 tiles inward and Chills them, −20% damage |
| Meteor | **Comet** (freeze): cold, Freezes 2 s, no fire ground | **Meteor Shower** (blanket): 5 staggered meteors at 45% across 3 tiles |
| Ice Shard | **Glacial Lance** (pierce): one 2.1× lance through everything; Freezes the already-Chilled | **Hailstorm** (blast): 7-shard 70° shotgun out to 4 tiles |
| Frost Nova | **Deep Freeze** (lock down): 3 s Freeze + Vulnerable, 9 s cooldown | **Ice Armour** (endure): Chills; barrier of 6% max life per enemy hit (max 30%) |
| Blizzard | **Frozen Orb** (sweep): a rolling orb that sprays shards | **Storm Cloak** (wade in): the storm follows you for 5 s |
| Spark | **Arc Lash** (whip): 3-tile lightning cone | **Conduit** (recharge): +1 mana per landed spark, −20% damage |
| Teleport | **Flicker** (dance): 4 charges, 2.5 s, half cost, Hasted on arrival | **Thunderstep** (strike): arrival nova (radius 2) that Shocks |
| Chain Lightning | **Prismatic Arc** (react): jumps cycle fire/cold/lightning and their statuses; each Reaction refunds 3 mana | **Thunderhead** (haunt): a cloud follows the target for 5 s, striking every 0.5 s |

## Builds that come out of it

The bot plays these whole runs (`node tools/bot.js magician <seed> 13 180 penitent <build>`, plans in
`js/debug/bot_builds.js`). None of them is a hand-written mode: each is just a set of skills, Forms and one Attunement.

| Build | Core | Attunement | Signature event per run |
|---|---|---|---|
| Inferno | Kindling, Napalm, Meteor Shower | Pyre | ~390 Pyre explosions |
| Cryomancer | Glacial Lance, Deep Freeze, Frozen Orb, **Comet** (borrowed from the fire tree) | Shatter | ~200 Shatters |
| Battlemage | Arc Lash, Storm Cloak, Ice Armour, Thunderstep | Energy Shield | ~560 Flash Freezes (Arc Lash shocks + Storm Cloak cold): an emergent stun-lock |
| Stormcaller | Thunderhead, Conduit, Flicker, Frozen Orb | Energy Shield | ~410 Flash Freezes from cloud + orb |
| Elementalist | Prismatic Arc, Searing, Implosion, Comet, Ice Armour | Energy Shield | all four reaction types in one run |

### Results (6 seeds each, Penitent, full descent)

| Build | Wins | Minutes | Trash TTK | Champion | Keeper | Grulk | Mygra | Malgoth | Top damage |
|---|---|---|---|---|---|---|---|---|---|
| Default (no Forms) | 6/6 | 34.2 | 0.7 | 4.9 | 14.7 | 44 | 60 | 197 | Firebolt 37% |
| Inferno | 6/6 | 32.7 | **0.6** | **4.0** | 15.6 | 49 | 58 | 193 | Firebolt 35% |
| Cryomancer | 6/6 | **30.4** | 0.6 | 4.5 | 12.9 | 38 | 61 | 139 | Ice Shard 52% |
| Battlemage | 6/6 | 31.4 | 0.9 | 6.6 | 12.5 | 44 | 66 | 167 | Spark 38% |
| Stormcaller | 6/6 | 32.4 | 1.1 | 4.5 | **11.6** | **29** | 63 | **123** | Chain Lightning 46% |
| Elementalist | 5/6 | 36.2 | 0.6 | 5.3 | 18.2 | 41 | 88 | 182 | Firebolt 47% |

All builds finish within about ±9% of each other, and each has a different strength: Inferno clears trash, Cryomancer
and Stormcaller kill bosses, and the Battlemage controls and survives. The balance suite (default plans) still passes.

## What tuning taught us

- **The class trait was invisible.** Reactions are the Magician's headline feature, but Overload did under 1% of
  damage in every build. A reaction build can't exist if reactions don't hit, so Overload now deals 100% of the
  lightning hit (it was 50%).
- **Determinism can kill a combo.** Prismatic Arc first cycled elements by jump index, so each enemy got the same
  element every cast and never reacted (0 Overloads). It now starts one element later on each cast.
- **Anti-synergy is a valid choice, but the bot has to respect it.** Searing consumes the burns Kindling and Pyre
  feed on. The Elementalist works with Searing (burns come from Prismatic Arc) and fails with Kindling.
- **Overperformers showed up in the damage share.** Glacial Lance did 50% of the Cryomancer's damage at 2.5× (now
  2.1×), and Thunderhead 59% at 0.35 per tick (now 0.3).

## Fixed along the way

- Teleport's rank-5 "3 charges" never applied: the charge regen read the raw skill, not the resolved one, so it
  clamped back to 2. `chargeTick` now resolves breakpoints and Forms.
- The bot never engaged Malgoth from more than 9 tiles away: its arena branch only looked for `rank === 'boss'`.
- Skill-slot letters: an assigned slot is now visibly filled, and its tooltip says "click to remove". (Learning a
  skill auto-assigns it, and clicking the lit letter silently unbound it.)

## Open

- **Mana is still the Magician's real limiter** in live play (3/70 mana mid-fight with Glacial Lance). Conduit and
  Prismatic Arc are opt-in fixes; the base economy may still need a look.
- **Forms are a pure power gain at rank 2.** The Magician is now ahead of the other classes until they get Forms.
  Next: the same pass for the Fighter, Assassin and Valkyrie, then retune the class bands together.
- The Elementalist is the weakest build and lost one run. A dedicated reaction payoff (for example an Attunement
  that rewards Reactions) would give it a home.
- The Assassin's sentries have no in-world sprite (`prop_sentry` art exists but nothing draws deployables).
- Tests: `test/forms.test.js` checks every Form's behaviour, the Form rules and the either-or Attunement.
