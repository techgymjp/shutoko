// 効果音 (すべて WebAudio で合成。音声ファイルなし)
let ctx = null, master = null, muted = false;
let eng = null, wind = null, squeal = null, scrape = null, rival = null;

function noiseBuffer(sec = 2) {
  const b = ctx.createBuffer(1, ctx.sampleRate * sec, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}
function noiseSrc() {
  const n = ctx.createBufferSource();
  n.buffer = noiseBuffer();
  n.loop = true;
  return n;
}

export const Sound = {
  init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.6;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp).connect(ctx.destination);

    // エンジン (V6 ターボの甲高い音: のこぎり波 2 本 + 矩形波, 歪ませてローパス)
    const g = ctx.createGain();
    g.gain.value = 0;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2400;
    lp.Q.value = 3;
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) { const x = (i / 255) * 2 - 1; curve[i] = Math.tanh(x * 2.5); }
    shaper.curve = curve;
    const o1 = ctx.createOscillator(); o1.type = 'sawtooth';
    const o2 = ctx.createOscillator(); o2.type = 'sawtooth';
    const o3 = ctx.createOscillator(); o3.type = 'square';
    const g3 = ctx.createGain(); g3.gain.value = 0.35;
    o1.connect(shaper); o2.connect(shaper); o3.connect(g3).connect(shaper);
    shaper.connect(lp).connect(g).connect(master);
    [o1, o2, o3].forEach((o) => o.start());
    eng = { g, lp, o1, o2, o3 };

    // 風切り音
    const wn = noiseSrc();
    const wf = ctx.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 600; wf.Q.value = 0.6;
    const wg = ctx.createGain(); wg.gain.value = 0;
    wn.connect(wf).connect(wg).connect(master);
    wn.start();
    wind = { g: wg, f: wf };

    // タイヤのスキール
    const sn = noiseSrc();
    const sf = ctx.createBiquadFilter(); sf.type = 'bandpass'; sf.frequency.value = 2600; sf.Q.value = 12;
    const sg = ctx.createGain(); sg.gain.value = 0;
    sn.connect(sf).connect(sg).connect(master);
    sn.start();
    squeal = { g: sg };

    // 壁こすり
    const cn = noiseSrc();
    const cf = ctx.createBiquadFilter(); cf.type = 'highpass'; cf.frequency.value = 1500;
    const cg = ctx.createGain(); cg.gain.value = 0;
    cn.connect(cf).connect(cg).connect(master);
    cn.start();
    scrape = { g: cg };

    // 近くのライバル車のエンジン (追い抜きのドップラー)
    const ro = ctx.createOscillator(); ro.type = 'sawtooth';
    const rf = ctx.createBiquadFilter(); rf.type = 'lowpass'; rf.frequency.value = 1800;
    const rg = ctx.createGain(); rg.gain.value = 0;
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    ro.connect(rf).connect(rg);
    if (pan) rg.connect(pan).connect(master); else rg.connect(master);
    ro.start();
    rival = { o: ro, g: rg, pan };
  },

  setMuted(m) {
    muted = m;
    if (master) master.gain.setTargetAtTime(m ? 0 : 0.6, ctx.currentTime, 0.05);
  },
  get muted() { return muted; },

  suspend() { if (ctx && ctx.state === 'running') ctx.suspend(); },
  resume() { if (ctx && ctx.state === 'suspended') ctx.resume(); },

  // rpm: 回転数, load: アクセル 0..1, speed: 0..1
  engine(rpm, load, speed, on = true) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const f = (rpm / 60) * 3; // V6: 1回転で3回の爆発
    eng.o1.frequency.setTargetAtTime(f, t, 0.02);
    eng.o2.frequency.setTargetAtTime(f * 1.005 + 2, t, 0.02);
    eng.o3.frequency.setTargetAtTime(f / 2, t, 0.02);
    eng.lp.frequency.setTargetAtTime(900 + load * 2600 + speed * 800, t, 0.05);
    eng.g.gain.setTargetAtTime(on ? 0.10 + load * 0.12 : 0, t, 0.05);
    wind.g.gain.setTargetAtTime(on ? speed * speed * 0.35 : 0, t, 0.1);
    wind.f.frequency.setTargetAtTime(400 + speed * 1200, t, 0.1);
  },
  skid(amount) {
    if (!ctx) return;
    squeal.g.gain.setTargetAtTime(Math.min(0.25, amount * 0.25), ctx.currentTime, 0.05);
  },
  scrape(amount) {
    if (!ctx) return;
    scrape.g.gain.setTargetAtTime(Math.min(0.35, amount * 0.35), ctx.currentTime, 0.03);
  },
  rival(dist, rel, pan) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const vol = dist < 60 ? (1 - dist / 60) * 0.12 : 0;
    rival.g.gain.setTargetAtTime(vol, t, 0.05);
    rival.o.frequency.setTargetAtTime(520 * (1 + rel * 0.004), t, 0.05);
    if (rival.pan) rival.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, pan)), t, 0.05);
  },
  silence() {
    if (!ctx) return;
    const t = ctx.currentTime;
    for (const x of [eng.g, wind.g, squeal.g, scrape.g, rival.g]) x.gain.setTargetAtTime(0, t, 0.05);
  },

  // ぶつかった音 (power 0..1)
  crash(power = 1) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const n = ctx.createBufferSource();
    n.buffer = noiseBuffer(0.6);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(5000, t); f.frequency.exponentialRampToValueAtTime(300, t + 0.4);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.5 + power * 0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    n.connect(f).connect(g).connect(master);
    n.start(t); n.stop(t + 0.6);
    // ドンという低音
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.3);
    const og = ctx.createGain(); og.gain.setValueAtTime(0.6 * power + 0.2, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    o.connect(og).connect(master);
    o.start(t); o.stop(t + 0.4);
    // カーボンの破片がはねる音
    for (let i = 0; i < 4; i++) {
      const tt = t + 0.05 + Math.random() * 0.3;
      const c = ctx.createOscillator(); c.type = 'triangle';
      c.frequency.setValueAtTime(1800 + Math.random() * 2500, tt);
      const cg = ctx.createGain(); cg.gain.setValueAtTime(0.08 * power, tt); cg.gain.exponentialRampToValueAtTime(0.001, tt + 0.06);
      c.connect(cg).connect(master);
      c.start(tt); c.stop(tt + 0.08);
    }
  },
  shift() {
    if (!ctx) return;
    const t = ctx.currentTime;
    const n = ctx.createBufferSource();
    n.buffer = noiseBuffer(0.1);
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    n.connect(f).connect(g).connect(master);
    n.start(t); n.stop(t + 0.1);
  },
  beep(high) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'square';
    o.frequency.value = high ? 1320 : 660;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.18, t); g.gain.exponentialRampToValueAtTime(0.001, t + (high ? 0.6 : 0.25));
    o.connect(g).connect(master);
    o.start(t); o.stop(t + 0.7);
  },
  fanfare() {
    if (!ctx) return;
    const t = ctx.currentTime;
    [523, 659, 784, 1047, 784, 1047].forEach((f, i) => {
      const o = ctx.createOscillator(); o.type = 'square';
      o.frequency.value = f;
      const g = ctx.createGain();
      const tt = t + i * 0.14;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.setValueAtTime(0.12, tt); g.gain.exponentialRampToValueAtTime(0.001, tt + (i === 5 ? 0.8 : 0.13));
      o.connect(g).connect(master);
      o.start(tt); o.stop(tt + 0.9);
    });
  },
};
