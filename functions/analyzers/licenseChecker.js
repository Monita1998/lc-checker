console.log('[analyzers] loaded: licenseChecker.js');
console.log('🎯 analyzer loaded: analyzers/licenseChecker.js');
/**
 * Minimal license-checker wrapper.
 * For production runs the runner image includes `license-checker` and the
 * analyzer will call it via `npx license-checker`. In this scaffold we
 * provide a safe stub that can be replaced with a real wrapper if desired.
 *
 * @param {string} projectPath
 * @param {Object} [options]
 * @return {Promise<Object>}
 */
async function runLicenseChecker(projectPath, options = {}) {
  // Keep this lightweight and local-friendly; if you want to enable
  // real license-checker execution, replace this implementation with
  // a child_process.execSync call to `npx license-checker --json`.
  return {skipped: true, reason: 'license-checker-not-enabled-in-this-build'};
}

module.exports = {runLicenseChecker};
