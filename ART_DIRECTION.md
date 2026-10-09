# Art direction: colour and effect language

The rulebook for how Barrowdeep looks. It extends the spec's presentation chapter (07) and resolves the
conflicts found in the art review of 2026-10-07. The values live in `js/view/palette.js`; `css/ui.css`
mirrors the UI ones as custom properties. Code outside those two files should name a meaning
(`MEANING.crit`, `var(--crit)`, `SCHOOL.cold`), never a hex.

## The two rules

1. **One meaning per colour, one colour per meaning.** If two things share a colour, they mean the same
   thing (e.g. Champion and Magic are both blue, as in Diablo II, because both say "one step up").
2. **Shape carries meaning as well as colour.** Colour-blind players, tiny status pips and busy fights
   all need a second cue: every element has its own shape motif, every status its own glyph,
   hostile zones a solid edge, friendly zones a dashed one.

## Elements and schools

| Element / school | core / mid / edge | Shape motif | Motion | Blend |
|---|---|---|---|---|
| Physical (`steel`) | `#ffffff / #cfd6e0 / #7a8494` | spikes, crescents, 4-ray star | fast out, 80–150 ms | additive |
| Fire | `#fff2b0 / #ff8a2a / #c8300f` | flicker tongues, embers | rises (negative gravity), 300–600 ms | additive |
| Cold | `#f4fdff / #7fe8ff / #1e90b8` | 6-ray crystal star, shards | bursts, then hangs, slow fade | additive |
| Lightning (`storm`) | `#f6f8ff / #9fb0ff / #4a50e0` | jagged forks, chain beams | instant 60–140 ms, strobes twice | additive |
| Poison | `#e8ffb0 / #8ed24a / #3d7a1a` | soft puffs, drips | slow drift, 500–900 ms | normal |
| Shadow | `#e8a8c8 / #a03070 / #2a0a24` | smoke | swirls inward | normal |
| Blood | `#f0744a / #c0341c / #7a1208` | spray, droplets | falls (gravity) | normal |
| Dust | `#d8d0bc / #9a917e / #5e5848` | rings of grit | spreads low, settles | normal |
| Holy | `#fffbe0 / #ffd75a / #d09a20` | columns, rays | downward then up | additive |
| Life (heals) | `#d8ffd0 / #6ad06a / #2e8a3e` | rising motes, leaves of light | upward | additive |
| Portal / souls | `#e8d0ff / #b06aff / #5a2a9a` | spirals | spirals in | additive |

- A skill's `school` matches its element. The exceptions are deliberate and listed here: Ki (Assassin
  martial arts, warm orange), Holy, and Life.
- Impact flashes take the school's **mid** colour with a small core; they are not white for every element.
  White flash means "physical hit" or "unit took damage" (the 120 ms body flash).
- Dark schools (`SCHOOL_NORMAL_BLEND`) draw with normal blending; additive blending can't show dark matter.
- Statuses take their element's mid colour: burning fire, chilled cold, frozen the cold **core**, shocked
  lightning, poisoned poison, bleeding blood.

## Danger and allegiance

| Meaning | Look |
|---|---|
| Hostile telegraph | red-orange `#ff3a1a`. Fill rises 0.16 → 0.56; the outline of the **whole shape** (no per-tile grid) gets stronger; one sweep from the edge to the centre shows time left; pulses at the danger beat |
| Hostile lingering zone (burning ground, poison pool) | element fill at about 0.35 plus a solid hostile-red outer edge |
| Friendly zone or telegraph | bone `#e8d8b0`, **dashed** outline, fill ≤ 0.2, ambient beat |
| Colour-blind hostile | magenta `#ff3aa0` plus hatching (orange collides with fire) |
| Monster wind-up | a red rim or outline that pulses, never a solid red silhouette replacing the sprite |
| "!" alert | hostile red-orange |
| Locked target | white crosshair and floor ring |
| Exposed | gold ring and "EXPOSED" (gold is crit and Exposed only) |

The red-orange hostile colour is reserved. Lava is a dark base with glowing veins, not a flat field of
that colour, and player effects never use it.

## UI and world meanings

| Meaning | Hex |
|---|---|
| Life / health flask | `#c41e1e` (low-life pulse `#ff3b30`) |
| Rage / Energy / Mana / Focus | `#c8461c` / `#3cc8b4` / `#3a6ee0` / `#f0e0a0` |
| XP | `#c8a870` (bronze) |
| Souls, portals, teleporting: the only purple | `#b06aff` |
| Good / ▲ / heal number | `#6ad06a` |
| Bad / ▼ / requirement unmet | `#e05050` |
| Damage dealt / taken | bone `#d8d0c0` / `#ff4a3a`, both with a dark outline |
| Crit number | `#ffd23a`, bigger, punch-scale, outline |
| Gold pickup | `#e8c050` |
| Rarity: common / magic / rare / legendary | `#d8d0c0` / `#7aa0e0` / `#e0c84a` / `#ff8a2a` |
| Champion = magic blue, Keeper/unique = rare gold, boss | `#7aa0e0` / `#e0c84a` / `#b0201a` |
| UI chrome (headings, focus), border | `#c9a227`, `#5a4a28` |
| Text / muted text / dim (never text) | `#d8d0c0` / `#9a9080` / `#5a5248` |

## Pulses

Only three periods for pulsing (07 §1.5): ambient 1.6 s, attention 0.6 s, danger 0.16 s.

## World and characters

- Values first. The floor is the darkest band, walls read lighter than the floor (top cap darker,
  with a lit near rim), and actors are the brightest. Only loot beams, telegraphs and effects outshine actors.
- Actors carry a 1-art-pixel light rim and a firm floor shadow so they separate from any floor.
- A monster's palette stays at least 25% in luminance or 90° in hue away from its biome's floor.
- Off-map is the biome's fog colour with a vignette, never pure black.

## UI

- Panels: gradient `--panel-a → --panel-b`, `--border`, Georgia, small caps for headings, never bold.
- Tooltips are fully opaque (`--tooltip-bg`) and never cover the element being hovered.
- Text is at least 12 px. `--dim` is for rules and empty slots, never for words.

## Zoom

The default zoom is **Auto**: 1.5×, raised to 2.0× or 2.5× while at least 14 tiles still fit across the
window (1.5× up to about 1880 px wide, 2.0× at 1920, 2.5× from about 2400). Players who pick a zoom keep it.

## Loot on the ground

- Every item glows in its rarity colour; motes rise faster with rarity.
- Light columns: legendaries a tall orange shaft, rares a short gold one, the seal and the gate key a tall
  red beam. Commons and magic items get none.
- A magic-or-better item shows its name in its rarity colour for 4 s after it lands (fading over the last
  0.6 s); Alt or hovering shows labels any time.
