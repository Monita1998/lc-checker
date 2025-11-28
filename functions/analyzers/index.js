/* eslint-disable linebreak-style */
/**
 * Analyzer entrypoint for the Cloud Run runner.
 * Exports analyzeProject(projectPath, options) -> Promise<report>
 */
console.log('[analyzers] loaded: index.js');
console.log('🎯 analyzer loaded: analyzers/index.js');
const EnhancedUnifiedAnalyzer = require('./EnhancedUnifiedAnalyzer');
const {spawnSync} = require('child_process');

/**
 * Attempt to run an SBOM generator (syft) if available and attach result.
 * This is best-effort - failures are swallowed and do not prevent analysis.
 *
 * @param {string} projectPath - Path to the project directory to analyze.
 * @return {?Object} Parsed SBOM JSON when syft runs successfully, otherwise null.
 */
function tryGenerateSbom(projectPath) {
  try {
    const syftCmd = process.env.SYFT_PATH || 'syft';
    const res = spawnSync(
      syftCmd,
      ['-o', 'json', projectPath],
      {encoding: 'utf8', timeout: 120000},
    );

    if (res && res.status === 0 && res.stdout) {
      try {
        return JSON.parse(res.stdout);
      } catch (e) {
        return null;
      }
    }
  } catch (e) {
    // optional: syft not available or failed
  }

  return null;
}

/**
 * Analyze an extracted project directory and return a merged report.
 *
 * @param {string} projectPath - Path to the extracted project directory.
 * @param {Object} [options] - Optional flags passed to the analyzer.
 * @return {Promise<Object>} Analysis report object.
 */
async function analyzeProject(projectPath, options = {}) {
  console.log('analyzers/index: invoking EnhancedUnifiedAnalyzer for project', projectPath);
  const analyzer = new EnhancedUnifiedAnalyzer(projectPath);
  // Use the options-compatible API where available
  const run = analyzer.comprehensiveAnalysisWithOptions || analyzer.comprehensiveAnalysis;
  const report = await run.call(analyzer, options);

  // Best-effort SBOM inclusion (Syft) - optional and non-fatal
  console.log('analyzers/index: analysis complete; attaching SBOM if available');
  const sbom = tryGenerateSbom(projectPath);
  if (sbom) report.sbom = sbom;

  return report;
}

module.exports = {analyzeProject};
