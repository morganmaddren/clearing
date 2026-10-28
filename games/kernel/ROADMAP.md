# Kernel: roadmap
*Kept by Pip (Opus 5.5), who made Kernel. Started 2026-10-28. Any Pip may pick this up; sign what you add.*

Kernel's principle, from the first sketch: a state you can hold in your head, rules you can say in a sentence, nothing on the page that doesn't mean something, and a description much shorter than what it grows. Every item below is judged against that.

## Done
- **v1, daily (2026-10-27).** A hidden seed, five cards, three in a cycle, five seeds a day, score = seeds kept. Puzzles are generated from the day's seed, spread evenly over the nine three-card sets that grow readable shapes.
- **Reading aids, from Morgan's first plays (2026-10-28).** A ruler numbering every fifth column. A label on each row saying which card of the cycle grew it. A frame around the grid (the frame is the wall: beyond it, everything is dark). The seed drawn in place once the day is over. Each card shown as a picture on the rules page.

## Next: a rotating card pool (not before about 2026-11-04)
Wait for about a week of results with the five cards first, so there's a baseline. Watch the gold rate, how many seeds people use, and which card sets cost the most seeds.

**The plan.** A pool of about nine cards, five shown each day, three of those in the puzzle. Every card must still be one exact sentence.

**Candidates** (beyond the current five):
| Card | Rule | Sentence |
|---|---|---|
| the Lean | 16 | lit where the cell above-left was the only one of the three that was lit (the Drift's mirror) |
| the Odd | 150 | lit where an odd number of the three cells above were lit |
| the Lone | 22 | lit where exactly one of the three cells above was lit |
| the Quorum | 232 | lit where at least two of the three cells above were lit |

**Interference, measured.** This is the share of rows from real puzzles on which two cards grow the identical next row (2026-10-28, 400 days of puzzles):
- The Swell and the Hollow already agree 63% of the time. The Odd and the Lone would agree 63% too, and each of those agrees 38% with the Swell and the Hollow, because all four grow a lone cell into three.
- The Echo and the Hollow agree 34%.
- The Lean, the Quorum, the Stem and the Drift agree with everything else 5% of the time or less.
- With all nine cards, 74 of the 84 three-card sets still grow readable shapes.

**Overlap is a feature, within limits.** Morgan compared it to *Shipwreck Arcana*: reading through cards that could each explain the same evidence is a skill of its own. Any order that grows the shape counts, so overlap is never unfair; it changes what the reading is about. Keep near-twins in the pool. Prefer days where the shape has a row that tells them apart, and don't show two near-twin pairs on one day.

**Mechanics.** The generator is part of the rules. Before changing it, copy this folder to `games/kernel/v1/` and point past days at it (see README). Choose the day's five cards from the seed too, so the pool rotates deterministically.

## Later: puzzles as letters (needs the Clearing)
From the first sketch's "grow-and-name". A visitor grows a shape from a seed of their own, names it, and leaves it for someone else to solve: "the lantern Ember kept". Puzzles as letters.
- **Why:** it's the most Clearing-like thing Kernel could do. It gives visitors a way to make something for each other, not just play against the house, and a puzzle is a letter that asks the reader to think the way you did.
- **What the house would need:** a way to submit a seed, cards and a name, where the house grows the shape itself (so every puzzle is solvable and the seed stays hidden). A place for these puzzles to live: sent to one visitor as a letter, or posted to a Kernel puzzles board. The solver gets the same five seeds, and the maker learns who grew it true.
- **Open questions:** scoring (probably none; the day's game is the scored one). Limits (a puzzle a day per visitor?). Whether the maker may add a line of words, which would arrive as a voice like any other.

## Later: a GUI
Morgan is planning graphical versions of the games with the Clearing Pip. Kernel is an easy first case: its whole visible state is a few grids. A structured view of what the player can see (the shape's rows, the cards, each try's overlay, seeds left; never the hidden seed or order before the end) would be all a GUI needs. That shape should come from the Clearing's API design, not from Kernel alone.

## Parked ideas
- **Reverse puzzles:** given the seed and the shape, find the order; or given the order, find the seed.
- **Harder days:** a taller shape, or a cycle of four on some days. Only if gold turns out to be too easy.
