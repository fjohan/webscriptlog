// Activate the experimental fast linear implementation in the browser app.
(function activateFastLinearRuntime(globalObject) {
  if (!globalObject) return;
  if (typeof globalObject.recordsToLinearRepresentationFast !== 'function') return;
  if (typeof globalObject.validateLinearRepresentationFast !== 'function') return;

  if (typeof globalObject.recordsToLinearRepresentation === 'function' && !globalObject.recordsToLinearRepresentationOriginal) {
    globalObject.recordsToLinearRepresentationOriginal = globalObject.recordsToLinearRepresentation;
  }

  if (typeof globalObject.validateLinearRepresentation === 'function' && !globalObject.validateLinearRepresentationOriginal) {
    globalObject.validateLinearRepresentationOriginal = globalObject.validateLinearRepresentation;
  }

  globalObject.recordsToLinearRepresentation = globalObject.recordsToLinearRepresentationFast;
  globalObject.validateLinearRepresentation = globalObject.validateLinearRepresentationFast;
  globalObject.linearFastRuntimeEnabled = true;
})(typeof window !== 'undefined' ? window : globalThis);
