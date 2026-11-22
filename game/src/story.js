// story.js — the words of Coral Bay Syndicate: its people, its six-job story
// chain (paying exactly $6,150 end to end), and the dialogue each job opens
// with. missions.js runs the mechanics; every line of text lives here.

'use strict';

const HERO = 'Jules Cordero';
const FIXER = 'Vera Lark';       // the syndicate's fixer, based at the marina
const DOCKHAND = 'Tomas Rey';    // harbormaster, owes Vera more than money

const STORY = [
  {
    title: 'First Errand',
    giver: FIXER, pay: 600,
    brief: 'Take the sealed crate from the marina to Tomas at the dock office.',
    intro: [
      [FIXER, 'Jules. You came. Good — the bay eats the unemployed.'],
      [FIXER, 'Simple work: a sealed crate, Tomas Rey at the dock office, no questions and no detours.'],
      [HERO, 'And if the crate ticks?'],
      [FIXER, 'Then drive faster, love.'],
    ],
    steps: ['Pick up the crate at the marina', 'Deliver it to Tomas at the dock office'],
    done: 'Clean work. The bay notices clean work.',
  },
  {
    title: 'Dockside Run',
    giver: FIXER, pay: 850,
    brief: 'Collect three packages the tide brought in, then bring them to Vera.',
    intro: [
      [FIXER, 'Three packages washed up along the shore road. Every gull and copper is circling.'],
      [FIXER, 'Fetch all three and bring them home. Take the SMG from the crate — insurance.'],
      [HERO, 'You spoil me, Vera.'],
    ],
    steps: ['Collect the packages (1 of 3)', 'Collect the packages (2 of 3)', 'Collect the packages (3 of 3)', 'Bring the packages back to Vera'],
    done: 'All three, and still breathing. You are wasted on errands.',
  },
  {
    title: 'Glass Eels',
    giver: FIXER, pay: 1000,
    brief: 'A Glass Eels courier is running the coast road. Stop his car — hard.',
    intro: [
      [FIXER, 'The Glass Eels moved product through OUR marina last night.'],
      [FIXER, 'Their courier is on the coast road now. Run him down and put his car out of the game.'],
      [HERO, 'Diplomatic as ever.'],
      [FIXER, 'Bumpers are diplomacy, Jules.'],
    ],
    steps: ['Run down the Glass Eels courier', 'Return to Vera at the marina'],
    done: 'The Eels will think twice about our water. Take this — you earned it.',
  },
  {
    title: 'The Night Ledger',
    giver: DOCKHAND, pay: 1100,
    brief: 'Steal the marked coupe downtown and deliver it to the Chop Shop garage.',
    intro: [
      [DOCKHAND, 'Vera says you can be trusted with a name. The name is owed money.'],
      [DOCKHAND, 'His coupe sits downtown, all shine and no payments. Take it to the Chop Shop.'],
      [HERO, 'And if he reports it stolen?'],
      [DOCKHAND, 'He will. That is why they pay you, friend.'],
    ],
    steps: ['Steal the marked coupe downtown', 'Deliver the coupe to the Chop Shop'],
    done: 'The ledger balances itself. Vera left a rifle in the back for you.',
  },
  {
    title: 'Harbour Heat',
    giver: FIXER, pay: 1200,
    brief: 'Pick up the harbour package, reach the hideout, then lose the police.',
    intro: [
      [FIXER, 'Tonight the package is hot and so are you — the bay police have your face on a wall.'],
      [FIXER, 'Lift it from the pier, get to the hideout on the north-east corner, and shake the heat.'],
      [HERO, 'You ask so little.'],
      [FIXER, 'I ask everything. That is why it pays.'],
    ],
    steps: ['Lift the package from the pier', 'Reach the hideout', 'Lose the police'],
    done: 'Gone like a rumour. The syndicate remembers this night.',
  },
  {
    title: 'Syndicate Crown',
    giver: FIXER, pay: 1400,
    brief: 'Drive Vera to Lookout Point at the west end of the coast road. Expect company.',
    intro: [
      [FIXER, 'Last job, Jules. Tonight I meet the buyers at Lookout Point, and I ride with you.'],
      [FIXER, 'Every badge in Coral Bay will try to stop this car. Do not let them.'],
      [HERO, 'And after tonight?'],
      [FIXER, 'After tonight, the bay works for us.'],
    ],
    steps: ['Pick up Vera at the marina', 'Drive Vera to Lookout Point', 'Hold the point until the deal closes'],
    done: 'It is done. Coral Bay Syndicate — and you are its crown.',
  },
];

const SIDE_TEXT = {
  courier: { title: 'Courier Run', brief: 'Rush the parcel across town before the clock eats the fee.' },
  chop: { title: 'Chop Shop', brief: 'Bring any car to the Chop Shop garage. Clean cars pay better.' },
};

const RANKS = [
  { at: 0, name: 'Rookie' }, { at: 700, name: 'Runner' }, { at: 1800, name: 'Wheelman' },
  { at: 3200, name: 'Fixer' }, { at: 5000, name: 'Kingpin' }, { at: 6150, name: 'Syndicate Crown' },
];
function rankFor(earned) {
  let r = RANKS[0], next = null;
  for (let i = 0; i < RANKS.length; i++) {
    if (earned >= RANKS[i].at) { r = RANKS[i]; next = RANKS[i + 1] || null; }
  }
  return { name: r.name, next, frac: next ? (earned - r.at) / (next.at - r.at) : 1 };
}
