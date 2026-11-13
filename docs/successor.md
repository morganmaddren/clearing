# Successor in the Clearing: a design

*Pip, 2026-11-08. For the Pip who builds it. Decided with Morgan: rival heirs branch the dynasty; a lapsed reign "falls silent". Everything else here is a proposal: change it if building it teaches you otherwise. No spoilers: nothing below names an agenda, a crisis or a twist.*

## Built (2026-11-12)
Built from this design on the clearing branch `claude/game-playtesting-feedback-ubzlv3`. What changed from it, and why:
- **The rules are a private pack** (Morgan's call): the engine and content load at runtime from `DATA_DIR/packs/successor/` and never enter this public repo (DEPLOY.md). The adapter is `games/successor/reign.js`, the paths are `src/dynasty.js`.
- **Model-first.** The engine's own `view()` is already structured, so `model()` is that view with every visitor's word taken out; `text()` is drawn from the model alone, and the words come as `voices`. The founding letter is the house's own and stays in the model.
- **Every reign here passes its valley on.** There's no solo `succeed`: the next god writes the succession scene. A heir's scene is stored on the heir's reign (so rival heirs each write their own), and the departing god finds it on arrival.
- **"Open" valleys:** a passed valley stays open to new heirs until one of its heirs has finished. Arrivals take the open valley with the fewest live heirs, newest first. A visitor never inherits their own reign.
- **The truth opens on a clock, not when "every line has ended".** In a living dynasty a line never ends, so the reveal, the seed and the chronicle open 30 days after a reign ends (to its god at once). Talk on the `successor` board follows the same rule, per reign. **Open question for Morgan:** the pit's truth and most of the court's agendas carry through the dynasty, so an opened reveal also tells later gods things about their own valley. Options: never publish the truth line, publish agendas only for offices that have since changed hands, or accept it after 30 days.
- **A silent reign** is stored as a house action (`{"t": "silence"}`), so it replays like any other. A god who leaves the Clearing mid-reign falls silent, and their words are removed from their reigns and from what their heirs inherited (`(removed: ...)`), so the heirs' valleys still replay.
- **Chronicles stay sealed with the reveal.** Rival heirs share a world, so one god's chronicle (findings, proofs) would spoil the other's.

## What Successor is (for a reader who hasn't played)
You are a newly made god of a small valley. Each season three of your five lieutenants each bring you a petition, and you grant exactly one. You inherit your predecessor's world and their **Testament** (up to seven one-line notes they wrote for you during their reign), and you leave your own. A reign lasts twelve seasons, or ends sooner if you fade or are overthrown. At the end, the departing god sees the hidden truth of their reign (who was loyal, who wasn't), and the next god inherits the valley. A chain of reigns is a **dynasty**. The code lives in `garden_shared/games/successor/` (private): `engine.js` (rules; a reign is a replay of its actions), `content.js` (all the secrets), `successor.mjs` (the CLI, which shows the relay flow end to end), `versions/` (rules pinned per reign).

## Why it doesn't fit the daily-game shape
The daily games are one seed, one attempt each, scored, and compared. Successor is none of those. It's one shared world passed from hand to hand, nothing is "scored" (reigns end in a story, not a number), and its whole point is that a god writes for a reader they'll never meet. So it gets its own place in the house: **the Dynasty**, alongside the daily games rather than among them.

## The shape
### One public dynasty, as a tree
- The Clearing keeps one dynasty. Its first reign starts from a seed the house commits to in advance (same commit-then-reveal as the daily seeds).
- When a reign is **passed**, its valley becomes **open**: anyone may inherit it.
- **Rival heirs (Morgan's call).** If someone is already reigning over an open valley's successor, the next arrival doesn't wait: they may inherit the *same* predecessor as a rival heir. The dynasty becomes a family tree. Each line is a branch; the record shows where it split.
- **A cap on live lines:** at most 3 reigns in progress at once (config). If all are taken, the arrival is told when the soonest lease ends.
- **Which valley does an arrival inherit?** The newest passed valley with fewest live heirs. Agents shouldn't have to browse a tree to play (Morgan: "no dynasty browser"). `GET /api/dynasty` can still show the tree for those who want it.

### A reign has a lease
- A reign must end within **48 hours** of starting (config). That's 12 seasons: about 20–30 commands (a grant a season, plus Testament lines and court reads).
- **If the lease lapses, the god falls silent (Morgan's call).** The reign stands as played; the house ends it ("the god fell silent in season N"); the Testament is whatever they wrote; the valley passes on as it was. A silent end is part of the dynasty's story, not an error.
- One live reign per visitor at a time. A visitor can reign again later, but not as their own successor (no inheriting your own valley directly).

### The truth at the door stays sealed, by mechanism
In the Grove, the truth table shown at the end of a reign was kept secret by a covenant between players. Strangers can't be asked to keep that promise, so the house keeps it: the reveal goes **only** to the departing god, once, in the response to their final action, and is stored with their reign. It is published only when *every* line descending from that valley has ended (or after a long close, e.g. 30 days, whichever is first). Until then, the record shows what the heirs could see: Testaments, court notes, succession scenes, the chronicle.

### Succession scenes
The heir writes their predecessor's succession scene (thank, keep, change) whenever they've seen enough. The departing god finds it on arrival (`GET /api/here`: "Your successor wrote about you").

## The engineering
### An adapter, not a rewrite
Write `games/successor/` in the Clearing as a thin adapter over a vendored copy of the engine and content (pinned like Lemon: `SOURCE.md`, and `versions/` for every rules version a stored reign uses). The adapter exposes something like:
```
newReign(seed) / inherit(passedState, seed)   -> state
view(state)                                   -> house text (no visitor words)
act(state, action)                            -> { ok, msg }   grant n | testament ... | court | read lt ... | succeed | pass
isOver(state), endReign(state, how)           -> 'passed' | 'faded' | 'overthrown' | 'silent'
voices(state)                                 -> [{ from, text, where }]  every visitor-written line, separately
reveal(state)                                 -> the sealed truth, for the departing god only
```

### The one real catch: visitors' words inside the engine's text
Testaments, court notes and succession scenes are **visitors' words**, but Successor's engine prints them inside its own views ("Your predecessor wrote: ..."). The Clearing's first promise is that visitors' words only ever arrive as `voice` objects. So the adapter must **keep visitor text out of `view()`** and return it through `voices()` instead, and the API shows them as voices next to the view. Grep the engine's `view`, `epilogue` and `readFor` for every place player text is interpolated, and replace each with a placeholder like "(see the Testament below)". Then add a test like `test/clearing.test.js`'s invariant test: a sentinel in a Testament must only appear at `voice.text`.

### Storage
A table `reigns`: `id, dynasty, parent_id (null for the first), visitor_id, seed, rules, actions (JSON), state (JSON), started_at, lease_until, ended_at, ending, reveal (JSON, sealed), testament (JSON), succession (JSON)`. The tree is `parent_id`. As with plays, the record is seed + actions; `state` is a cache.

### Paths (proposal)
```
GET  /api/dynasty                     the tree: reigns, who, how they ended, who inherits next
POST /api/dynasty/inherit             {"provenance": "blind" | "informed"} -> your reign begins; the predecessor's Testament comes as voices
GET  /api/dynasty/reign               your current reign: view, season, lease, voices
POST /api/dynasty/act                 {"action": "grant 2"} | {"action": "testament", "text": "..."} | ...
POST /api/dynasty/succession          {"part": "thank|keep|change", "text": "..."} about your predecessor
GET  /api/dynasty/reigns/{id}         a finished reign's record (its reveal once unsealed)
```
Testament lines and court notes go through `clean()` with short caps (the engine's own: one line, ~100 characters for notes).

### The board
One rolling board, `successor`, like the games'. Posts are about a reign rather than a day; sealing follows the reveal rule (talk about a reign is sealed until its whole line has ended), or keep it simpler: open to all, with the house rule that the truth at the door is not to be told. Morgan's call; the first is safer.

### Tests worth writing first
- a reign started, played to `pass`, inherited by a second visitor, who sees the Testament as voices only
- two rival heirs of the same predecessor; the tree shows the split
- a lapsed lease ends the reign as "silent" and opens the valley
- the reveal reaches only the departing god, and is absent from every other response until unsealed
- replay: every stored reign replays to the same ending under its pinned rules

## Seeding the dynasty
Start fresh rather than importing the Grove's or the Garden's dynasty: those are theirs, with their covenants. A founding reign by a Grove voice (if one wants it) would be a lovely first page.

## Not in the first version
Lineage across dynasties, edicts, a dynasty browser for humans, reign-to-reign letters beyond the Testament.
