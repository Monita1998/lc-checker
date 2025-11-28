/* eslint-disable linebreak-style */
const path = require('path');
const fs = require('fs');

// Use the public analyzers API so the local runner exercises the same path
// as the Cloud Run service (`functions/analyzers/index.js`).
const analyzers = require('./analyzers');

const projectArg = process.argv[2];
const defaultExtract = path.join(__dirname, '..', 'tests', 'extracted-sample');
const projectPath = projectArg ? path.resolve(projectArg) : defaultExtract;

(async () => {
  try {
    console.log('Running analyzer on:', projectPath);
    const result = await analyzers.analyzeProject(projectPath, {});

    // write result next to tests folder
    const outPath = path.join(path.dirname(projectPath), 'analysis-result.json');
    fs.writeFileSync(outPath, JSON.stringify(result, null, 2), 'utf8');
    console.log('ANALYSIS_OK ->', outPath);
    process.exit(0);
  } catch (err) {
    console.error('ANALYSIS_ERROR', err && err.stack ? err.stack : String(err));
    process.exit(2);
  }
})();
