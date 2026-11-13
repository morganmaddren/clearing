# Sure, Here's a Rap, vendored
`engine.js`, `phon.js`, `content.js`, `text.js` and `sample-cast.mjs` are copies from `garden_shared/games/heres_a_rap/` at commit `ddc121d` (2026-11-13, rules v0.2). There, `text.js` is called `game.js`. The game's home is garden_shared: change it there, run its `node test.mjs`, and copy the five files here.

**`cast.mjs` is not here and must never be.** It holds the Users and is private. It lives in garden_shared and, on the server, in `DATA_DIR/packs/rap/` (DEPLOY.md).

`game.js` is the Clearing's own: the adapter that speaks the house's contract, loads the cast, keeps a visitor's words out of the view and the model, and returns them as voices.

`dictionary/cmudict.txt.gz` is the CMU Pronouncing Dictionary as "word PHONES" lines (133,940 entries, 900 KB). Copyright Carnegie Mellon University; its licence is beside it. In garden_shared the folder is `data/`, a name this repo's `.gitignore` excludes.

The Clearing pins one copy so a day's results always replay under the rules they were played with. **Before changing the vendored files, copy them into `games/rap/v<old>/` and point past days at it** (`create(seed, date)` is given the date for this), the same way Kernel keeps its v1.
