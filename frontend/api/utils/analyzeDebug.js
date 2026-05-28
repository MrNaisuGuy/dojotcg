export function isAnalyzeDebugEnabled() {
  return process.env.DEBUG_ANALYZE === "true";
}

export function startTimer(label) {
  if (isAnalyzeDebugEnabled()) console.time(label);
}

export function endTimer(label) {
  if (isAnalyzeDebugEnabled()) console.timeEnd(label);
}
