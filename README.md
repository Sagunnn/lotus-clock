# lotus-clock

A kinetic clock as a drop-in web component. Each second a straight line grows from the time to its place on the dial; every step of the dial leaves a little twist behind, so the lines slowly curl and cross as the minute goes on. In the last seconds the dial makes a full turn and the lines gather into a lotus, filled with amethyst between them; a ripple of light runs through the digits as the minute changes and the lotus closes back into the centre.

No dependencies, no build step, one file. Works in plain HTML, React, Vue, Svelte or anything else that renders DOM.

**[Live demo →](https://sagunnn.github.io/lotus-clock/)**

<p align="center">
  <img src="docs/preview.png" width="32%" alt="Lines curling as the minute passes">
  <img src="docs/preview-spin.png" width="32%" alt="The lines gathered into an amethyst lotus during the final turn">
  <img src="docs/preview-dark.png" width="32%" alt="Dark theme">
</p>

## Features

- **Stepping dial.** The newest second always lands on the same spot; older seconds travel round.
- **Lines that take shape from motion.** Straight on arrival, curving as the dial turns, tangling in the final spin.
- **Minute finale.** One full turn while the lines gather into a 12-petal lotus (the colour fills the space between each petal's edge lines), converging rings, and a ripple of light through the digits.
- **Countdown mode.** Turn it into a focus timer with `countdown('25:00')`, with pause, resume and a `complete` event.
- **Singing bowl (optional).** Sound synthesised with the Web Audio API: a water-drop per second, a rim-rub swell into the minute, and a bowl strike you can ring by pressing the middle.
- **Any time zone.** Pass an IANA zone like `Asia/Kathmandu`.
- **Themeable.** Colours and fonts through CSS custom properties; follows `currentColor` by default.
- **Respectful.** Honours `prefers-reduced-motion`, pauses when off-screen or in a background tab, and never plays sound until a user interacts.

## Install

**From a CDN** (no install):

```html
<script type="module" src="https://cdn.jsdelivr.net/gh/Sagunnn/lotus-clock@1.0.1/lotus-clock.js"></script>
```

**With npm** (straight from GitHub):

```sh
npm install github:Sagunnn/lotus-clock
```

```js
import 'lotus-clock';                    // registers <lotus-clock>
// or: import { LotusClock } from 'lotus-clock';
```

**Or copy** [`lotus-clock.js`](lotus-clock.js) into your project and load it with `<script type="module">`.

## Quick start

```html
<script type="module" src="https://cdn.jsdelivr.net/gh/Sagunnn/lotus-clock@1.0.1/lotus-clock.js"></script>

<lotus-clock style="width: 480px"></lotus-clock>
```

The clock is square by default and fills the width you give it (minimum 200px). Set `width`, `height`, or both.

```html
<!-- Kathmandu time, 12-hour, with sound -->
<lotus-clock time-zone="Asia/Kathmandu" hour12 sound></lotus-clock>

<!-- A 25-minute focus timer that starts on load -->
<lotus-clock countdown="25:00" autostart sound></lotus-clock>
```

## Attributes

| Attribute | Default | Description |
| --- | --- | --- |
| `time-zone` | local time | Any IANA time zone, e.g. `Europe/London`, `Asia/Tokyo`. |
| `hour12` | off | Show a 12-hour clock. |
| `labels` | `on` | `off` hides the seconds numbers round the dial. |
| `finale` | `on` | `off` turns off the end-of-minute spin, lotus and glow. |
| `sound` | off | Enables the singing bowl. Audio starts after the first click or key press on the page (browser autoplay rules). |
| `interactive` | `true` | `false` hides the press-the-middle bowl button. |
| `countdown` | none | Start in countdown mode with this duration: `"25:00"`, `"1:30:00"` or seconds (`"90"`). |
| `autostart` | off | With `countdown`, start counting immediately. |

## JavaScript API

```js
const clock = document.querySelector('lotus-clock');

clock.countdown('25:00');                 // switch to countdown and start
clock.countdown(5 * 60_000, { autostart: false });   // ms also works
clock.pause();
clock.resume();                           // same as start()
clock.toggle();
clock.reset();                            // back to the full duration, paused
clock.showClock();                        // back to the time of day
clock.ring();                             // ring the bowl (sound only with the `sound` attribute)

clock.mode;        // 'clock' | 'countdown'
clock.running;     // true while a countdown runs
clock.remaining;   // ms left in the countdown
```

Every method except the getters returns the element, so calls can be chained.

## Events

All events bubble and cross shadow boundaries. `event.detail.mode` is always set.

| Event | When | `detail` |
| --- | --- | --- |
| `second` | Each new second (or countdown second) | `{ value: { a, b, slot, key } }` |
| `minute` | When the minute changes | `{ value }` |
| `complete` | A countdown reaches 00:00 | — |
| `start`, `pause` | Countdown started / paused | — |
| `bowl` | The bowl was rung | — |

`value.a` and `value.b` are the two numbers on screen (hours and minutes, or minutes and seconds in countdown mode).

## Styling

Theme it with CSS custom properties on the element (or any ancestor):

```css
lotus-clock {
  --lc-ink: #141413;           /* digits, labels (default: currentColor) */
  --lc-line: rgba(0,0,0,.2);   /* the lines (default: ink at 20%) */
  --lc-accent: #8a4fd6;        /* newest line, rings, lotus, glow (amethyst) */
  --lc-glow: rgba(138,79,214,.35);
  --lc-paper: transparent;     /* background */
  --lc-font-display: "Inter Tight", Helvetica, Arial, sans-serif;  /* digits */
  --lc-font-weight: 700;
  --lc-font-mono: "JetBrains Mono", ui-monospace, monospace;       /* labels */
}
```

For deeper changes, the shadow DOM exposes parts: `::part(stage)`, `::part(time)` and `::part(bowl)`.

**Dark mode** is a matter of changing `--lc-ink` (or `color`) and the accent:

```css
@media (prefers-color-scheme: dark) {
  lotus-clock { --lc-ink: #faf8f5; --lc-accent: #b98cff; }
}
```

## Recipes

### A Pomodoro timer

```html
<lotus-clock id="pomodoro" sound></lotus-clock>
<button id="go">Start focus</button>

<script type="module">
  import 'https://cdn.jsdelivr.net/gh/Sagunnn/lotus-clock@1.0.1/lotus-clock.js';

  const clock = document.getElementById('pomodoro');
  const plan = ['25:00', '5:00', '25:00', '5:00', '25:00', '5:00', '25:00', '15:00'];
  let step = 0;

  document.getElementById('go').onclick = () => clock.countdown(plan[step]);
  clock.addEventListener('complete', () => {
    step = (step + 1) % plan.length;
    setTimeout(() => clock.countdown(plan[step], { autostart: false }), 4000);
  });
</script>
```

### React

React 19 supports custom elements directly:

```jsx
import 'lotus-clock';

export function Clock() {
  return <lotus-clock time-zone="Asia/Kathmandu" sound style={{ width: 420 }} />;
}
```

To call methods (any React version), use a ref:

```jsx
import { useRef } from 'react';
import 'lotus-clock';

export function FocusTimer() {
  const ref = useRef(null);
  return (
    <>
      <lotus-clock ref={ref} style={{ width: 420 }} />
      <button onClick={() => ref.current.countdown('25:00')}>Focus</button>
    </>
  );
}
```

In TypeScript, declare the element once:

```ts
declare namespace JSX {
  interface IntrinsicElements {
    'lotus-clock': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & Record<string, unknown>;
  }
}
```

### Vue

Tell Vue that `lotus-clock` is a custom element:

```js
// vite.config.js
vue({ template: { compilerOptions: { isCustomElement: (tag) => tag === 'lotus-clock' } } })
```

```vue
<script setup>
import 'lotus-clock';
</script>

<template>
  <lotus-clock time-zone="Europe/London" style="width: 400px" />
</template>
```

### Svelte

```svelte
<script>
  import 'lotus-clock';
</script>

<lotus-clock time-zone="America/New_York" sound style="width: 400px"></lotus-clock>
```

### Server-side rendering

The file only touches the browser when it is imported, so import it on the client (for example inside `useEffect`, `onMount`, or a `"use client"` component).

## Accessibility

- The time is exposed with `role="timer"` and an `aria-label` that stays current (it isn't announced on every change); the lines, numbers and lotus are hidden from screen readers.
- The bowl is a real `<button>` (keyboard focusable, labelled "Ring the singing bowl"). Hide it with `interactive="false"`.
- With `prefers-reduced-motion: reduce`, the clock stops animating: lines appear in place and the finale is skipped.
- Sound is off unless you add the `sound` attribute, and even then waits for a user interaction.

## Browser support

Current Chrome, Edge, Safari and Firefox. It uses Custom Elements, Shadow DOM, `ResizeObserver`, CSS `color-mix()` and CSS masks.

## How it works

- 60 points sit on a circle. Each second, a line grows from the centre of the time to the newest point, and the whole dial eases one step (6°) counterclockwise so the newest point is always in the same place.
- Every frame, each line rotates its inner points by a lag that grows with how far the dial has turned since the line arrived, plus a little extra while the dial is moving. Neighbouring lines lag by different amounts, so their curves cross.
- From :56 the dial adds one full turn and every line eases toward a place in a lotus: each group of five lines becomes a petal (the middle line the midrib, the outer pair its edges), 12 petals alternating long and short. Each petal is filled with a path built from its two edge lines, so the colour is shaped by the lines. Rings close in on the digits, and at :00 a masked copy of the digits in the accent colour reveals a ripple of light while the lines draw back in.
- The bowl is four sine oscillators (a fundamental, a partner 1.8 Hz above for the slow beating, and partials at ×2.71 and ×4.83) through a low-pass filter, a generated reverb and a short echo.

## Development

No build step. Serve the folder and open the demo:

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

## License

[MIT](LICENSE) © Sagun Pradhan
