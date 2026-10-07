// @ts-check
// Sounds as data (07 §5.2), ported from the original game's synth recipes. One interpreter plays
// every entry: layers of tone(osc, f:[f0,f1], t, dur, vol) or noise(filter, f:[f0,f1], q, t, dur, vol).
// `repeat` re-plays a layer n times every dt seconds; `rand` randomises a layer's frequency.
(function (BD) {
  'use strict';

  const S = {};
  const o = (osc, f, t, dur, vol, extra) => Object.assign({ osc, f, t, dur, vol }, extra || {});
  const n = (noise, f, q, t, dur, vol, extra) => Object.assign({ noise, f, q, t, dur, vol }, extra || {});
  const snd = (id, layers, jitter, extra) => { S[id] = Object.assign({ layers, jitter: jitter || { pitch: 0.06, vol: 0.1 } }, extra || {}); };

  // ---- weapon-voiced melee ----
  snd('melee_dagger', [n('bandpass', [3300, 1500], 1.3, 0, 0.05, 0.06), o('sine', [300, 130], 0, 0.05, 0.04)]);
  snd('melee_sword', [o('sine', [150, 50], 0, 0.08, 0.07), n('bandpass', [2700, 900], 0.9, 0, 0.09, 0.08), o('triangle', [720, 300], 0, 0.1, 0.04)]);
  snd('melee_club', [o('sine', [150, 58], 0, 0.11, 0.12), n('lowpass', [700, 240], 0.6, 0, 0.07, 0.07), o('square', [120, 70], 0, 0.06, 0.04)]);
  snd('melee_mace', [
    o('sine', [110, 34], 0, 0.16, 0.15),
    n('bandpass', [2200, 480], 0.8, 0, 0.1, 0.1),
    o('triangle', [520, 180], 0.01, 0.14, 0.05),
    n('lowpass', [400, 140], 0.6, 0, 0.16, 0.05),
  ]);
  snd('melee_staff', [n('bandpass', [1400, 600], 0.7, 0, 0.1, 0.05), o('sine', [200, 90], 0.01, 0.09, 0.08), o('square', [180, 100], 0, 0.05, 0.03)]);
  snd('crit_ring', [o('triangle', [1000, 280], 0, 0.13, 0.05)]);
  snd('bash', [
    o('sine', [175, 36], 0, 0.17, 0.15),
    o('square', [110, 48], 0, 0.12, 0.06),
    n('bandpass', [3000, 600], 0.8, 0, 0.12, 0.1),
    n('lowpass', [500, 150], 0.6, 0, 0.2, 0.05),
    o('triangle', [760, 220], 0.01, 0.16, 0.05),
  ]);
  snd('ranged_impact', [n('bandpass', [2000, 700], 1, 0, 0.05, 0.05), o('sine', [180, 80], 0, 0.06, 0.05)]);
  snd('hurt', [o('sawtooth', [150, 60], 0, 0.14, 0.12), n('lowpass', [900, 300], 0.7, 0, 0.1, 0.06)]);
  snd('miss', [n('bandpass', [1500, 500], 0.8, 0, 0.13, 0.04)]);
  snd('block', [n('bandpass', [3200, 2400], 6, 0, 0.12, 0.08), o('triangle', [1400, 1200], 0, 0.18, 0.05), o('square', [240, 180], 0, 0.06, 0.04)]);
  snd('dodge', [n('bandpass', [2400, 900], 1.1, 0, 0.1, 0.04)]);
  // ---- ranged attacks ----
  snd('bow', [n('bandpass', [900, 2400], 2, 0, 0.08, 0.05), o('triangle', [220, 110], 0, 0.09, 0.05)]);
  snd('crossbow', [o('square', [160, 70], 0, 0.06, 0.07), n('lowpass', [900, 300], 0.8, 0, 0.08, 0.06)]);
  snd('wand', [o('sine', [1300, 520], 0, 0.13, 0.06), o('triangle', [1950, 880], 0.01, 0.1, 0.03), n('bandpass', [4200, 2600], 1.5, 0, 0.08, 0.025)]);
  snd('javelin', [n('bandpass', [700, 1800], 1.2, 0, 0.16, 0.05), o('sine', [260, 120], 0, 0.12, 0.04)]);
  snd('evade', [n('bandpass', [1800, 600], 1.2, 0, 0.16, 0.06), n('highpass', [3000, 2000], 0.8, 0.02, 0.08, 0.02)]);
  snd('denied', [o('square', [180, 160], 0, 0.08, 0.04), o('square', [140, 120], 0.08, 0.1, 0.04)], { pitch: 0, vol: 0 });
  // ---- magic ----
  snd('spell', [o('sine', [620, 940], 0, 0.16, 0.05), o('sine', [930, 1360], 0.02, 0.12, 0.025)]);
  snd('fire_cast', [n('bandpass', [600, 1800], 0.8, 0, 0.22, 0.06), o('sawtooth', [180, 320], 0, 0.18, 0.03)]);
  snd('fire_hit', [n('lowpass', [1600, 300], 0.6, 0, 0.3, 0.09), o('sine', [140, 60], 0, 0.25, 0.08), n('bandpass', [900, 400], 1, 0.03, 0.2, 0.04)]);
  snd('explosion', [o('sine', [140, 40], 0, 0.45, 0.16), n('lowpass', [1800, 200], 0.6, 0, 0.45, 0.12), n('bandpass', [2500, 600], 1, 0, 0.12, 0.06)]);
  snd('cold_hit', [o('triangle', [1800, 900], 0, 0.14, 0.04), n('highpass', [5000, 3000], 1, 0, 0.18, 0.05), o('sine', [2600, 2400], 0.02, 0.2, 0.02)]);
  snd('zap', [
    o('sawtooth', [2000, 240], 0, 0.16, 0.06),
    o('square', [3000, 700], 0.005, 0.09, 0.025),
    n('highpass', [4500, 2800], 0.9, 0, 0.13, 0.05),
    n('bandpass', [2400, 1400], 10, 0.01, 0.035, 0.045, { repeat: { n: 5, dt: 0.022 }, rand: 1600 }),
  ]);
  snd('poison_hit', [n('bandpass', [700, 300], 3, 0, 0.25, 0.05), o('sine', [260, 180], 0, 0.2, 0.03)]);
  snd('teleport', [
    o('sine', [520, 1500], 0, 0.3, 0.045),
    o('sine', [655, 1900], 0.02, 0.3, 0.03),
    n('highpass', [6000, 5000], 0.9, 0, 0.05, 0.018, { repeat: { n: 6, dt: 0.04 } }),
  ]);
  snd('reaction', [o('triangle', [880, 1760], 0, 0.2, 0.05), o('sine', [1320, 2640], 0.03, 0.2, 0.03), n('highpass', [5000, 3000], 1, 0, 0.15, 0.03)]);
  snd('ki_charge', [
    o('sawtooth', [150, 540], 0, 0.26, 0.045),
    o('sine', [300, 1080], 0.015, 0.24, 0.04),
    n('bandpass', [1100, 4200], 2.6, 0, 0.22, 0.03),
    o('triangle', [1500, 2300], 0.19, 0.08, 0.034),
  ], null, { stackPitch: 0.16 });
  snd('ki_release', [
    o('sine', [150, 48], 0, 0.34, 0.16),
    o('sawtooth', [92, 40], 0, 0.26, 0.08),
    n('bandpass', [2700, 800], 1.3, 0, 0.09, 0.09),
    n('highpass', [5200, 3200], 0.9, 0, 0.18, 0.04),
  ]);
  snd('shout', [o('sawtooth', [180, 120], 0, 0.5, 0.08), o('sawtooth', [240, 150], 0, 0.5, 0.05), n('bandpass', [600, 300], 0.8, 0, 0.45, 0.05)]);
  snd('heal', [o('sine', [520, 780], 0, 0.3, 0.04), o('triangle', [780, 1170], 0.08, 0.3, 0.03)]);
  snd('summon', [
    o('sine', [220, 660], 0, 0.5, 0.05),
    o('triangle', [1320, 880], 0.1, 0.4, 0.03),
    n('highpass', [5000, 4000], 0.9, 0, 0.06, 0.015, { repeat: { n: 5, dt: 0.07 } }),
  ]);
  // ---- monsters & bosses ----
  snd('windup', [o('sawtooth', [70, 240], 0, 0.42, 0.05), o('sawtooth', [104, 300], 0, 0.42, 0.03), n('bandpass', [300, 1000], 0.6, 0, 0.42, 0.03)]);
  snd('slam', [
    o('sine', [150, 44], 0, 0.42, 0.15),
    o('sawtooth', [95, 40], 0, 0.36, 0.09),
    n('lowpass', [420, 90], 0.7, 0, 0.32, 0.1),
    n('bandpass', [2400, 700], 1.3, 0, 0.08, 0.07),
  ]);
  snd('boss_wake', [o('sawtooth', [60, 38], 0, 0.9, 0.12), o('sawtooth', [91, 50], 0, 0.9, 0.07), n('lowpass', [200, 80], 0.5, 0, 0.8, 0.06)], { pitch: 0.02, vol: 0 });
  snd('boss_enrage', [
    o('sawtooth', [80, 45], 0, 1.1, 0.13),
    o('square', [120, 60], 0, 1.0, 0.05),
    n('lowpass', [300, 90], 0.5, 0, 1.0, 0.07),
    o('triangle', [440, 220], 0.4, 0.6, 0.04),
  ], { pitch: 0.02, vol: 0 });
  snd('exposed', [o('triangle', [1046, 1046], 0, 0.25, 0.05), o('triangle', [1568, 1568], 0.06, 0.3, 0.04), o('sine', [2093, 2093], 0.12, 0.3, 0.02)], { pitch: 0, vol: 0 });
  snd('boss_defeat', [
    o('sawtooth', [120, 30], 0, 1.4, 0.1),
    n('lowpass', [600, 60], 0.5, 0, 1.2, 0.08),
    o('triangle', [523, 523], 0.6, 0.6, 0.05),
    o('triangle', [659, 659], 0.72, 0.6, 0.05),
    o('triangle', [784, 784], 0.84, 0.8, 0.05),
  ], { pitch: 0, vol: 0 });
  snd('dread', [o('sine', [64, 42], 0, 0.2, 0.09), o('sine', [80, 50], 0.17, 0.16, 0.06), n('lowpass', [120, 55], 0.6, 0, 0.22, 0.035)], { pitch: 0, vol: 0 });
  snd('heartbeat', [o('sine', [92, 60], 0, 0.16, 0.08), o('sine', [110, 70], 0.15, 0.13, 0.05)], { pitch: 0, vol: 0 });
  snd('alert', [o('square', [520, 700], 0, 0.06, 0.02)]);
  snd('death_undead', [n('bandpass', [2600, 1800], 6, 0, 0.05, 0.06, { repeat: { n: 4, dt: 0.04 } }), o('sine', [200, 110], 0, 0.18, 0.04)]);
  snd('death_beast', [o('sawtooth', [900, 180], 0, 0.22, 0.06), n('bandpass', [1800, 600], 1.5, 0, 0.2, 0.05)]);
  snd('death_demon', [o('sawtooth', [150, 55], 0, 0.4, 0.1), o('square', [90, 45], 0, 0.4, 0.05), n('lowpass', [520, 150], 0.6, 0, 0.36, 0.05)]);
  snd('death_human', [o('sawtooth', [300, 120], 0, 0.25, 0.06), n('lowpass', [800, 200], 0.6, 0, 0.2, 0.04)]);
  snd('death_construct', [
    n('lowpass', [700, 120], 0.6, 0, 0.4, 0.1),
    o('square', [140, 60], 0, 0.3, 0.05),
    n('bandpass', [2400, 1200], 4, 0.02, 0.06, 0.05, { repeat: { n: 3, dt: 0.05 } }),
  ]);
  snd('player_death', [o('sawtooth', [220, 55], 0, 1.4, 0.1), o('sine', [110, 40], 0, 1.6, 0.1), n('lowpass', [500, 80], 0.5, 0, 1.4, 0.06)], { pitch: 0, vol: 0 });
  // ---- loot, items, UI ----
  snd('gold', [
    o('triangle', [2300, 2160], 0, 0.06, 0.03, { repeat: { n: 5, dt: 0.032 }, rand: 1600 }),
    o('square', [3380, 3220], 0, 0.045, 0.012, { repeat: { n: 5, dt: 0.032 }, rand: 2300 }),
    n('highpass', [6500, 4200], 0.8, 0, 0.012, 0.022, { repeat: { n: 5, dt: 0.032 } }),
  ]);
  snd('loot', [o('sine', [340, 120], 0, 0.13, 0.09), n('bandpass', [1700, 700], 1.4, 0, 0.1, 0.07), o('triangle', [560, 400], 0.05, 0.09, 0.05)]);
  snd('drop_magic', [o('triangle', [1200, 1500], 0, 0.25, 0.03), o('sine', [1800, 2200], 0.04, 0.22, 0.02)], { pitch: 0.03, vol: 0 });
  snd('drop_rare', [
    o('triangle', [523, 523], 0, 0.5, 0.04),
    o('triangle', [659, 659], 0.02, 0.5, 0.035),
    o('triangle', [784, 784], 0.04, 0.5, 0.03),
    n('highpass', [6000, 4000], 0.9, 0, 0.3, 0.012),
  ], { pitch: 0, vol: 0 });
  snd('drop_legendary', [
    o('sine', [880, 880], 0, 1.4, 0.06),
    o('sine', [1320, 1320], 0, 1.2, 0.03),
    o('triangle', [1760, 1760], 0.02, 0.9, 0.02),
    n('highpass', [7000, 5000], 0.9, 0.05, 0.05, 0.015, { repeat: { n: 8, dt: 0.07 } }),
  ], { pitch: 0, vol: 0 });
  snd('equip_cloth', [n('bandpass', [1400, 900], 1, 0, 0.12, 0.05)]);
  snd('equip_leather', [n('bandpass', [900, 500], 1.4, 0, 0.12, 0.06), o('triangle', [400, 300], 0.04, 0.06, 0.03)]);
  snd('equip_metal', [o('triangle', [900, 700], 0, 0.18, 0.05), n('bandpass', [3000, 2000], 3, 0, 0.1, 0.05), o('square', [300, 200], 0, 0.05, 0.03)]);
  snd('equip_jewel', [o('triangle', [2600, 2500], 0, 0.15, 0.03), o('sine', [3900, 3800], 0.03, 0.15, 0.02)]);
  snd('ui_click', [o('triangle', [1200, 900], 0, 0.04, 0.03)], { pitch: 0, vol: 0 });
  snd('ui_confirm', [o('triangle', [660, 880], 0, 0.1, 0.04), o('triangle', [990, 1320], 0.05, 0.12, 0.03)], { pitch: 0, vol: 0 });
  snd('ui_cancel', [o('triangle', [660, 440], 0, 0.1, 0.035)], { pitch: 0, vol: 0 });
  snd('buy', [o('triangle', [2400, 2200], 0, 0.06, 0.03, { repeat: { n: 3, dt: 0.04 } }), o('triangle', [880, 1100], 0.1, 0.12, 0.03)]);
  snd('sell', [o('triangle', [1800, 1600], 0, 0.06, 0.03, { repeat: { n: 3, dt: 0.04 } })]);
  snd('flask', [
    o('sine', [330, 165], 0, 0.085, 0.065, { repeat: { n: 3, dt: 0.105 }, rand: 90 }),
    n('bandpass', [680, 240], 7, 0, 0.07, 0.03, { repeat: { n: 3, dt: 0.105 } }),
    o('triangle', [1700, 2300], 0.34, 0.16, 0.02),
  ]);
  snd('level', [
    o('triangle', [523, 523], 0, 0.3, 0.05),
    o('triangle', [659, 659], 0.08, 0.3, 0.05),
    o('triangle', [784, 784], 0.16, 0.3, 0.05),
    o('triangle', [1047, 1047], 0.24, 0.4, 0.05),
  ], { pitch: 0, vol: 0 });
  snd('fanfare', [
    o('triangle', [392, 392], 0, 0.28, 0.05),
    o('triangle', [523, 523], 0.11, 0.28, 0.05),
    o('triangle', [659, 659], 0.22, 0.28, 0.05),
    o('triangle', [784, 784], 0.33, 0.28, 0.05),
    o('triangle', [1047, 1047], 0.48, 0.55, 0.045),
  ], { pitch: 0, vol: 0 });
  snd('victory', [
    o('triangle', [523, 523], 0, 0.3, 0.06),
    o('triangle', [659, 659], 0.12, 0.3, 0.06),
    o('triangle', [784, 784], 0.24, 0.3, 0.06),
    o('triangle', [1047, 1047], 0.36, 0.3, 0.06),
    o('triangle', [523, 523], 0.5, 0.95, 0.04),
    o('triangle', [659, 659], 0.5, 0.95, 0.04),
    o('triangle', [784, 784], 0.5, 0.95, 0.04),
    o('sawtooth', [262, 262], 0.5, 0.95, 0.022),
    o('sawtooth', [392, 392], 0.5, 0.95, 0.022),
  ], { pitch: 0, vol: 0 });
  // ---- world ----
  snd('door', [n('lowpass', [500, 200], 0.7, 0, 0.3, 0.06), o('square', [120, 90], 0, 0.1, 0.03)]);
  snd('chest', [
    o('square', [190, 85], 0, 0.05, 0.06),
    n('highpass', [2800, 1900], 1, 0, 0.04, 0.04),
    n('bandpass', [430, 980], 8, 0.05, 0.4, 0.05),
    o('sine', [150, 70], 0.34, 0.12, 0.05),
  ]);
  snd('trap', [n('highpass', [3200, 2000], 1, 0, 0.05, 0.05), o('square', [320, 120], 0.01, 0.18, 0.05)]);
  snd('seal_break', [
    o('sine', [220, 110], 0, 1.2, 0.08),
    n('bandpass', [1200, 300], 1, 0, 0.8, 0.06),
    o('triangle', [880, 440], 0.1, 0.8, 0.04),
    o('sine', [60, 40], 0, 1.4, 0.1),
  ], { pitch: 0, vol: 0 });
  snd('gate', [n('lowpass', [420, 130], 0.6, 0, 0.9, 0.08), o('sine', [90, 50], 0, 0.9, 0.08), o('square', [70, 60], 0.2, 0.5, 0.03)], { pitch: 0, vol: 0 });
  snd('portal', [
    o('sine', [80, 480], 0, 0.7, 0.07),
    o('sine', [84, 500], 0, 0.7, 0.05),
    o('triangle', [1400, 350], 0.05, 0.55, 0.035),
    o('sine', [700, 900], 0.25, 0.18, 0.03, { repeat: { n: 4, dt: 0.09 } }),
  ], { pitch: 0, vol: 0 });
  snd('waypoint', [
    o('sine', [440, 880], 0, 0.5, 0.05),
    o('triangle', [660, 1320], 0.08, 0.5, 0.03),
    n('highpass', [6000, 5000], 0.9, 0, 0.05, 0.018, { repeat: { n: 6, dt: 0.06 } }),
  ], { pitch: 0, vol: 0 });
  snd('stairs', [n('lowpass', [420, 130], 0.6, 0, 0.34, 0.07), o('sine', [150, 90], 0, 0.3, 0.04)]);
  snd('step_stone', [n('lowpass', [500, 200], 0.8, 0, 0.05, 0.012)], { pitch: 0.15, vol: 0.3 });
  snd('step_dirt', [n('lowpass', [350, 150], 0.8, 0, 0.06, 0.012)], { pitch: 0.15, vol: 0.3 });
  snd('countdown', [o('triangle', [440, 440], 0, 0.25, 0.06), o('sine', [220, 220], 0, 0.3, 0.05)], { pitch: 0, vol: 0 });
  snd('countdown_go', [o('sawtooth', [220, 440], 0, 0.4, 0.06), o('triangle', [880, 880], 0.05, 0.4, 0.05)], { pitch: 0, vol: 0 });
  snd('announce', [o('triangle', [523, 523], 0, 0.3, 0.03), o('triangle', [784, 784], 0.1, 0.4, 0.03)], { pitch: 0, vol: 0 });
  snd('rest', [o('sine', [392, 392], 0, 0.6, 0.04), o('sine', [494, 494], 0.15, 0.6, 0.035), o('sine', [587, 587], 0.3, 0.8, 0.03)], { pitch: 0, vol: 0 });

  BD.audio.sounds = S;
})(globalThis.BD);
