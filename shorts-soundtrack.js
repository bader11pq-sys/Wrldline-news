(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.WRLDLINE_SHORTS_SOUNDTRACK = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const tracks = Object.freeze([
    "/assets/shorts-news-tension-theme.mp3?v=background1",
    "/assets/shorts-news-briefing-pulse.mp3",
    "/assets/shorts-news-analysis-desk.mp3",
    "/assets/shorts-news-world-in-focus.mp3",
  ]);

  function create({ audio, onState = () => {} } = {}) {
    let index = 0, enabled = false, suspended = false;
    let loaded = -1, failures = 0, generation = 0, playing = false, state = "off";
    let initialized = false;

    function update(next) {
      state = next;
      onState({ state, enabled });
    }

    function stop(next = "off") {
      enabled = false;
      generation += 1;
      playing = false;
      audio?.pause();
      update(next);
    }

    function fail(error) {
      if (error?.name === "NotAllowedError") {
        stop("error");
        return;
      }
      loaded = -1;
      if (++failures >= tracks.length) {
        stop("error");
        return;
      }
      index = (index + 1) % tracks.length;
      start();
    }

    function start() {
      if (!enabled || suspended) return;
      if (!initialized) {
        audio ??= new Audio();
        audio.loop = false;
        audio.preload = "none";
        audio.addEventListener("ended", () => {
          if (loaded !== index || !audio.ended) return;
          index = (index + 1) % tracks.length;
          if (enabled && !suspended) start();
        });
        audio.addEventListener("error", () => {
          // While starting, the play() rejection handles the same error.
          if (enabled && !suspended && playing && audio.error) fail(audio.error);
        });
        initialized = true;
      }
      const ticket = ++generation;
      playing = false;
      update("loading");
      if (loaded !== index || audio.error) {
        loaded = index;
        audio.src = tracks[index];
      }

      const onFailure = (error) => {
        if (ticket === generation && enabled && !suspended) fail(error);
      };
      try {
        Promise.resolve(audio.play()).then(() => {
          if (ticket !== generation || !enabled || suspended) return;
          failures = 0;
          playing = true;
          update("playing");
        }, onFailure);
      } catch (error) {
        onFailure(error);
      }
    }

    return {
      toggle() {
        if (enabled) return stop();
        failures = 0;
        enabled = true;
        if (suspended) update("paused");
        else start();
      },
      setSuspended(next) {
        if (suspended === next) return;
        suspended = next;
        if (!enabled) return;
        if (next) {
          generation += 1;
          playing = false;
          audio?.pause();
          update("paused");
        } else {
          start();
        }
      },
      get state() { return state; },
    };
  }

  return { create, tracks };
});
