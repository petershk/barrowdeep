// @ts-check
// Camera: follows the player's interpolated position (dt-based smoothing), trauma screenshake.
(function (BD) {
  'use strict';

  const iso = BD.view.iso;
  const cam = { x: 0, y: 0, init: false, trauma: 0, t: 0, shakeX: 0, shakeY: 0, lookX: 0, lookY: 0 };

  function snap(x, y) { cam.x = x; cam.y = y; cam.init = true; }

  /** tx,ty = fractional tile target. dtReal in ms. */
  function update(tx, ty, dtReal, canvasW, canvasH, lookAt) {
    if (!cam.init) snap(tx, ty);
    const k = 1 - Math.exp(-dtReal / 90);
    let gx = tx, gy = ty;
    if (lookAt) { gx += (lookAt.x - tx) * 0.1; gy += (lookAt.y - ty) * 0.1; }
    cam.x += (gx - cam.x) * k;
    cam.y += (gy - cam.y) * k;
    cam.t += dtReal;
    cam.trauma = Math.max(0, cam.trauma - (1.6 * dtReal) / 1000);
    const scale = BD.view.host.prefs.shake / 100;
    const amt = cam.trauma * cam.trauma * 14 * iso.view.Z * iso.view.dpr * scale;
    cam.shakeX = amt * noise(cam.t * 0.031, 1.7);
    cam.shakeY = amt * noise(cam.t * 0.029, 9.1);
    const v = iso.view;
    // centre the target, 40·Z px above screen centre
    v.ox = Math.round(canvasW / 2 - (cam.x - cam.y) * iso.HW * v.S);
    v.oy = Math.round(canvasH / 2 - 40 * v.Z * v.dpr - (cam.x + cam.y) * iso.HH * v.S);
  }

  function noise(t, seed) {
    return Math.sin(t * 1.0 + seed) * 0.5 + Math.sin(t * 2.3 + seed * 3.1) * 0.3 + Math.sin(t * 4.7 + seed * 7.7) * 0.2;
  }

  function addTrauma(a) { cam.trauma = Math.min(1, cam.trauma + a); }

  BD.view.camera = { cam, snap, update, addTrauma };
})(globalThis.BD);
