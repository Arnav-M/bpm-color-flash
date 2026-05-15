/** Shared deterministic colors — every phone computes the same color for the same beat. */
export const BPM_MIN = 40;
export const BPM_MAX = 220;

export function beatIndex(state, serverNowMs) {
  if (!state?.running) return 0;
  const msPerBeat = 60000 / state.bpm;
  const elapsed = serverNowMs - state.epochMs;
  return state.beatOffset + Math.floor(elapsed / msPerBeat);
}

export function colorForBeat(beat, mode) {
  switch (mode) {
    case "strobe":
      return beat % 2 === 0 ? "#ffffff" : "#0a0a0a";
    case "pair":
      return beat % 2 === 0 ? "#ff1744" : "#2979ff";
    case "pair-gb":
      return beat % 2 === 0 ? "#00e676" : "#ea00ff";
    case "gold":
      return beat % 2 === 0 ? "#ffd54f" : "#ff6f00";
    case "random": {
      const hue = (beat * 137.508) % 360;
      return `hsl(${hue.toFixed(1)} 92% 52%)`;
    }
    case "spectrum":
    default:
      return `hsl(${(beat * 37) % 360} 90% 55%)`;
  }
}
