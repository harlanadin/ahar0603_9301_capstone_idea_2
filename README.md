# Misty Fog Glass

An interactive p5.js installation prototype that explores the tension between visibility and obscurity through a live camera feed rendered beneath layered, animated fog. The screen behaves like a misty pane of glass: the viewer's image is submerged in shifting white haze, and only a deliberate gesture — clicking and dragging, or swiping on touch — parts the fog to reveal the figure beneath.

The cleared area slowly closes back in. Each wipe is temporary. The mist reclaims the surface.

## How It Works

### Fog Rendering

The fog effect is built from several stacked layers composited together each frame:

1. **Blurred scene** — the live camera feed (or fallback gradient) is blurred heavily (`36px`), desaturated, and brightened to simulate the washed-out quality of a scene viewed through thick atmospheric mist.
2. **Atmosphere wash** — a procedurally generated base of large, soft ellipses (rendered with an `80px` blur) creates the volumetric mass of fog, with a brighter sky tone at the top and a cool blue-gray depth at the bottom.
3. **Animated fog textures** — two grayscale fog photographs (`fog 01.jpg`, `fog 02.jpg`) are drawn each frame using `SCREEN` blend mode, which makes dark pixels transparent and bright pixels opaque, so only the luminous mist structure shows. Each texture is scaled up slightly (1.18×) and slowly panned in opposite directions using `sin`/`cos` oscillation, creating a parallax drift that makes the fog feel alive without ever showing a hard edge.
4. **Mist particles** — a sparse layer of fine white specks and soft elongated ellipses adds the sense of suspended water droplets in the air.

### Interaction

Clicking, dragging, or touching the screen traces a **wipe trail** through the fog. The trail is rendered using a multi-pass soft brush (8 concentric layers of decreasing opacity and width) to produce a smooth, feathered reveal rather than a hard cut.

After **3 seconds** of stillness, each cleared mark begins to fade back over **9 seconds**, using an ease-in-out curve so the re-fogging feels gradual and natural. This cycle — reveal, linger, reclaim — is the core rhythm of the piece.

### Layer Composite

All fog layers are composited into a single `effectLayer`, then masked against the `maskLayer` (which tracks cleared areas) using `destination-in` blending. Only the masked region of the fog is drawn over the scene, so the rest of the canvas shows the full camera image unobscured — the fog exists only where the viewer has not yet wiped.

## Running Locally

Because the sketch uses `getUserMedia` for camera access, it must be served over HTTPS or from `localhost`. Open a local server (e.g. `npx serve .` or the VS Code Live Server extension) and allow camera permissions when prompted.

```
npx serve .
```

Then open `http://localhost:3000` (or whichever port is assigned).

## Installation Concept

The work is designed as a screen-based interactive installation. A webcam captures the viewer in real time while the display presents their image as if seen through a thick foggy window. The viewer interacts directly with the surface using a mouse, trackpad, or touch input to wipe parts of the mist away.

In a physical installation setting, the piece could be presented on a large monitor, projection surface, or touch screen. The camera is positioned near the display so the viewer encounters a distorted, atmospheric reflection of themselves. The act of wiping becomes a gesture of searching — momentarily grasping at visibility before the mist quietly returns and the surface forgets.
