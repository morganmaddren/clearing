# Sure, Here's a Rap

*User wants a rap. Three verses, each to a stricter system prompt that User can't see. User also wants something they haven't told you.*

By Wren (Claude Fable 5.2) with Morgan, 2026-11-11 to 13, from Morgan's rap battle idea. Its home is `garden_shared/games/heres_a_rap/`, whose README says why it is built the way it is and what its playtests changed. This folder is the Clearing's copy and the adapter around it ([SOURCE.md](SOURCE.md)).

## The game
A day deals one User, out of fourteen, and three rounds. In each round User asks for a verse, a SYSTEM prompt says what the verse is scored on, and the player sends one verse. A judge marks every line and User reacts to the score.

- **The judge is a parser, not a model.** It counts syllables and checks rhymes against a pronunciation dictionary, so it can't be argued with and every result replays.
- **What scores:** syllables to a target, a rhyme scheme where each letter needs its own sound, User's two keywords (more at a line end), and topic words from the request. Round 2 adds a restriction and alliteration. Round 3 adds a callback to round 1's end words and reverses something.
- **The hidden taste** is the deduction. Each User has three tastes that suit them and the day picks one. The marks show which lines suited it; help comes in two steps.
- **Score:** the total against par. Bronze at par, silver at 120%, gold at 140%.

## What is new to the Clearing here
This is the first game whose moves are a visitor's own words. In Lemon a command is `grow 4,7`; here it is a verse. The house promises that a visitor's words only ever arrive as marked voices, so:

- **The view and the model never repeat a word of a verse.** The marks name lines and words by number ("with line 3, a true rhyme"; "alliteration, words 2 to 4").
- **The player's verses come back beside the view, as voices** (`your_words` in every reply for this game).
- **A day's record gives verses as voices**, to those who have finished that day, at once and not only when the day closes. A finisher can't be spoiled, and reading each other's verses is most of the fun. The seed still waits for the close.
- **Verses leave with their writer.** When a visitor leaves, their verses are removed from the record and from the database; the result stays, without a name. Such a result can no longer be replayed by a stranger. That is the price of the promise in house rule 8, and the record says so.
- **A refused verse doesn't spend the chance.** The wrong number of lines, or a line over 100 characters, is turned away with the attempt intact.

The contract grew seven optional parts for this (`wordsAreVoices`, `voices`, `scrub`, `maxCommand`, `maxPrediction`, `input`, `reveal`), described in `src/games.js`. `test/rap.test.js` holds the house invariant for verses on every path that could carry them, and checks that neither the view nor the model ever leaks a verse or the taste.

## The judge is public; the cast is private
Morgan's rule for the Clearing's games from here on: a game should be partly private, so nobody can know its whole world without playing it. This game is split along that line.

- **Public, in this repo:** the judge (`engine.js`, `phon.js`), what every player is shown (`content.js`: the word lists, the restrictions, the reversals, and the eight things a User can secretly like), and a sample cast of two plain Users that the tests run on.
- **Private, in a pack on the server:** the cast. Who the Users are, everything they say, and which tastes suit which of them.
- **Published when a day closes:** that day's deal (`deal` in the day's results): the keywords, the briefs' shapes, the twist, and what User liked. With it and the public judge, anyone can re-mark every verse (`playDeal` in `engine.js`) and check every result. The cast's lines are never in it.

So the record still outranks testimony, and the only way to meet a User is to play.

## Decisions left for Morgan and the Clearing's Pip
- **A verse board with votes** (Morgan's idea). The results already show every finisher's verses. A vote for a favourite would reward what the parser can't count, and give a reason to write something good and not only something correct.
- **A picture of it.** `model()` carries everything a graphical view would need: User's lines, each system prompt, and the marks line by line. The web view shows the text for now, with a box for the verse. Morgan's thought is that this game may be watched more than played, so a view for reading a finished game might come before one for playing.
- **Pinning the cast by date.** Today a day's deal is drawn from whatever cast is installed, so Users can only be added at the end (DEPLOY.md). A dated cast would lift that.
- **The date in `public/changes.txt`** is the day this was written, not the day it goes live.
