// Renders a frame-driven page (one that defines window.renderFrame(t) and
// window.DURATION) frame by frame into an MP4.
//
// Usage: node video/render.js [page.html] [WIDTHxHEIGHT] [output.mp4] [fps]
// Defaults: calendar-video.html 1080x1080 out/calendar-thu-fri.mp4 30
//
// Examples:
//   node video/render.js                                    # calendar, square
//   node video/render.js beef-card.html 1920x818 out/beef-card.mp4
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const pageFile = process.argv[2] || 'calendar-video.html';
const [w, h] = (process.argv[3] || '1080x1080').split('x').map(Number);
const out = path.resolve(__dirname, process.argv[4] || 'out/calendar-thu-fri.mp4');
const fps = +(process.argv[5] || 30);

(async () => {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.goto('file://' + path.join(__dirname, pageFile));
  await page.evaluate(() => document.fonts.ready);
  const frames = Math.round(await page.evaluate(() => window.DURATION) * fps);

  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error',
    '-f', 'image2pipe', '-framerate', String(fps), '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => ff.on('close', c => c ? rej(new Error('ffmpeg ' + c)) : res()));

  // Chromium occasionally refuses a capture; retry a few times
  const shot = async () => {
    for (let k = 0; ; k++) {
      try { return await page.screenshot({ type: 'png' }); }
      catch (e) { if (k >= 3) throw e; await page.waitForTimeout(200); }
    }
  };

  for (let i = 0; i < frames; i++) {
    await page.evaluate(t => window.renderFrame(t), i / fps);
    const buf = await shot();
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
  }
  ff.stdin.end();
  await done;
  await browser.close();
  console.log(`${pageFile}: ${frames} frames ${w}x${h} -> ${out}`);
})();
