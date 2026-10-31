// Renders video/calendar-video.html frame by frame into one square MP4.
// The video's edges are the flat background colour #1a1a1a, so the same file
// can be placed on a 16:9, 1:1 or 9:16 canvas filled with that colour.
// Usage: node video/render.js [fps=30]
// Output: video/out/calendar-thu-fri.mp4 (1080x1080)
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const fps = +(process.argv[2] || 30);
const FORMATS = [{ name: 'thu-fri', w: 1080, h: 1080 }];
const only = process.env.ONLY;

(async () => {
  const outDir = path.join(__dirname, 'out');
  fs.mkdirSync(outDir, { recursive: true });
  const url = 'file://' + path.join(__dirname, 'calendar-video.html');
  const shot = async (page) => {
    for (let k = 0; ; k++) {
      try { return await page.screenshot({ type: 'png' }); }
      catch (e) { if (k >= 3) throw e; await page.waitForTimeout(200); }
    }
  };

  for (const f of FORMATS.filter(f => !only || f.name === only)) {
    // fresh browser per format: Chromium occasionally refuses the first capture on a reused one
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: f.w, height: f.h } });
    await page.goto(url);
    await page.evaluate(() => document.fonts.ready);
    const duration = await page.evaluate(() => window.DURATION);
    const frames = Math.round(duration * fps);
    const out = path.join(outDir, `calendar-${f.name}.mp4`);

    const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error',
      '-f', 'image2pipe', '-framerate', String(fps), '-i', '-',
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
    const done = new Promise((res, rej) => ff.on('close', c => c ? rej(new Error('ffmpeg ' + c)) : res()));

    for (let i = 0; i < frames; i++) {
      await page.evaluate(t => window.renderFrame(t), i / fps);
      const buf = await shot(page);
      if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    }
    ff.stdin.end();
    await done;
    await browser.close();
    console.log(`${f.name}: ${frames} frames -> ${out}`);
  }
})();
