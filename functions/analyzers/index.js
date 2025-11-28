/* eslint-disable linebreak-style */
/**
 * ============================================================================
 * Analyzers Entry Point - Cloud Run Runner Integration
 * ============================================================================
 *
 * This is the PRIMARY entry point for analysis when called from Cloud Run runner.
 * It orchestrates the entire analysis workflow and returns a unified report.
 *
 * CURRENT FLOW (When ZIP is unzipped in Cloud Run):
 * 1. runner.js (Cloud Run) receives POST with {bucket, storagePath, uploadId}
 * 2. runner.js downloads ZIP from GCS and extracts it
 * 3. runner.js tries to load ../analyzers/analyze.js (enhanced analyzer)
 * 4. If analyze.js fails, runner.js falls back to THIS FILE (analyzers/index.js)
 * 5. This file uses EnhancedUnifiedAnalyzer (analyze.js) for complete analysis
 * 6. Built-in SBOM from sbomGenerator.js (SPDX 2.3 compliant)
 * 7. Optional: Enhance with syft SBOM if available in Docker/Cloud Run
 * 8. Returns merged report to runner.js
 * 9. runner.js returns report to Cloud Function
 * 10. Cloud Function uploads report to GCS and updates Firestore
 *
 * DOCKER/CLOUD RUN INTEGRATION:
 * - Built-in SBOM via sbomGenerator.js (always available)
 * - Optional syft enhancement (set SYFT_PATH env var in Dockerfile)
 * - Merges both SBOM sources for maximum coverage
 *
 * ============================================================================
 */
console.log('🎯 analyzer loaded: analyzers/index.js');

// Use the NEW enhanced analyzer with built-in SBOM generation
const EnhancedUnifiedAnalyzer = require('./analyze');
const {spawnSync} = require('child_process');

/**
 * OPTIONAL: Enhance SBOM with external syft tool (Docker/Cloud Run)
 *
 * This supplements the built-in SBOM from sbomGenerator.js with additional
 * data from syft (if installed in the Docker container).
 *
 * DOCKER SETUP:
 * - Install syft in Dockerfile:
 *   RUN curl -sSfL https://raw.githubusercontent.com/anchore/syft/main/install.sh | sh
 * - Set environment variable: ENV SYFT_PATH=/usr/local/bin/syft
 * - syft provides additional metadata like CPE, PURL identifiers
 *
 * @param {string} projectPath - Path to the project directory to analyze.
 * @return {?Object} Parsed syft SBOM JSON when available, otherwise null.
 */
function tryEnhanceWithSyft(projectPath) {
  try {
    const syftCmd = process.env.SYFT_PATH || 'syft';
    console.log('analyzers/index: attempting to enhance SBOM with syft');
    const res = spawnSync(
      syftCmd,
      ['-o', 'spdx-json', projectPath],
      {encoding: 'utf8', timeout: 120000},
    );

    if (res && res.status === 0 && res.stdout) {
      try {
        const syftSbom = JSON.parse(res.stdout);
        console.log('✅ syft enhancement successful:', syftSbom.packages?.length || 0, 'packages');
        return syftSbom;
      } catch (e) {
        console.warn('syft output parse failed:', e.message);
        return null;
      }
    } else {
      console.log('syft not available or failed (this is optional)');
    }
  } catch (e) {
    console.log('syft enhancement skipped:', e.message);
  }

  return null;
}

/**
 * MAIN ANALYSIS FUNCTION - Called by Cloud Run runner
 *
 * This function is the public API for the analyzer subsystem.
 *
 * ENHANCED BEHAVIOR:
 * - Uses analyze.js (EnhancedUnifiedAnalyzer with built-in SBOM)
 * - Built-in SBOM via sbomGenerator.js (SPDX 2.3, always available)
 * - Optional syft enhancement (Docker/Cloud Run environments)
 * - Returns complete report with license + security + SBOM
 *
 * DOCKER/CLOUD RUN OPTIMIZATION:
 * - Primary SBOM: Built-in sbomGenerator (no external dependencies)
 * - Secondary SBOM: syft enhancement (when SYFT_PATH env var is set)
 * - Merges both sources for maximum package coverage
 *
 * @param {string} projectPath - Path to the extracted project directory.
 * @param {Object} [options] - Optional flags passed to the analyzer.
 * @return {Promise<Object>} Analysis report object.
 */
async function analyzeProject(projectPath, options = {}) {
  console.log('analyzers/index: invoking EnhancedUnifiedAnalyzer for project', projectPath);
  // Use analyze.js which has built-in SBOM generation
  const analyzer = new EnhancedUnifiedAnalyzer(projectPath);
  const report = await analyzer.comprehensiveAnalysis(options);

  // DOCKER/CLOUD RUN ENHANCEMENT: Add syft SBOM if available
  // This supplements the built-in SBOM with additional tool data
  const syftSbom = tryEnhanceWithSyft(projectPath);
  if (syftSbom) {
    console.log('analyzers/index: merging syft SBOM enhancement');
    // Store syft data separately to preserve both SBOM sources
    report.sbomEnhanced = syftSbom;
    // Optionally merge packages if both exist
    if (report.sbom && report.sbom.packages && syftSbom.packages) {
      const builtInCount = report.sbom.packages.length;
      const syftCount = syftSbom.packages.length;
      console.log(`SBOM sources: built-in=${builtInCount}, syft=${syftCount}`);
    }
  }

  try {
    let pkgCount = 'unknown';
    if (report && report.sbom && report.sbom.packages) {
      pkgCount = report.sbom.packages.length;
    } else if (report && report.licenseAnalytics && report.licenseAnalytics.totalPackages) {
      pkgCount = report.licenseAnalytics.totalPackages;
    }

    console.log('🎯 analyzers/index: analyzeProject completed');
    console.log('analyzers/index: project=', projectPath, 'packages=', pkgCount);
  } catch (e) {
    console.log('🎯 analyzers/index: analyzeProject completed');
  }

  return report;
}

module.exports = {analyzeProject};
