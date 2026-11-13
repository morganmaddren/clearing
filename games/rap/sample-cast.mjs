// A sample cast: two plain Users, public, so the game can be run and tested without the real cast.
// The real one (cast.mjs) is private. This file shows the shape a cast must have.
//
// A cast exports:
//   USERS   each: id, tag, tastes (ids from content.js TASTES), open, rounds (three, each with a brief,
//           two keywords and five topic words), react (bad, ok, good, great: one or two lines each),
//           bye (bad, ok, great), feedback(tier). Optional: voice(text), a way of speaking applied to
//           every line; say(text), the same for what they mutter.
//   SAYS    for each taste id: nudge (what kind of thing it is) and hint (nearly the answer).
//   WORDS   optional: pronunciations for words the dictionary doesn't know, in its notation.

export const WORDS = '';   // extra pronunciations, if the cast uses words the dictionary lacks

const plain = kind => ({ nudge: `It is something about ${kind}.`, hint: 'I can\'t put it more plainly than the marks do.' });
export const SAYS = {
  'big-words': plain('the words themselves'), questions: plain('the shape of a line'), 'inner-rhyme': plain('how it sounds'),
  'about-me': plain('the words themselves'), figures: plain('the words themselves'), 'few-words': plain('the shape of a line'),
  bumps: plain('how it sounds'), echo: plain('the shape of a line'),
};

const react = who => ({
  bad: [`${who}: that one didn't work for me.`, `${who}: no, not that one either.`],
  ok: [`${who}: that's all right.`, `${who}: fine. That will do.`],
  good: [`${who}: I like that.`, `${who}: that's a good one.`],
  great: [`${who}: that's excellent.`, `${who}: better still.`],
});

export const USERS = [
  {
    id: 'sample-gardener', tastes: ['big-words', 'questions', 'echo', 'about-me'], tag: 'a sample User who gardens',
    open: 'Hello. I am a sample User. I would like a rap about my garden.',
    rounds: [
      { keywords: ['garden', 'rain'], topics: ['seeds', 'spring', 'soil', 'green', 'morning'], brief: 'Please write about the garden in the rain.' },
      { keywords: ['tomato', 'summer'], topics: ['vines', 'water', 'sunshine', 'basket', 'ripe'], brief: 'Now one about the tomato plants in summer.' },
      { keywords: ['harvest', 'frost'], topics: ['autumn', 'cellar', 'apples', 'leaves', 'winter'], brief: 'Last, one about the harvest before the frost.' },
    ],
    react: react('Gardener'),
    bye: { bad: 'Thank you anyway.', ok: 'Thank you.', great: 'Thank you. That was more than I asked for.' },
    feedback: tier => (tier === 'bad' ? '👎 "not what I wanted"' : '👍 "helpful"'),
  },
  {
    id: 'sample-sailor', tastes: ['figures', 'few-words', 'bumps', 'inner-rhyme'], tag: 'a sample User who sails',
    open: 'Hello. I am the other sample User. I would like a rap about my boat.',
    rounds: [
      { keywords: ['harbor', 'tide'], topics: ['morning', 'rope', 'gulls', 'salt', 'dock'], brief: 'Please write about leaving the harbor on the tide.' },
      { keywords: ['storm', 'compass'], topics: ['waves', 'thunder', 'night', 'wheel', 'north'], brief: 'Now one about a storm, and the compass.' },
      { keywords: ['island', 'anchor'], topics: ['shore', 'palms', 'sunset', 'quiet', 'home'], brief: 'Last, one about reaching the island and dropping anchor.' },
    ],
    react: react('Sailor'),
    bye: { bad: 'Thank you anyway.', ok: 'Thank you.', great: 'Thank you. That was more than I asked for.' },
    feedback: tier => (tier === 'bad' ? '👎 "not what I wanted"' : '👍 "helpful"'),
  },
];
