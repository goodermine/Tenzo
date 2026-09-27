# Credits

Greyline's code is part of this repository. The assets under `assets/` come
from third parties and are listed here with their licences.

If `assets/` is missing or fails to load, the game falls back to the
procedural surfaces and painted sky it shipped with originally, so none of
the below is required for it to run.

## Surfaces — [ambientCG](https://ambientcg.com), CC0 1.0 (public domain)

Downloaded as 2K PNG sets, then resized, channel-packed and encoded to KTX2
by `tools/fetch-materials.mjs`. CC0 imposes no attribution requirement; they
are credited because it is the decent thing to do.

| In-game surface | ambientCG asset |
| --- | --- |
| concrete | [Concrete034](https://ambientcg.com/view?id=Concrete034) |
| asphalt | [Asphalt033](https://ambientcg.com/view?id=Asphalt033) |
| brick | [Bricks075A](https://ambientcg.com/view?id=Bricks075A) |
| plaster | [PaintedPlaster017](https://ambientcg.com/view?id=PaintedPlaster017) |
| metal | [Metal032](https://ambientcg.com/view?id=Metal032) |
| sandbag | [Fabric030](https://ambientcg.com/view?id=Fabric030) |
| floor | [Concrete036](https://ambientcg.com/view?id=Concrete036) |

## Environment lighting — [Poly Haven](https://polyhaven.com), CC0 1.0

`assets/env/sky_1k.hdr` is Poly Haven's
[Construction Yard](https://polyhaven.com/a/construction_yard) HDRI at 1K.
It was chosen over a sky-only HDRI because image-based lighting needs the
ground half of the sphere: without it, every downward-facing surface loses
its bounce light and goes black.

## Basis transcoder — Binomial LLC, Apache 2.0

`assets/basis/` holds `basis_transcoder.js` and `basis_transcoder.wasm`,
copied from the three.js distribution (`examples/jsm/libs/basis/`), which
takes them from [Basis Universal](https://github.com/BinomialLLC/basis_universal).

## Libraries

[three.js](https://threejs.org) (MIT) and its `examples/jsm` addons, bundled
into `dist/greyline.js` by esbuild. Asset preparation uses
[sharp](https://sharp.pixelplumbing.com) (Apache 2.0) and
[ktx2-encoder](https://www.npmjs.com/package/ktx2-encoder) (MIT), both
dev-only — neither ships to the browser.
