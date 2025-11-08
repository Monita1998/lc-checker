/* eslint-disable linebreak-style */
const path = require('path');
const fs = require('fs');

// Use the feature-flagged wrapper so we exercise the same path as the cloud function
const Analyzer = require('./analyzers/EnhancedSCAPlatform');

const projectArg = process.argv[2];
const defaultExtract = path.join(__dirname, '..', 'tests', 'extracted-sample');
const projectPath = projectArg ? path.resolve(projectArg) : defaultExtract;

(async () => {
  try {
    console.log('Running analyzer on:', projectPath);
    const analyzer = new Analyzer(projectPath);
    const result = await analyzer.comprehensiveAnalysis();

    // write result next to tests folder
    const outPath = path.join(path.dirname(projectPath), 'analysis-result.json');
    fs.writeFileSync(outPath, JSON.stringify(result, null, 2), 'utf8');
    console.log('ANALYSIS_OK ->', outPath);
    // clean successful exit for CI/scripts
    process.exit(0);
  } catch (err) {
    console.error('ANALYSIS_ERROR', err && err.stack ? err.stack : String(err));
    process.exit(2);
  }
})();
