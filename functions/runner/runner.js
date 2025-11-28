/* Cloud Run runner: HTTP service that accepts JSON { bucket, objectPath, uploadId }
 * Downloads a ZIP from GCS, extracts it, runs analyzers and writes a report
 * to GCS and Firestore. Designed to be invoked locally for testing or deployed
 * to Cloud Run behind authentication.
 */

const express = require('express');
const {Storage} = require('@google-cloud/storage');
const path = require('path');
const fs = require('fs');
const os = require('os');
// spawnSync was removed because the runner streams outputs to disk instead
// of buffering in-memory; keep the child_process require available if needed.
const AdmZip = require('adm-zip');

const analyzers = require('../analyzers');

const storage = new Storage();

const app = express();
app.use(express.json({limit: '10mb'}));

/**
 * Download a storage object to a local file path.
 * @param {string} bucketName
 * @param {string} objectName
 * @param {string} destPath
 * @return {Promise<void>}
 */
async function downloadToFile(bucketName, objectName, destPath) {
  await storage.bucket(bucketName).file(objectName).download({destination: destPath});
}


/**
 * Run the full analysis workflow for an upload: download, extract, analyze,
 * upload the report and update Firestore.
 *
 * @param {string} bucket
 * @param {string} objectPath
 * @param {string} uploadId
 * @param {Object} [options]
 * @return {Promise<Object>} report metadata
 */
async function runAnalysisForUpload(bucket, objectPath, uploadId, options = {}) {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), `lc-${uploadId}-`));
  const zipPath = path.join(tmpRoot, 'upload.zip');
  const extractDir = path.join(tmpRoot, 'extracted');
  fs.mkdirSync(extractDir);

  await downloadToFile(bucket, objectPath, zipPath);

  const zip = new AdmZip(zipPath);
  zip.extractAllTo(extractDir, true);

  // Call unified analyzer. The analyzer module may run SBOM, license-checker
  // and Snyk (when enabled) and will return a merged report object.
  // Prefer the local `analyze.js` (enhanced analyzer) when available so we
  // execute the exact analyzer you develop locally. Fall back to the
  // analyzers entrypoint when the local file is not present or throws.
  let report;
  try {
    console.log('runner: attempting to use local analyze.js');
    // analyze.js exports the EnhancedUnifiedAnalyzer class
    // (module.exports = EnhancedUnifiedAnalyzer)
    // Require it relative to the functions folder
    // (runner.js is in functions/runner, so ../analyze points to functions/analyze.js)
    // Use a dynamic require so missing module doesn't crash the whole runner.
    // eslint-disable-next-line global-require
    const LocalAnalyzer = require('../analyze');
    if (LocalAnalyzer) {
      console.log('runner: local analyze.js found; instantiating analyzer');
      const analyzerInstance = new LocalAnalyzer(extractDir);
      console.log('runner: using local analyze.js for analysis');
      // Use the comprehensiveAnalysis API (attachment uses this method)
      if (typeof analyzerInstance.comprehensiveAnalysis === 'function') {
        report = await analyzerInstance.comprehensiveAnalysis(options || {});
      } else if (typeof analyzerInstance.comprehensiveAnalysisWithOptions === 'function') {
        report = await analyzerInstance.comprehensiveAnalysisWithOptions(options || {});
      } else {
        throw new Error('local analyzer does not expose a known API');
      }
    }
  } catch (e) {
    console.warn(
      'runner: local analyze.js failed or not present, falling back to analyzers.analyzeProject -',
      String(e),
    );
    if (e && e.stack) console.warn(e.stack);
    // Fallback to the packaged analyzers entrypoint
    console.log('runner: invoking analyzers.analyzeProject (fallback)');
    report = await analyzers.analyzeProject(extractDir, options);
  }

  // Return the analysis report to the caller. The Cloud Function will be
  // responsible for persisting the report to Storage and updating Firestore.
  // cleanup
  try {
    fs.rmSync(tmpRoot, {recursive: true, force: true});
  } catch (e) {/* best-effort */}

  return {report};
}

app.post('/', async (req, res) => {
  try {
    // Accept either `objectPath` (legacy) or `storagePath` (function's naming).
    const {bucket, objectPath, storagePath, uploadId, runSnyk} = req.body;
    const objectKey = objectPath || storagePath;
    if (!bucket || !objectKey || !uploadId) {
      return res.status(400).json(
        {error: 'missing parameters (bucket, storagePath/objectPath, uploadId)'});
    }
    const options = {runSnyk: !!runSnyk, snykToken: process.env.SNYK_TOKEN};
    const {report} = await runAnalysisForUpload(bucket, objectKey, uploadId, options);
    res.json({ok: true, report});
  } catch (e) {
    console.error('analysis-failed', e);
    res.status(500).json({error: String(e)});
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Runner listening on ${PORT}`));

module.exports = app;
