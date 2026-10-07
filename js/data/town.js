// @ts-check
// Town of Brennor (04 §7). All town points live here. Legend:
//  # wall   . ground   S/T/H/C building (Smith, Temple, Home, Curio)   1–4 door centres (3 wide)
//  s/t/h/c NPC spots   w well   W waypoint   o portal stone   @ spawn   E church stairs (2×2)
//  , graveyard   g gravestone   r road   b barrel   x crate   q tree
(function (BD) {
  'use strict';

  BD.data.town = {
    map: [
      '################################',
      '#.....q.................q.....q#',
      '#.SSSSSSS.....TTTTTTT....HHHHH.#',
      '#.SSSSSSS.....TTTTTTT....HHHHH.#',
      '#.SSSSSSS.....TTTTTTT....HHHHH.#',
      '#.SSS1SSS.....TTT2TTT....HH3HH.#',
      '#b...s.rrrrrrrrrrtrrrrrrrrrh..x#',
      '#.....rr.......r.........r....q#',
      '#..CCCCC.r....wr...W.....r.....#',
      '#..CCCCC.r.....r.........r.....#',
      '#..CC4CC.r.....r@......o.r.....#',
      '#x...c.rrr.....r.........r.....#',
      '#..............r.........r.....#',
      '#..q...........r.......,g,g,g,.#',
      '#..............r.......,,,,,,,.#',
      '#....b.........r.......g,g,g,,.#',
      '#..............######..,,,,,,,.#',
      '#.....q........#....#..,g,,g,,.#',
      '#..............#.EE.#..........#',
      '#..............#.EE.#........q.#',
      '#..............##..##..........#',
      '#..q..........................b#',
      '################################',
    ],
    npcs: {
      s: { role: 'smith', name: 'Garran the Smith', art: 'fighter', pal: { S: '#8a6a4a', s: '#5a4430', d: '#3a2a1a', R: '#3a2a1a', r: '#2a1a10' }, panel: 'smith' },
      t: { role: 'temple', name: 'Mother Alys', art: 'magician', pal: { P: '#e0d8c8', p: '#a8a090', q: '#706858', Y: '#ffe090' }, panel: 'temple' },
      h: { role: 'home', name: 'Your Hearth', art: 'thief', pal: { H: '#6a5a4a', h: '#4a3e32', x: '#2e261e' }, panel: 'home' },
      c: { role: 'curio', name: 'Vesk the Curio Dealer', art: 'valkyrie', pal: { A: '#7a4a8a', a: '#4a2a5a', H: '#c0a040', h: '#806a20' }, panel: 'curio' },
    },
    doors: { 1: 'smith', 2: 'temple', 3: 'home', 4: 'curio' },
    buildingLabels: { S: 'Smith', T: 'Temple', H: 'Home', C: 'Curio Dealer' },
  };
})(globalThis.BD);
