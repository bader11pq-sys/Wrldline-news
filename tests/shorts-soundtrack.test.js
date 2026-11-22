const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { create, tracks } = require("../shorts-soundtrack");

const flush = () => new Promise(setImmediate);

class AudioStub extends EventTarget {
  paused = true;
  ended = false;
  error = null;
  currentTime = 0;
  history = [];
  failures = {};
  set src(value) {
    this.history.push(value);
    this.ended = false;
    this.currentTime = 0;
    this.error = null;
  }
  get src() { return this.history.at(-1); }
  play() {
    if (this.failures[this.src]) return Promise.reject({ name: this.failures[this.src] });
    this.paused = false;
    return Promise.resolve();
  }
  pause() { this.paused = true; }
  end() {
    this.paused = this.ended = true;
    this.dispatchEvent(new Event("ended"));
  }
  fail() {
    this.error = { code: 4 };
    this.dispatchEvent(new Event("error"));
  }
}

function setup() {
  const audio = new AudioStub(), states = [];
  const controller = create({ audio, onState: (state) => states.push(state) });
  return { controller, audio, states };
}

test("soundtrack loads only when enabled, runs the shipped tracks in order and wraps", async () => {
  const { controller, audio } = setup();
  assert.deepEqual(tracks.map(track => track.split("?")[0]), [
    "/assets/shorts-news-tension-theme.mp3",
    "/assets/shorts-news-briefing-pulse.mp3",
    "/assets/shorts-news-analysis-desk.mp3",
    "/assets/shorts-news-world-in-focus.mp3"
  ]);
  tracks.forEach(track => assert.ok(fs.statSync(path.join(__dirname, "..", track.split("?")[0])).size > 10_000));
  assert.deepEqual(audio.history, []);
  controller.toggle();
  assert.equal(audio.loop, false);
  for (let n = 0; n < 4; n++) {
    audio.end();
    await flush();
  }
  assert.deepEqual(audio.history, [...tracks, tracks[0]]);
});

test("temporary suspension and manual pause preserve the track and playhead", async () => {
  const { controller, audio, states } = setup();
  controller.setSuspended(true);
  controller.toggle();
  assert.deepEqual(audio.history, []);
  assert.equal(states.at(-1).state, "paused");
  controller.setSuspended(false);
  await flush();
  audio.currentTime = 12;
  controller.setSuspended(true);
  assert.equal(audio.paused, true);
  controller.setSuspended(false);
  await flush();
  assert.equal(audio.paused, false);
  controller.toggle();
  assert.equal(audio.paused, true);
  controller.toggle();
  await flush();
  assert.equal(audio.paused, false);
  assert.equal(audio.currentTime, 12);
  assert.equal(audio.history.length, 1);
});

test("unavailable media is skipped without an unbounded retry", async () => {
  const { controller, audio, states } = setup();
  controller.toggle();
  await flush();
  audio.fail();
  audio.fail();
  await flush();
  assert.deepEqual(audio.history, tracks.slice(0, 2));
  Object.assign(audio.failures, Object.fromEntries(tracks.map(track => [track, "NotSupportedError"])));
  audio.fail();
  await flush();
  assert.deepEqual(states.at(-1), { enabled: false, state: "error" });
  assert.equal(audio.paused, true);
  assert.equal(audio.history.length, 5);
});

test("browser playback restrictions do not skip a track; tapping again can resume", async () => {
  const { controller, audio, states } = setup();
  controller.toggle();
  audio.failures[tracks[1]] = "NotAllowedError";
  audio.end();
  await flush();
  assert.deepEqual(audio.history, tracks.slice(0, 2));
  assert.deepEqual(states.at(-1), { enabled: false, state: "error" });
  delete audio.failures[tracks[1]];
  controller.toggle();
  await flush();
  assert.equal(audio.paused, false);
  assert.deepEqual(audio.history, tracks.slice(0, 2));
});

test("a stale rejected play promise cannot disable a newer user request", async () => {
  const { controller, audio } = setup();
  const naturalPlay = audio.play.bind(audio);
  let reject;
  audio.play = () => new Promise((_, fail) => { reject = fail; });
  controller.toggle();
  controller.toggle();
  audio.play = naturalPlay;
  controller.toggle();
  reject({ name: "NotAllowedError" });
  await flush();
  assert.equal(controller.state, "playing");
  assert.equal(audio.paused, false);
});
