BD.debug.autotests.skills = (D) => {
  const w = D.newRun({ cls: 'fighter', seed: 'sk', floor: 1, firstSkill: 'bash' });
  const p = w.player; p.level = 14; p.unspent.skill = 6; p.skills.bash = 3; p.skills.charge = 2; p.skills.war_cry = 1; p.skills.earthshaker = 1;
  p.bar.s1 = 'charge'; p.bar.s2 = 'war_cry'; p.bar.s3 = 'earthshaker';
  BD.sim.stats.bump(p);
  D.step(100); D.render(5); D.capture();
  BD.ui.panels.open('skills');
  const card = document.querySelectorAll('.skill-card')[1];
  card.dispatchEvent(new MouseEvent('mouseenter'));
};
