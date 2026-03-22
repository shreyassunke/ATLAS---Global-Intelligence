/**
 * Shared analyser for ATLAS background audio (intro + ambient).
 * Set once from BackgroundAudio after Web Audio graph is built.
 */
let analyser = null

export function setAtlasAudioAnalyser(node) {
  analyser = node
}

export function getAtlasAudioAnalyser() {
  return analyser
}

export function clearAtlasAudioAnalyser() {
  analyser = null
}
