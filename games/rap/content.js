// The parts of the game every player is shown: the word lists, the restrictions, the reversals, and the
// list of things a User can secretly like. These are the judge's, and the judge is public.
//
// Who the Users are, what they say, and which tastes suit which of them are NOT here. They are the cast,
// and the cast is private (cast.mjs): you meet a User by playing.

// ---------- word lists (shown to the player by `lists`) ----------

export const LISTS = {
  colour: ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'brown', 'black', 'white', 'grey', 'gray', 'gold', 'silver', 'violet', 'indigo', 'crimson', 'scarlet', 'teal', 'tan', 'beige', 'maroon', 'navy', 'amber', 'turquoise', 'magenta', 'cyan', 'lime', 'olive', 'ivory', 'lavender', 'bronze', 'copper', 'rose', 'ruby', 'emerald', 'jade', 'azure'],
  animal: ['cat', 'dog', 'bird', 'fish', 'horse', 'cow', 'pig', 'sheep', 'goat', 'duck', 'goose', 'hen', 'rooster', 'chicken', 'mouse', 'rat', 'rabbit', 'hare', 'fox', 'wolf', 'bear', 'deer', 'moose', 'lion', 'tiger', 'leopard', 'monkey', 'ape', 'gorilla', 'elephant', 'giraffe', 'zebra', 'hippo', 'rhino', 'camel', 'llama', 'snake', 'lizard', 'frog', 'toad', 'turtle', 'whale', 'dolphin', 'shark', 'seal', 'otter', 'beaver', 'squirrel', 'bat', 'owl', 'eagle', 'hawk', 'crow', 'raven', 'wren', 'swan', 'pigeon', 'parrot', 'penguin', 'bee', 'ant', 'spider', 'moth', 'butterfly', 'worm', 'snail', 'crab', 'lobster', 'octopus', 'squid', 'badger', 'hedgehog', 'mole', 'donkey', 'mule', 'ox', 'bull', 'lamb', 'kitten', 'puppy'],
  number: ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety', 'hundred', 'thousand', 'million', 'billion', 'trillion', 'dozen'],
};

// ---------- round 2: the restriction (2 points for every line that keeps it) ----------

export const RESTRICTIONS = [
  { id: 'colour', label: 'A colour in every line', rule: 'Each line that names a colour scores 2. (`lists` shows which words count.)', list: 'colour' },
  { id: 'animal', label: 'An animal in every line', rule: 'Each line that names an animal scores 2. (`lists` shows which words count.)', list: 'animal' },
  { id: 'number', label: 'A number in every line', rule: 'Each line with a number, written as a word, scores 2. (`lists` shows which words count.)', list: 'number' },
  { id: 'no-e', label: 'No letter E', rule: 'Each line with no letter E anywhere in it scores 2.', letter: 'e' },
  { id: 'no-a', label: 'No letter A', rule: 'Each line with no letter A anywhere in it scores 2.', letter: 'a' },
  { id: 'no-t', label: 'No letter T', rule: 'Each line with no letter T anywhere in it scores 2.', letter: 't' },
  { id: 'acrostic-user', label: 'An acrostic: USER', rule: 'The four lines should start with U, S, E and R, in that order. Each line that does scores 2.', acrostic: 'user' },
  { id: 'acrostic-bars', label: 'An acrostic: BARS', rule: 'The four lines should start with B, A, R and S, in that order. Each line that does scores 2.', acrostic: 'bars' },
  { id: 'mono', label: 'Short words only', rule: 'Each line made entirely of one-syllable words scores 2.', mono: true },
];

// ---------- round 3: the reversal ----------

export const REVERSALS = [
  { id: 'used-up', label: 'Your words are used up', rule: 'Every word of four letters or more that you used in rounds 1 or 2 costs 1 each time it appears. (This round\'s keywords are exempt.)' },
  { id: 'tongue-tied', label: 'Alliteration now costs', rule: 'User has changed their mind. Every alliteration link costs 1.' },
];

// ---------- the hidden taste (points for every line that has it) ----------
// What a User can like. The checks are in engine.js. `reveal` is the plain statement shown at the end.
// What a User mutters about their taste, and which tastes suit which User, belong to the cast.

export const TASTES = [
  { id: 'big-words', reveal: 'a word of three syllables or more' },
  { id: 'questions', reveal: 'a line that ends with a question mark' },
  { id: 'inner-rhyme', reveal: 'a word inside the line that truly rhymes with the line\'s last word' },
  { id: 'about-me', reveal: 'the word "you" or "your"' },
  { id: 'figures', reveal: 'a number, written as a word' },
  { id: 'few-words', reveal: 'a line of five words or fewer' },
  { id: 'bumps', reveal: 'an alliteration link somewhere in the line' },
  { id: 'echo', reveal: 'a line whose last word is also its first word' },
];
