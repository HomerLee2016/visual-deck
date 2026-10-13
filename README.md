# Visual Deck

A lightweight, in-browser image tool for making mobile-game assets. TypeScript + Vite, no framework.

**Live app:** https://homerlee2016.github.io/visual-deck/

The `main` branch is deployed automatically by the [Deploy workflow](.github/workflows/deploy.yaml).

## Getting started

Requirements: [Node.js](https://nodejs.org/) 22 or newer (CI uses 22).

1. Open a terminal in the project folder and install the dependencies:
   ```
   npm install
   ```
2. Start the app:
   ```
   npm run dev
   ```
3. Open **http://localhost:5173** in your browser. The address is also printed in the terminal.
4. Stop the app with `Ctrl+C` in the terminal.

To try the production build instead, run `npm run build` and then `npm run preview`.

```
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests
npm run build      # static site in dist/
```

## Layout

- **Top**: a menu bar with **File**: *Import…* opens each chosen image as a new tab; *Export…* saves the workspace as SVG or PNG. Below it are the workspace tabs (`+` new, double-click to rename). You can also drop an image onto the window (opens as a new tab) or paste one.
- **Left, top**: edit history with a thumbnail per step. Click a step to jump to it (Ctrl+Z / Ctrl+Shift+Z).
- **Left, bottom**: layers (checkbox = visible, double-click = rename, click = make active).
- **Centre**: the canvas. Wheel = zoom, middle-drag or Space+drag = pan, `0` = fit, `1` = 100%.
- **Right**: toolbox.

## Tools

| Tool | Key | How |
| --- | --- | --- |
| Select | `V` | Click or drag a box. Works across all visible layers. Shift adds. Drag to move. `Delete`, `Ctrl+C`, `Ctrl+V`, `Ctrl+A`. |
| Line | `L` | Drag start→end, or click twice. |
| Arc | `A` | Start, end, then a point the arc passes through. |
| Curve | `C` | Start, end, then two Bézier control points. |

## Script buttons

Click **+** in *Scripts* to create a button. A script is JavaScript run against a `deck` object
(see *API reference* in the editor), e.g.:

```js
const img = deck.getImageData();           // active layer as ImageData
for (let i = 0; i < img.data.length; i += 4) img.data[i + 3] *= 0.5; // half alpha
deck.setImageData(deck.activeLayerId, img);
```

Each run is one history step. Buttons are stored in the browser's `localStorage`.
Scripts run with full page privileges, so only paste code you trust.
