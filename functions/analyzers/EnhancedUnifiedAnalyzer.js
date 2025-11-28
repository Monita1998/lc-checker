/* EnhancedUnifiedAnalyzer
 * A more robust analyzer you can run individually for testing. It mirrors the
 * behavior of the CLI prototype (`testnew4.js`) but fixes package name parsing
 * and normalizes license fields so top-license counts match local runs.
 */

const {execSync} = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('[analyzers] loaded: EnhancedUnifiedAnalyzer.js');
console.log('🎯 analyzer loaded: analyzers/EnhancedUnifiedAnalyzer.js');

/**
 * EnhancedUnifiedAnalyzer
 * A lightweight, robust analyzer intended for local testing and as a
 * reference implementation. It collects license data (via license-checker)
 * and produces a normalized license analytics report.
 *
 * @class
 */
class EnhancedUnifiedAnalyzer {
  /**
   * Create a new analyzer instance.
   * @param {string} projectPath - Path to the extracted project directory.
   */
  constructor(projectPath) {
    this.projectPath = path.resolve(projectPath || '.');
    this.results = {};
  }

  /**
   * Run a comprehensive analysis and return a normalized report.
   * @param {Object} [options] - Optional flags (e.g. {runSnyk: true})
   * @return {Promise<Object>} Analysis report containing license analytics.
   */
  async comprehensiveAnalysis(options = {}) {
    // Accept options (runner may pass {runSnyk: true})
    return this.comprehensiveAnalysisWithOptions(options);
  }

  /**
   * Backwards-compatible wrapper that supports options.
   * @param {Object} [options]
   */
  async comprehensiveAnalysisWithOptions(options = {}) {
    // Run license-checker (primary) and fall back to package.json parsing
    const licenseData = this.getLicenseDataSync();
    const packages = this.extractPackages(licenseData);

    // top licenses and license analytics
    const topLicenses = this.getTopLicenses(packages, 10);

    // baseline report
    const report = {
      metadata: {
        generated_at: new Date().toISOString(),
        project_path: this.projectPath,
        analyzer_version: 'enhanced-1.1.0',
      },
      licenseAnalytics: {
        totalPackages: packages.length,
        topLicenses,
      },
      securityOverview: {},
    };

    // Optionally run npm audit (already part of earlier analyzer) and merge
    // into the securityOverview
    try {
      // npm audit parsing (best-effort)
      try {
        const out = execSync('npm audit --json', {
          cwd: this.projectPath,
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe'],
          timeout: 120000,
        });
        const audit = JSON.parse(out || '{}');
        report.securityOverview = this.processNpmAudit(audit);
      } catch (e) {
        // fallback: leave securityOverview empty
        report.securityOverview = this.getEmptySecurityData();
      }

      // Snyk has been removed from the runner (paid); we rely on npm audit
      // and license-checker + OSV for security data.
    } catch (err) {
      // ensure analyzer always returns a report
      report.error = String(err);
    }

    this.results = report;
    return report;
  }

  /**
   * Synchronously obtain license data by invoking license-checker. Falls back
   * to package.json parsing if license-checker fails or is unavailable.
   *
   * @return {Object} Mapping of "package@version" => license-checker output
   */
  getLicenseDataSync() {
    try {
      // Use license-checker to get dependency licenses. By default we run
      // with --production to exclude devDependencies. Set env INCLUDE_DEV=1
      // to include devDependencies (to match local runs that include them).
      const includeDev = !!(process.env.INCLUDE_DEV || process.env.ENHANCED_INCLUDE_DEV);
      const cmd = includeDev ?
        'npx --yes license-checker --json' :
        'npx --yes license-checker --json --production';
      const out = execSync(cmd, {
        cwd: this.projectPath,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 120000,
      });
      return JSON.parse(out || '{}');
    } catch (err) {
      // If license-checker fails, fallback to simple package.json dependency map
      return this.fallbackLicenseAnalysis();
    }
  }

  /**
   * Process npm audit JSON into a compact security overview structure
   * @param {Object} audit
   * @return {Object}
   */
  processNpmAudit(audit) {
    try {
      const vulnerabilities = audit && audit.vulnerabilities ? audit.vulnerabilities : {};
      const total = Object.values(vulnerabilities)
        .reduce((s, v) => s + (v && v.via ? v.via.length : 0), 0);
      const severities = {critical: 0, high: 0, moderate: 0, low: 0};
      Object.values(vulnerabilities).forEach((v) => {
        if (!v || !v.via) return;
        v.via.forEach((entry) => {
          const sev = (entry.severity || entry.severityLabel || 'moderate').toLowerCase();
          if (severities[sev] !== undefined) severities[sev]++;
        });
      });
      return {vulnerabilities: total, severities};
    } catch (e) {
      return this.getEmptySecurityData();
    }
  }

  /**
   * Fallback license analysis that reads package.json and returns a simple
   * mapping of dependencies to UNKNOWN license when license-checker is not
   * available.
   *
   * @return {Object} Fallback license mapping
   */
  fallbackLicenseAnalysis() {
    try {
      const packageJsonPath = path.join(this.projectPath, 'package.json');
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      const deps = Object.assign({},
        packageJson.dependencies || {},
        packageJson.devDependencies || {});
      const out = {};
      Object.keys(deps).forEach((d) => {
        out[`${d}@${deps[d]}`] = {licenses: 'UNKNOWN', repository: '', path: `node_modules/${d}`};
      });
      return out;
    } catch (e) {
      return {};
    }
  }

  /**
   * Convert license-checker raw mapping into an array of package objects
   * with normalized name, version and license fields.
   *
   * @param {Object} licenseData - Raw mapping from license-checker
   * @return {Array<Object>} Array of packages {name, version, license, repository, path}
   */
  extractPackages(licenseData) {
    // licenseData keys are like 'pkg@version' and may include scoped names
    return Object.entries(licenseData || {}).map(([pkgKey, pkgData]) => {
      // Find the last @ that separates name and version. Scoped packages start with '@'.
      let name = pkgKey;
      let version = '';
      const lastAt = pkgKey.lastIndexOf('@');
      if (lastAt > 0) {
        name = pkgKey.slice(0, lastAt);
        version = pkgKey.slice(lastAt + 1);
      }

      const license = this.normalizeLicenseField(pkgData);
      return {
        name,
        version,
        license,
        repository: pkgData.repository || '',
        path: pkgData.path || '',
      };
    });
  }

  /**
   * Normalize various license representations returned by license-checker
   * into a single license string. If no license can be determined returns
   * 'NOASSERTION'.
   *
   * @param {Object} pkgData - license-checker package data
   * @return {string} Normalized license identifier
   */
  normalizeLicenseField(pkgData) {
    // license-checker may return `licenses` as string, array or object.
    const raw = pkgData.licenses || pkgData.license ||
      (pkgData.licenses && pkgData.licenses.license) || '';
    if (!raw) return 'NOASSERTION';
    if (Array.isArray(raw)) return String(raw[0] || 'NOASSERTION');
    if (typeof raw === 'object' && raw !== null) {
      // object may have name property
      return raw.name || String(raw) || 'NOASSERTION';
    }
    return String(raw);
  }

  /**
   * Compute top licenses by count and percentage.
   *
   * @param {Array<Object>} packages - package list with license field
   * @param {number} [limit=5] - max number of top entries to return
   * @return {Array<Object>} Array of {license, count, percentage}
   */
  getTopLicenses(packages, limit = 5) {
    const counts = {};
    packages.forEach((p) => {
      const lic = p.license || 'NOASSERTION';
      counts[lic] = (counts[lic] || 0) + 1;
    });
    const total = packages.length || 1;
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([license, count]) => ({license, count, percentage: Math.round((count / total) * 100)}));
  }
}

module.exports = EnhancedUnifiedAnalyzer;

// CLI support for easy local testing: `node EnhancedUnifiedAnalyzer.js /path/to/project`
if (require.main === module) {
  (async () => {
    const projectPath = process.argv[2] || '.';
    const a = new EnhancedUnifiedAnalyzer(projectPath);
    const r = await a.comprehensiveAnalysis();
    const outPath = path.join(process.cwd(), 'enhanced-unified-report.json');
    fs.writeFileSync(outPath, JSON.stringify(r, null, 2));
    console.log('Report written to', outPath);
    // Print top licenses
    console.log('\nTOP LICENSES:');
    (r.licenseAnalytics.topLicenses || []).forEach(
      (t) => console.log(`${t.license}: ${t.count} packages (${t.percentage}%)`));
  })();
}
