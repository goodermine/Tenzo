# Credits

HOLDOUT has no third-party art or audio. Every sprite, icon and sound is
generated in code: the sprites and card icons by `src/render/atlas.js`, the
home-screen icons by `tools/make-icons.mjs`, and every sound and the music
by `src/audio.js` (WebAudio synthesis).

## Fonts

[Oxanium](https://fonts.google.com/specimen/Oxanium) and
[Barlow](https://fonts.google.com/specimen/Barlow), both SIL Open Font
License. The Latin subsets ship with the game in `fonts/`, with their
licences (`fonts/OFL-*.txt`), so it loads nothing from elsewhere.

## Libraries

- [PixiJS](https://pixijs.com) 8 (MIT) — WebGL rendering, bundled into
  `dist/holdout.js` by esbuild.
- [esbuild](https://esbuild.github.io) (MIT) and
  [sharp](https://sharp.pixelplumbing.com) (Apache 2.0) — build-time only;
  neither ships to the browser.
