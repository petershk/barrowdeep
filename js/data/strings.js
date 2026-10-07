// @ts-check
// Player-facing text. Terse, old-fashioned; no jokes in system text (01 §1).
(function (BD) {
  'use strict';

  const S = {
    stairs_sealed: 'The way down is sealed. Slay the Keeper.',
    seal_broken: 'The seal breaks. The way down is open.',
    gate_locked: 'The gate is barred. The Keeper holds its key.',
    gate_open: 'The gate groans open.',
    key_pickup: 'You take the Gate Key.',
    no_town_yet: 'The way back is barred.',
    waypoint_on: 'Waypoint attuned.',
    portal_open: 'A portal opens.',
    no_portal: 'You carry no Town Portal scroll.',
    no_flask: 'The flask is empty.',
    flask_cd: 'Not yet.',
    full_life: 'Already at full life.',
    keeper_reveal: '{name} guards the seal.',
    boss_slain: '{name} is slain.',
    act_complete: 'Act {act} complete.',
    level_up: 'Level {level}',
    legendary_found: 'Legendary: {name}',
    floor_cleared: 'The floor lies revealed.',
    countdown: '{n}',
    fight: 'Fight!',
    out_of_range: 'Out of range',
    no_target: 'No target',
    no_los: 'No line of sight',
    no_room: 'No room',
    not_ready: 'Not ready',
    no_resource: 'Not enough {res}',
    no_charges: 'No charges',
    cant_unsafe: 'Not while enemies are near.',
    saved: 'Saved.',
    save_failed: 'Saving failed: storage is full. Export your characters.',
    pack_full: 'Your pack is full.',
    victory: 'Malgoth falls. The barrow is silent.',
    death: 'You have died.',
    not_enough_gold: 'Not enough gold.',
    exposed: 'EXPOSED',
  };

  function t(key, vars) {
    let s = S[key] || key;
    if (vars) for (const k in vars) s = s.split('{' + k + '}').join(String(vars[k]));
    return s;
  }

  BD.data.strings = { S, t };
})(globalThis.BD);
