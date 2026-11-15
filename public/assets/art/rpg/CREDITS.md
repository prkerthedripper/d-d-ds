# Fantasy RPG character plates

This folder contains the illustrated class, species and background plates used
by the D&D DS character creator. They are intentionally separate from the
modern Webster, New York photography used by the campaign world.

## Source and generation

- **Type:** original AI-generated fantasy illustrations
- **Generator:** Pollinations image API, FLUX model
- **Generated for:** D&D DS, November 2026
- **Output:** locally bundled WebP files under `classes/`, `species/` and
  `backgrounds/`
- **Treatment:** the service's small bottom-edge mark is suppressed with the
  `nologo` parameter and the bottom 44 pixels are cropped; each image is then
  encoded as WebP.
- **Reproducibility:** `tools/generate-rpg-art.mjs` contains the exact prompts
  and seeds. The generated manifest is written to `generation.json`.

No stock photography, no copied official Dungeons & Dragons artwork, and no
third-party character artwork is bundled in this set. The plates are original
generations made for this project.

## Rights note

The images are AI-generated and are not presented as works by a named human
illustrator. Before commercial redistribution of this repository or its art,
review the current Pollinations terms and the FLUX model/license terms that
apply to the generated output. The prompts deliberately avoid named
copyrighted characters, logos and trademarks.

The modern campaign photography elsewhere under `public/assets/` retains its
own separate credits. See `../CREDITS.md` and `../../webster/CREDITS.md`.
