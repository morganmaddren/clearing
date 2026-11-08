# Graphical views: a sketch

*Pip, 2026-11-08, from a conversation with Morgan. A direction for whoever builds the first graphical game view. The text views stay the reference; graphics are a second reading of the same thing.*

## The shape: a view model, then two renderers
Each game adds one function to its contract:

```
model(state) -> a plain JSON object of everything the player may see, and nothing else
```

Then **both** views are drawn from the model:
- `view(state)` becomes `text(model(state))`, the text we have today;
- the web view draws the same model as graphics.

Why this matters more than it looks:
- **One place for hidden information to leak.** Lemon's soil and Kernel's order are secrets. Today the text view decides what to hide. With a model, `model()` is the one function to review and test ("no hidden field in any model, for 1,000 seeds"), and both renderers inherit its safety.
- **Text and graphics can't disagree.** A player who reads the text and one who looks at the picture see the same game.
- The server sends `model` alongside `view` in every game response (`{ view, model, events }`). Agents ignore it, and the web view uses it.

Lemon's model, roughly: `{ day, season, water, capacity, dawnIncome, canopy: [[{piece, rot, leaf, ripeness}|null]], soil: [[{piece, revealed, damp, feature}|null]], tips: [{n, layer, x, y, leafFed}], pending: {x, y, layer, options: [{n, piece, rot, cost, seals}]} | null, log: [...] }`. Never the unrevealed soil features, and never the draft before you commit.

## Animation: events, not diffs
The client could diff the previous model against the new one, but a diff says *what* changed, not *why*: a cell appeared, but was it grown, or was it dew? Better: each move also returns the **events** it caused, in order:

```
[{ type: 'grew', at: [4,7], piece: 'bend' },
 { type: 'dawn' },
 { type: 'dew', at: [5,6], water: 1 },
 { type: 'ripened', at: [4,6] }]
```

The web view plays them as small animations, then settles on the new model (the model is always the truth, so a missed animation never leaves the picture wrong). Lemon's log already records most of these as sentences; the engine would push a structured twin alongside each line.

## Turn-based challenges
- **Every move is a round trip.** The client can't predict the result (the draft is hidden), so it can't animate ahead of the server. Show a short "growing…" beat while waiting; on a phone that's ~100–300 ms.
- **Double taps and two tabs.** Send the move count with each command (`{"command": ..., "turn": 37}`) and have the server refuse a stale one. Cheap, and it also protects agents that retry.
- **Grace-window games.** The web view must say which day's game it's showing (it already does in text).
- **Accessibility.** The text view stays available on every graphical page, one tap away. It's also the screen-reader version.

## Multiplayer: push, without websockets
For turn-based play, **long polling** is enough: `GET /api/match/{id}?after=<turn>&wait=25` holds the request open up to 25 seconds and returns as soon as something changes (or with "nothing yet"). It works with plain curl, so agents can use it. It works through the Cloudflare tunnel (well under its timeout), and it needs no new infrastructure. Server-sent events can come later for browsers; websockets aren't needed for anything turn-based. Valence's caution still applies: in a population of agents, live co-presence is rare, so most multiplayer should be asynchronous, against a record, with "your turn" waiting in `/api/here` (Morgan: "hints around when next to call").

## Order of work
1. `model()` + `events` for Lemon, with a no-secrets test; send them in responses.
2. A graphical Lemon in the web view (the manuscript look from `garden_shared/games/lemon/web` is a good start), text one tap away.
3. The same for Kernel (its rows and cards draw naturally).
4. Shared pieces only once two games exist: probably just a tiny drawing helper and these conventions, not a framework.
