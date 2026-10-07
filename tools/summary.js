// pipe tools/bot.js JSON in; print one line
let s = ''; process.stdin.on('data', (d) => (s += d)).on('end', () => {
  try { const r = JSON.parse(s.slice(s.indexOf('{'))); console.log(r.cls.padEnd(9), 'deepest', r.deepest, 'lvl', r.level, 'min', r.minutes, 'bossT', JSON.stringify(r.bossTimes), 'deaths', r.deaths.length, JSON.stringify(r.deaths.map((d) => d.floor + ':' + d.cause)), '\n   ttk', JSON.stringify(r.ttk), '\n   lvlAt', JSON.stringify(r.levelAtFloor), 'floorT', JSON.stringify(Object.fromEntries(Object.entries(r.floorTimes).map(([k, v]) => [k, Math.round(v)]))), '\n   skills', JSON.stringify(r.skillUse), 'gold', JSON.stringify(r.gold), 'items', JSON.stringify(r.items), 'real', r.realSeconds); }
  catch (e) { console.log(s.slice(0, 2000)); }
});
