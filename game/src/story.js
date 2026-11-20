// Coral Bay Syndicate - story.js
// The story beats of the six-job chain, written as short subtitled
// cutscenes: a speaker name and one line at a time over the game.
// playCutscene freezes play, walks the lines (click or timer), then
// hands control back through its callback.

'use strict';

var SCENES = {
  celia: [
    ['Celia', 'You must be Rico. Marco said you drive like the tide owes you money.'],
    ['Rico', 'Marco talks too much. You have work, or just compliments?'],
    ['Celia', 'Both. My ledger is sitting by the dock crates, west side of this pier.'],
    ['Celia', 'Pick it up and take it to Marco at the Syndicate Garage. Do it clean.'],
    ['Rico', 'Clean is my middle name.'],
    ['Celia', 'Then Coral Bay is going to love you. Move.'],
  ],
  marco: [
    ['Marco', 'The ledger, intact. Celia was right about you.'],
    ['Rico', 'She pays better than she trusts. What is next?'],
    ['Marco', 'A package run. Warehouse on the west side, marked on your GPS.'],
    ['Marco', 'No sirens, no scratches. The Bay rewards discretion.'],
  ],
  warehouse: [
    ['Foreman', 'You are late by my watch, early by the tide. Leave it there.'],
    ['Rico', 'Pleasure doing business. Tell Marco the route was clean.'],
    ['Foreman', 'He already knows. Man has ears in every marina bar.'],
  ],
  docks: [
    ['Celia', 'The dock crew loaded something heavy and asked no questions.'],
    ['Rico', 'My favorite kind of cargo. Where does it sleep tonight?'],
    ['Celia', 'The garage. And Rico - the police have been restless. Drive like a tourist.'],
  ],
  hotwheels: [
    ['Vera', 'A collector parks his prize coupe by the east lookout every night.'],
    ['Rico', 'And you want it decorating our chop shop instead.'],
    ['Vera', 'I want it gone before sunrise. He will notice. They always notice.'],
    ['Rico', 'Then I will be quick, and the Bay will be quiet.'],
  ],
  ambush: [
    ['Marco', 'A rival crew moves product through the north road tonight.'],
    ['Rico', 'You want their car stopped. Permanently.'],
    ['Marco', 'I want it burning, and you gone before the smoke clears.'],
    ['Rico', 'Consider it a bonfire on the bay.'],
  ],
  bigscore: [
    ['Celia', 'Last job, Rico. The Coral Bank keeps its vault light on Fridays.'],
    ['Rico', 'You are asking me to rob the bank on the corner.'],
    ['Celia', 'I am asking you to own this city. Grab the money, then run for my pier.'],
    ['Celia', 'Lose the heat on the way if you can. If you cannot - run anyway.'],
  ],
  finale: [
    ['Celia', 'Six jobs. No names in any report. The Bay talks, Rico.'],
    ['Marco', 'Every crew from the marina to the north road asked who you are.'],
    ['Vera', 'I told them the truth. Coral Bay has a new kingpin.'],
    ['Rico', 'Then let us get to work. The city is ours now.'],
  ],
};

function playCutscene(id, onDone) {
  var lines = SCENES[id];
  if (!lines) { if (onDone) onDone(); return; }
  G.cut = { lines: lines, i: 0, t: 3.6, onDone: onDone || null };
}
function tickCutscene(dt) {
  if (!G.cut) return;
  G.cut.t -= dt;
  if (G.cut.t <= 0) advanceCutscene();
}
function advanceCutscene() {
  if (!G.cut) return;
  G.cut.i++; G.cut.t = 3.6;
  if (G.cut.i >= G.cut.lines.length) {
    var cb = G.cut.onDone; G.cut = null;
    if (cb) cb();
  }
}
function cutsceneActive() { return !!G.cut; }
