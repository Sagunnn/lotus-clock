/*!
 * <lotus-clock> — a kinetic clock web component.
 * Straight lines that curl into a lotus as the minute turns.
 * MIT License · https://github.com/Sagunnn/lotus-clock
 */

const NS = 'http://www.w3.org/2000/svg';
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);
const ease = (t) => 1 - Math.pow(1 - t, 3);
const inOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const smoothstep = (x) => x * x * (3 - 2 * x);
const pad = (n) => String(n).padStart(2, '0');
const reduceMotion = typeof matchMedia === 'function'
  ? matchMedia('(prefers-reduced-motion: reduce)')
  : { matches: false, addEventListener() {} };

/* Tuning */
const GROW_MS = 800;          // a new line grows out from the centre
const RETRACT_MS = 750;       // lines draw back in at the end of the minute
const STEP_MS = 650;          // the dial steps one place each second
const STEP = -TAU / 60;       // …counterclockwise
const SPIN_FROM = 56000;      // final full turn starts at :56
const CONVERGE_FROM = 58200;  // rings close in on the digits
const GLOW_MS = 1700;         // ripple of light through the digits at :00
const TWIST_K = 0.26;         // twist a line keeps per radian the dial turns
const LAG_K = 250;            // extra trail while the dial moves (rad per rad/ms)
const SAMPLES = 40;

/* ---------------------------------------------------------------------------
 * Sound: a synthesised Tibetan singing bowl, shared by every clock on the page.
 * Web Audio only, no files. Browsers need a user gesture before audio can play,
 * so the context is created on the first click/keypress after sound is wanted.
 * ------------------------------------------------------------------------- */
const bowl = (() => {
  const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  const ROOT = 216;
  const PENTA = [216, 243, 273, 324, 364];
  let ctx = null, bus = null, noise = null, armed = false;

  function init() {
    if (ctx) return true;
    if (!AC) return false;
    ctx = new AC();
    const master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
    const warm = ctx.createBiquadFilter(); warm.type = 'lowpass'; warm.frequency.value = 1800; warm.Q.value = 0.4;
    const len = Math.floor(ctx.sampleRate * 3), ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.4);
    }
    const verb = ctx.createConvolver(); verb.buffer = ir;
    const dry = ctx.createGain(); dry.gain.value = 0.75;
    const wet = ctx.createGain(); wet.gain.value = 0.4;
    const echo = ctx.createDelay(1); echo.delayTime.value = 0.27;
    const fb = ctx.createGain(); fb.gain.value = 0.25;
    const echoOut = ctx.createGain(); echoOut.gain.value = 0.1;
    warm.connect(dry).connect(master);
    warm.connect(verb).connect(wet).connect(master);
    warm.connect(echo); echo.connect(fb).connect(echo); echo.connect(echoOut).connect(master);
    bus = warm;
    const n = Math.floor(ctx.sampleRate * 4);
    noise = ctx.createBuffer(1, n, ctx.sampleRate);
    const nd = noise.getChannelData(0);
    for (let i = 0; i < n; i++) nd[i] = Math.random() * 2 - 1;
    return true;
  }

  // Create/resume the audio context on the first user gesture (autoplay rules).
  function arm() {
    if (armed || typeof window === 'undefined') return;
    armed = true;
    const unlock = () => { if (init()) ctx.resume(); };
    window.addEventListener('pointerdown', unlock, { capture: true });
    window.addEventListener('keydown', unlock, { capture: true });
  }

  // Sounds are scheduled once a context exists; a suspended one plays them when it resumes.
  const ok = () => !!ctx && ctx.state !== 'closed';

  function voice(freq, t, attack, peak, decay) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    o.connect(g).connect(bus);
    o.start(t);
    o.stop(t + attack + decay + 0.1);
  }

  // Struck bowl: fundamental, a 1.8 Hz beating partner, two bronze partials.
  function strike(f0 = ROOT, peak = 0.15, decay = 7, delay = 0) {
    if (!ok()) return;
    const t = ctx.currentTime + delay + 0.01;
    const f = f0 * (1 + (Math.random() - 0.5) * 0.004);
    voice(f, t, 0.04, peak, decay);
    voice(f + 1.8, t, 0.04, peak * 0.8, decay);
    voice(f * 2.71, t, 0.04, peak * 0.4, decay / 2);
    voice(f * 4.83, t, 0.04, peak * 0.22, decay / 2);
  }

  // Rim rub: a breathy swell.
  function sing(f = ROOT, peak = 0.04, attack = 0.3, release = 2.5) {
    if (!ok()) return;
    const t = ctx.currentTime + 0.01;
    voice(f, t, attack, peak, release);
    voice(f + 1.8, t, attack, peak * 0.7, release);
    voice(f * 2.71, t, attack, peak * 0.12, release * 0.6);
    const src = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noise;
    bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 22;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak * 1.4, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + release);
    src.connect(bp).connect(g).connect(bus);
    src.start(t, Math.random() * 2);
    src.stop(t + attack + release + 0.1);
  }

  // A soft water-drop for each second's ripple.
  function drop(delay = 0) {
    if (!ok()) return;
    const t = ctx.currentTime + delay + 0.01;
    const f = PENTA[Math.floor(Math.random() * PENTA.length)] * 4;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(f * 0.7, t);
    o.frequency.exponentialRampToValueAtTime(f * 1.15, t + 0.09);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.03, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
    o.connect(g).connect(bus);
    o.start(t);
    o.stop(t + 0.4);
  }

  return {
    ROOT, arm,
    // A deliberate press can start audio itself (it is a gesture).
    wake() { if (init()) ctx.resume(); },
    strike, sing, drop,
  };
})();

/* ---------------------------------------------------------------------------
 * Styles (inside the shadow root). Theme with the --lc-* custom properties.
 * ------------------------------------------------------------------------- */
const STYLES = `
:host {
  --_ink: var(--lc-ink, currentColor);
  --_line: var(--lc-line, color-mix(in srgb, var(--_ink) 20%, transparent));
  --_accent: var(--lc-accent, #8a4fd6);
  --_glow: var(--lc-glow, color-mix(in srgb, var(--_accent) 35%, transparent));
  display: block; position: relative; aspect-ratio: 1 / 1; min-width: 200px; min-height: 200px;
  color: var(--_ink); background: var(--lc-paper, transparent);
  font-family: var(--lc-font-mono, ui-monospace, "SF Mono", Menlo, Consolas, monospace);
  contain: layout paint; -webkit-user-select: none; user-select: none;
}
:host([hidden]) { display: none; }
.stage { position: absolute; inset: 0; }
svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none; }
.line { fill: none; stroke: var(--_line); stroke-width: .75; stroke-linecap: round; vector-effect: non-scaling-stroke; }
.line.now { stroke: var(--_accent); stroke-opacity: .9; }
text {
  font-family: inherit; font-size: 10px; letter-spacing: .04em; font-variant-numeric: tabular-nums;
  fill: currentColor; text-anchor: middle; dominant-baseline: central; opacity: 0; transition: opacity .5s;
}
text.on { opacity: .42; }
text.now { opacity: 1; font-weight: 600; }
.ripple { fill: none; stroke: currentColor; stroke-opacity: .5; stroke-width: .75; vector-effect: non-scaling-stroke; }
.ripple.big { stroke: var(--_accent); stroke-opacity: .55; }
.converge { fill: none; stroke: var(--_accent); stroke-opacity: .75; stroke-width: .9; vector-effect: non-scaling-stroke; opacity: 0; }
.lotus { opacity: 0; }
.lotus path { fill: var(--_accent); stroke: var(--_accent); stroke-opacity: .5; stroke-width: .75; stroke-linejoin: round; vector-effect: non-scaling-stroke; }
.r0 path { fill-opacity: .13; } .r1 path { fill-opacity: .2; } .r2 path { fill-opacity: .3; }
.clock {
  position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
  display: flex; align-items: baseline; white-space: nowrap;
  font-family: var(--lc-font-display, "Inter Tight", "Helvetica Neue", Helvetica, Arial, sans-serif);
  font-weight: var(--lc-font-weight, 700); line-height: 1; letter-spacing: -0.045em; font-variant-numeric: tabular-nums;
  transition: opacity .4s;
}
.clock.paused { opacity: .5; }
.colon { margin: 0 .16em; transform: translateY(-.06em); transition: opacity .25s linear; }
.colon.dim { opacity: .3; }
.roll { display: inline-block; animation: roll .7s cubic-bezier(.2, .75, .1, 1); }
@keyframes roll { from { opacity: 0; transform: translateY(.35em); filter: blur(4px); } }
.glow {
  color: var(--_accent); pointer-events: none; opacity: 0;
  text-shadow: 0 0 6px var(--_glow), 0 0 18px var(--_glow);
  -webkit-mask-image: radial-gradient(circle closest-side, transparent 58%, #000 74%, transparent 90%), radial-gradient(circle closest-side, transparent 58%, #000 74%, transparent 90%);
          mask-image: radial-gradient(circle closest-side, transparent 58%, #000 74%, transparent 90%), radial-gradient(circle closest-side, transparent 58%, #000 74%, transparent 90%);
  -webkit-mask-position: center; mask-position: center;
  -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat;
  -webkit-mask-size: 0 0, 0 0; mask-size: 0 0, 0 0;
}
.bowl {
  position: absolute; z-index: 2; border: 0; padding: 0; border-radius: 50%;
  background: transparent; cursor: pointer; -webkit-tap-highlight-color: transparent;
}
.bowl:focus-visible { outline: 1.5px solid var(--_accent); outline-offset: 4px; }
:host([interactive="false"]) .bowl { display: none; }
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { transition-duration: .01ms !important; animation-duration: .01ms !important; }
}
`;

/** Parse "25:00", "1:30:00", "90" (seconds) or a number of milliseconds. */
function parseDuration(v) {
  if (typeof v === 'number') return Math.max(0, v);
  const s = String(v || '').trim();
  if (!s) return 0;
  if (/^\d+(\.\d+)?$/.test(s)) return parseFloat(s) * 1000;
  const parts = s.split(':').map(Number);
  if (parts.some((n) => Number.isNaN(n))) return 0;
  return parts.reduce((acc, n) => acc * 60 + n, 0) * 1000;
}

export class LotusClock extends HTMLElement {
  static get observedAttributes() {
    return ['time-zone', 'hour12', 'labels', 'finale', 'sound', 'countdown', 'autostart'];
  }

  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${STYLES}</style>
      <div class="stage" part="stage">
        <svg aria-hidden="true"></svg>
        <div class="clock" part="time" role="timer" aria-live="off"><span class="hh">--</span><span class="colon">:</span><span class="mm">--</span></div>
        <div class="clock glow" aria-hidden="true"></div>
        <button class="bowl" part="bowl" type="button" aria-label="Ring the singing bowl"></button>
      </div>`;
    this._el = {
      stage: root.querySelector('.stage'),
      svg: root.querySelector('svg'),
      clock: root.querySelector('.clock:not(.glow)'),
      glow: root.querySelector('.glow'),
      hh: root.querySelector('.hh'),
      mm: root.querySelector('.mm'),
      colon: root.querySelector('.clock:not(.glow) .colon'),
      bowl: root.querySelector('.bowl'),
    };

    // Countdown state.
    this._cd = { total: 0, remMs: 0, endAt: 0, running: false };
    this._mode = 'clock';
    this._buildSvg();
    this._relabel();

    // Animation state.
    this._lines = []; this._ripples = [];
    this._current = -1; this._minuteKey = null;
    this._geo = null; this._raf = 0; this._tickTimer = 0;
    this._rot = 0; this._placedRot = null; this._glowAt = -1;
    this._rotFrom = 0; this._rotTo = 0; this._rotAt = 0; this._rotStep = 0; this._steps = 0;
    this._rolledAt = -1e9; this._angVel = 0; this._lastRot = 0; this._lastFrame = 0;
    this._onScreen = true;

    this._frame = this._frame.bind(this);
    this._tick = this._tick.bind(this);
    this._remeasure = () => { this._measure(); this._kick(); };
    this._onVisibility = () => { this._tick(); this._kick(); };
    this._el.bowl.addEventListener('click', () => this.ring());
  }

  /* ----- public API ----------------------------------------------------- */

  /** 'clock' or 'countdown'. */
  get mode() { return this._mode; }
  /** Milliseconds left in countdown mode (0 in clock mode). */
  get remaining() { return this._mode === 'countdown' ? this._remaining() : 0; }
  /** Whether a countdown is running. */
  get running() { return this._mode === 'countdown' && this._cd.running; }

  /** Switch to countdown mode. `duration`: ms number, "25:00", "1:30:00" or seconds as a string. */
  countdown(duration, { autostart = true } = {}) {
    const ms = parseDuration(duration);
    this._cd = { total: ms, remMs: ms, endAt: 0, running: false };
    this._setMode('countdown');
    if (autostart) this.start();
    return this;
  }
  start() {
    const c = this._cd;
    if (this._mode !== 'countdown' || c.running || c.remMs <= 0) return this;
    c.running = true; c.endAt = Date.now() + c.remMs;
    this._emit('start');
    this._tick();
    return this;
  }
  pause() {
    const c = this._cd;
    if (this._mode !== 'countdown' || !c.running) return this;
    c.remMs = this._remaining(); c.running = false;
    this._emit('pause');
    this._tick();
    return this;
  }
  resume() { return this.start(); }
  toggle() { return this._cd.running ? this.pause() : this.start(); }
  /** Back to the full countdown duration, paused. */
  reset() {
    if (this._mode !== 'countdown') return this;
    this._cd.running = false; this._cd.remMs = this._cd.total;
    this._restart();
    return this;
  }
  /** Leave countdown mode and show the time of day again. */
  showClock() { this._setMode('clock'); return this; }

  /** Ring the bowl: ripples from the centre, a glow through the digits, and (with `sound`) a bowl strike. */
  ring() {
    if (this.hasAttribute('sound')) { bowl.wake(); bowl.strike(bowl.ROOT, 0.16, 8); }
    const g = this._geo;
    if (g) {
      const now = performance.now();
      for (let k = 0; k < 4; k++) this._addRipple(g.cx, g.cy, now + k * 260, 2200, 4, g.R + 40, true);
      this._highlight(this._el.hh.textContent, this._el.mm.textContent);
      this._lines.forEach((st) => {
        if (st.retractAt !== null) return;
        st.pluckAt = now + 120 + 600 * Math.random();
        st.pluckAmp = rand(5, 9);
      });
      this._kick();
    }
    this._emit('bowl');
  }

  /* ----- lifecycle ------------------------------------------------------ */

  connectedCallback() {
    this._makeFormatter();
    if (this.hasAttribute('sound')) bowl.arm();
    if (this.hasAttribute('countdown') && this._mode !== 'countdown') {
      this.countdown(this.getAttribute('countdown'), { autostart: this.hasAttribute('autostart') });
    }
    this._ro = new ResizeObserver(this._remeasure);
    this._ro.observe(this);
    if ('IntersectionObserver' in window) {
      this._io = new IntersectionObserver(([e]) => { this._onScreen = e.isIntersecting; if (this._onScreen) this._kick(); });
      this._io.observe(this);
    }
    document.addEventListener('visibilitychange', this._onVisibility);
    reduceMotion.addEventListener?.('change', this._remeasure);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => this.isConnected && this._remeasure());
    this._measure();
    this._tick();
  }

  disconnectedCallback() {
    clearTimeout(this._tickTimer);
    cancelAnimationFrame(this._raf); this._raf = 0;
    this._ro && this._ro.disconnect();
    this._io && this._io.disconnect();
    document.removeEventListener('visibilitychange', this._onVisibility);
  }

  attributeChangedCallback(name, oldV, newV) {
    if (oldV === newV || !this._el) return;
    if (name === 'time-zone' || name === 'hour12') { this._makeFormatter(); if (this._mode === 'clock' && this.isConnected) this._restart(); }
    else if (name === 'labels') this._paintLabels();
    else if (name === 'sound' && newV !== null) bowl.arm();
    else if (name === 'countdown' && this.isConnected) {
      if (newV === null) this.showClock();
      else this.countdown(newV, { autostart: this.hasAttribute('autostart') });
    }
  }

  /* ----- internals: time sources ---------------------------------------- */

  _makeFormatter() {
    const tz = this.getAttribute('time-zone') || undefined;
    const h12 = this.hasAttribute('hour12');
    try {
      this._fmt = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: h12 ? 'h12' : 'h23' });
    } catch (e) {
      console.warn(`<lotus-clock>: unknown time-zone "${tz}", using local time.`);
      this._fmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: h12 ? 'h12' : 'h23' });
    }
  }

  _remaining() { const c = this._cd; return c.running ? Math.max(0, c.endAt - Date.now()) : c.remMs; }

  // What to show: a = left digits, b = right digits, slot = 0–59 position, key changes each minute.
  _read() {
    if (this._mode === 'countdown') {
      const r = this._remaining();
      const tot = Math.ceil(r / 1000), m = Math.floor(tot / 60), s = tot % 60;
      return { a: pad(m), b: pad(s), slot: (60 - s) % 60, key: String(Math.ceil(r / 60000)), aria: `${m} minutes ${s} seconds left` };
    }
    const p = {};
    this._fmt.formatToParts(new Date()).forEach((x) => { p[x.type] = x.value; });
    return { a: p.hour, b: p.minute, slot: +p.second, key: p.hour + p.minute, aria: `${p.hour}:${p.minute}` };
  }

  // Milliseconds into the current minute (drives the finale).
  _msm() {
    if (this._mode === 'countdown') {
      const r = this._remaining(), k = Math.ceil(r / 60000);
      return 60000 - (r - (k - 1) * 60000);
    }
    return Date.now() % 60000;   // every zone today is a whole-minute offset from UTC
  }

  _label(k) { return this._mode === 'countdown' ? pad((60 - k) % 60) : pad(k); }

  _setMode(mode) {
    if (mode === this._mode && mode === 'clock') return;
    this._mode = mode;
    this._restart();
  }

  /* ----- internals: drawing -------------------------------------------- */

  _mk(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    parent.appendChild(e);
    return e;
  }

  _buildSvg() {
    const svg = this._el.svg;
    this._gLabels = this._mk('g', { class: 'labels' }, svg);
    this._gLotus = this._mk('g', { class: 'lotus' }, svg);
    this._lotusRings = [
      { n: 8, len: 0.98, w: 0.42, off: 0 },
      { n: 8, len: 0.74, w: 0.46, off: Math.PI / 8 },
      { n: 8, len: 0.5, w: 0.5, off: 0 },
    ].map((ring, i) => Object.assign(ring, { g: this._mk('g', { class: `r${i}` }, this._gLotus) }));
    this._gLines = this._mk('g', { class: 'lines' }, svg);
    this._gRipples = this._mk('g', { class: 'ripples' }, svg);
    this._converge = [0, 1, 2].map(() => this._mk('circle', { class: 'converge' }, this._gRipples));
    this._labels = Array.from({ length: 60 }, () => this._mk('text', {}, this._gLabels));
  }

  _relabel() { this._labels.forEach((t, k) => { t.textContent = this._label(k); }); }

  // The newest second lands just below the right-hand side; older ones travel counterclockwise.
  _angle(s) { return 0.14 + s * (Math.PI / 30); }

  _measure() {
    const host = this.getBoundingClientRect();
    if (!host.width || !host.height) return;
    const showLabels = this.getAttribute('labels') !== 'off';
    const size = Math.min(host.width, host.height);
    this._el.clock.style.fontSize = this._el.glow.style.fontSize = `${clamp(size * 0.105, 20, 120).toFixed(1)}px`;
    const k = this._el.clock.getBoundingClientRect();
    const cx = k.left - host.left + k.width / 2, cy = k.top - host.top + k.height / 2;
    const R = Math.max(50, size / 2 - (showLabels ? 26 : 8));
    const rIn = Math.min(R - 20, k.width / 2 + 16);
    this._geo = { cx, cy, R, rIn, sparse: (TAU * R) / 60 < 22 };
    this._el.svg.setAttribute('viewBox', `0 0 ${host.width} ${host.height}`);
    Object.assign(this._el.bowl.style, { left: `${cx - rIn}px`, top: `${cy - rIn}px`, width: `${rIn * 2}px`, height: `${rIn * 2}px` });
    // Lotus petals around (0, 0); turned and placed every frame.
    const b0 = R * 0.05;
    this._lotusRings.forEach((ring) => {
      while (ring.g.firstChild) ring.g.firstChild.remove();
      const L = R * ring.len, w = (L * ring.w) / 2;
      for (let i = 0; i < ring.n; i++) {
        const a = ring.off + (i * TAU) / ring.n, ca = Math.cos(a), sa = Math.sin(a);
        const P = (x, y) => `${(ca * (b0 + x) - sa * y).toFixed(1)},${(sa * (b0 + x) + ca * y).toFixed(1)}`;
        this._mk('path', {
          d: `M${P(0, -w * 0.12)}C${P(L * 0.3, -w * 1.3)} ${P(L * 0.84, -w * 0.85)} ${P(L, 0)}` +
             `C${P(L * 0.84, w * 0.85)} ${P(L * 0.3, w * 1.3)} ${P(0, w * 0.12)}Z`,
        }, ring.g);
      }
    });
    this._placedRot = null;
    this._placeLabels();
    this._paintLabels();
  }

  _placeLabels() {
    const g = this._geo;
    if (!g || this._placedRot === this._rot) return;
    this._placedRot = this._rot;
    this._labels.forEach((t, s) => {
      const th = this._angle(s) + this._rot;
      t.setAttribute('x', (g.cx + Math.cos(th) * (g.R + 13)).toFixed(1));
      t.setAttribute('y', (g.cy + Math.sin(th) * (g.R + 13)).toFixed(1));
    });
  }

  _live(s) { return this._lines.some((st) => st.s === s && st.retractAt === null); }

  _paintLabels() {
    const g = this._geo;
    if (!g) return;
    const show = this.getAttribute('labels') !== 'off';
    this._labels.forEach((t, s) => {
      const isNow = s === this._current;
      t.classList.toggle('on', show && (isNow || (this._live(s) && (!g.sparse || s % 5 === 0))));
      t.classList.toggle('now', show && isNow);
    });
  }

  _still() { return reduceMotion.matches; }

  // A line arrives straight; every step of the dial leaves a little twist, so older lines curve.
  _addLine(s, now, delay, age) {
    const drag = s % 2 ? rand(1.05, 1.5) : rand(0.5, 0.95);
    this._lines.push({
      s, th: this._angle(s), drag,
      twist: age * Math.abs(STEP) * TWIST_K * drag,
      f: rand(1, 2.4), w: rand(1.2, 2.8), phi: rand(0, TAU),
      born: now + delay, pluckAt: now + delay + GROW_MS * 0.75, pluckAmp: rand(5, 9),
      retractAt: null,
      path: this._mk('path', { class: 'line' }, this._gLines),
    });
  }

  _addRipple(x, y, t0, dur, r0, r1, big) {
    this._ripples.push({ x, y, t0, dur, r0, r1, c: this._mk('circle', { class: big ? 'ripple big' : 'ripple' }, this._gRipples) });
  }

  _pluck(s, now) {
    const g = this._geo, th = this._angle(s) + this._rot;
    const x = g.cx + Math.cos(th) * g.R, y = g.cy + Math.sin(th) * g.R;
    this._addRipple(x, y, now, 1100, 0, 30, false);
    this._addRipple(x, y, now + 160, 1100, 0, 18, false);
    this._lines.forEach((st) => {
      if (st.s === s || st.retractAt !== null) return;
      let d = Math.abs(st.s - s); d = Math.min(d, 60 - d);
      const strength = 8 * Math.exp(-d / 5);
      if (strength < 0.4) return;
      st.pluckAt = now + d * 45;
      st.pluckAmp = strength;
    });
  }

  _highlight(h, m) {
    this._el.glow.innerHTML = `<span>${h}</span><span class="colon">:</span><span>${m}</span>`;
    this._glowAt = performance.now();
  }

  _pullIn(now) {
    this._lines
      .filter((st) => st.retractAt === null)
      .sort((a, b) => a.s - b.s)
      .forEach((st, i) => { st.retractAt = now + i * 9; });
  }

  _startOver(now, key) {
    this._rolledAt = now;
    this._pullIn(now);
    const g = this._geo;
    const finale = this.getAttribute('finale') !== 'off';
    if (g && finale) for (let k = 0; k < 3; k++) this._addRipple(g.cx, g.cy, now + k * 200, 1500, g.rIn, g.R + 30, true);
    const sound = this.hasAttribute('sound');
    if (this._mode === 'countdown' && key === '0') {
      this._cd.running = false; this._cd.remMs = 0;
      if (sound) { bowl.strike(bowl.ROOT, 0.2, 9); bowl.strike(bowl.ROOT, 0.17, 9, 2.6); bowl.strike(bowl.ROOT / 2, 0.12, 10, 5.2); bowl.strike(bowl.ROOT, 0.15, 9, 5.2); }
      this._emit('complete');
    } else {
      if (sound && finale) { bowl.strike(bowl.ROOT, 0.2, 9); bowl.strike(bowl.ROOT / 2, 0.09, 10); }
      this._emit('minute', { value: this._read() });
    }
  }

  _stepTo(n, now, instant) {
    this._steps = n;
    this._rotFrom = instant ? n * STEP : this._rotStep;
    this._rotTo = n * STEP;
    this._rotAt = now;
  }

  _frame(now) {
    this._raf = 0;
    const g = this._geo;
    if (!g) return;
    const still = this._still();
    const finale = this.getAttribute('finale') !== 'off';
    const t = still ? 0 : now / 1000;
    const { cx, cy, R } = g;
    const msm = this._msm();

    // Step the dial; then one extra full turn at the end of the minute.
    const sp = still ? 1 : clamp((now - this._rotAt) / STEP_MS, 0, 1);
    this._rotStep = this._rotFrom + (this._rotTo - this._rotFrom) * inOut(sp);
    const turn = still || !finale ? 0 : clamp((msm - SPIN_FROM) / (60000 - SPIN_FROM), 0, 1);
    const spin = -TAU * inOut(turn);
    this._rot = this._rotStep + spin;

    // How fast the dial is turning; lines keep a twist from every bit of turning.
    let dr = 0;
    if (!still && this._lastFrame) {
      dr = this._rot - this._lastRot;
      dr -= TAU * Math.round(dr / TAU);
      const v = clamp(dr / Math.max(1, now - this._lastFrame), -0.008, 0.008);
      this._angVel += (v - this._angVel) * 0.3;
    } else this._angVel = 0;
    this._lastRot = this._rot; this._lastFrame = now;

    // Amethyst lotus: opens through the turn, fades as the minute changes.
    let lv = 0, ls = 1;
    if (!still && finale) {
      if (turn > 0) { lv = smoothstep(Math.min(1, turn * 1.5)); ls = 0.3 + 0.7 * ease(turn); }
      else if (now - this._rolledAt < 1300) { const f = (now - this._rolledAt) / 1300; lv = 1 - smoothstep(f); ls = 1 + 0.1 * ease(f); }
    }
    this._gLotus.style.opacity = lv.toFixed(3);
    if (lv > 0.001) {
      this._lotusRings.forEach((ring, i) => {
        const deg = ((this._rot + (spin * i) / 8) * 180) / Math.PI;   // multiples of 45°: no jump at :00
        ring.g.setAttribute('transform', `translate(${cx.toFixed(1)} ${cy.toFixed(1)}) rotate(${deg.toFixed(2)}) scale(${ls.toFixed(3)})`);
      });
    }
    this._placeLabels();

    // Lines.
    this._lines = this._lines.filter((st) => {
      let end = 1;
      if (st.retractAt !== null) {
        const r = still ? 1 : clamp((now - st.retractAt) / RETRACT_MS, 0, 1);
        if (r >= 1) { st.path.remove(); return false; }
        end = 1 - ease(r);
      }
      if (!still) end = Math.min(end, ease(clamp((now - st.born) / GROW_MS, 0, 1)));
      if (end < 0.005) { st.path.setAttribute('d', ''); return true; }

      const th = st.th + this._rot;
      const dx = Math.cos(th), dy = Math.sin(th), nx = -dy, ny = dx;
      st.twist -= dr * TWIST_K * st.drag;
      const trail = st.twist - this._angVel * LAG_K * st.drag;
      const A = !still && now >= st.pluckAt ? st.pluckAmp * Math.exp(-(now - st.pluckAt) / 480) : 0;

      let d = '';
      for (let i = 0; i <= SAMPLES; i++) {
        const u = end * (i / SAMPLES);
        const x = R * u;
        const y = A ? A * Math.sin(2 * Math.PI * st.f * u - st.w * t + st.phi) * Math.sin(Math.PI * u) : 0;
        let px = dx * x + nx * y, py = dy * x + ny * y;
        if (Math.abs(trail) > 0.0005) {
          const lag = trail * (1 - u) ** 1.3;
          const cl = Math.cos(lag), sl = Math.sin(lag);
          [px, py] = [px * cl - py * sl, px * sl + py * cl];
        }
        d += `${i ? 'L' : 'M'}${(cx + px).toFixed(1)},${(cy + py).toFixed(1)}`;
      }
      st.path.setAttribute('d', d);
      st.path.classList.toggle('now', st.s === this._current && st.retractAt === null);
      return true;
    });

    // Rings close in on the digits before :00.
    const cv = still || !finale ? 0 : clamp((msm - CONVERGE_FROM) / (60000 - CONVERGE_FROM), 0, 1);
    this._converge.forEach((el, i) => {
      const p = clamp(cv - i * 0.12, 0, 1);
      if (p <= 0) { el.style.opacity = '0'; return; }
      el.setAttribute('cx', cx.toFixed(1)); el.setAttribute('cy', cy.toFixed(1));
      el.setAttribute('r', (R + (g.rIn - R) * p * p * p).toFixed(1));
      el.style.opacity = (Math.min(1, p * 4) * (0.7 - i * 0.2)).toFixed(3);
    });

    // Ripple of light through the digits.
    const glow = this._el.glow;
    if (this._glowAt >= 0) {
      const gp = (now - this._glowAt) / GLOW_MS;
      if (gp >= 1 || still) { glow.style.opacity = '0'; this._glowAt = -1; }
      else {
        const span = Math.max(260, (this._el.clock.offsetWidth / 2) / 0.28);
        const a = smoothstep(gp) * span, b = smoothstep(clamp((gp - 0.18) / 0.82, 0, 1)) * span;
        const size = `${a.toFixed(0)}px ${a.toFixed(0)}px, ${b.toFixed(0)}px ${b.toFixed(0)}px`;
        glow.style.webkitMaskSize = size; glow.style.maskSize = size; glow.style.opacity = '1';
      }
    }

    this._ripples = this._ripples.filter((rp) => {
      const p = (now - rp.t0) / rp.dur;
      if (p >= 1 || still) { rp.c.remove(); return false; }
      if (p < 0) { rp.c.style.opacity = '0'; return true; }
      rp.c.setAttribute('cx', rp.x.toFixed(1)); rp.c.setAttribute('cy', rp.y.toFixed(1));
      rp.c.setAttribute('r', (rp.r0 + ease(p) * (rp.r1 - rp.r0)).toFixed(1));
      rp.c.style.opacity = ((1 - p) * (1 - p)).toFixed(3);
      return true;
    });

    if (!still && this._onScreen && !document.hidden && this.isConnected) this._raf = requestAnimationFrame(this._frame);
  }

  _kick() { if (!this._raf && this.isConnected) this._raf = requestAnimationFrame(this._frame); }

  _tick() {
    clearTimeout(this._tickTimer);
    if (!this.isConnected) return;
    const now = performance.now();
    const p = this._read();
    const sec = p.slot, key = p.key;
    const { hh, mm, colon, clock } = this._el;
    if (sec !== this._current || key !== this._minuteKey) {
      const first = this._current === -1;
      const rolled = !first && key !== this._minuteKey;
      if (rolled && this._geo) this._startOver(now, key);
      for (let s = 0; s <= sec; s++) {
        if (this._live(s)) continue;
        const delay = first ? s * 22 : rolled ? 380 + s * 12 : 0;
        this._addLine(s, now, this._still() ? 0 : delay, sec - s);
      }
      this._stepTo(first ? sec : this._steps + ((sec - this._current + 60) % 60), now, first);
      this._current = sec; this._minuteKey = key;
      const sound = this.hasAttribute('sound');
      if (!first && this._geo && !this._still()) this._pluck(sec, now + (rolled ? 380 : 0) + GROW_MS * 0.75);
      if (!first && !rolled && sound) bowl.drop((GROW_MS * 0.75) / 1000);
      if (!first && sec === 56 && sound && this.getAttribute('finale') !== 'off') bowl.sing(bowl.ROOT, 0.05, Math.max(0.5, (60000 - this._msm()) / 1000), 3.5);
      if (rolled && !this._still() && this.getAttribute('finale') !== 'off') {
        if (mm.textContent !== p.b) { mm.classList.remove('roll'); void mm.offsetWidth; mm.classList.add('roll'); }
        if (hh.textContent !== p.a) { hh.classList.remove('roll'); void hh.offsetWidth; hh.classList.add('roll'); }
        this._highlight(p.a, p.b);
      }
      hh.textContent = p.a;
      mm.textContent = p.b;
      clock.setAttribute('aria-label', p.aria);
      colon.classList.remove('dim');
      setTimeout(() => colon.classList.add('dim'), 500);
      this._paintLabels();
      if (!first) this._emit('second', { value: p });
      this._kick();
    }
    const counting = this._mode === 'countdown';
    clock.classList.toggle('paused', counting && !this._cd.running);
    const next = counting
      ? (this._cd.running ? (this._remaining() % 1000) + 5 : 250)
      : 1000 - (Date.now() % 1000) + 5;
    this._tickTimer = setTimeout(this._tick, next);
  }

  // Start the dial over (new mode, new time zone, reset).
  _restart() {
    this._pullIn(performance.now());
    this._current = -1; this._minuteKey = null;
    this._relabel();
    if (this.isConnected) { this._measure(); this._tick(); }
  }

  _emit(type, detail = {}) {
    this.dispatchEvent(new CustomEvent(type, { detail: { mode: this._mode, ...detail }, bubbles: true, composed: true }));
  }
}

if (typeof window !== 'undefined' && window.customElements && !customElements.get('lotus-clock')) {
  customElements.define('lotus-clock', LotusClock);
}

export default LotusClock;
