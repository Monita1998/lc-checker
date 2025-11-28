const path = require('path');
const axios = require('axios');
const {generateSBOM} = require('./sbomGenerator');

console.log('[analyzers] loaded: SCAPlatformAnalyzerImpl.js');
console.log('🎯 analyzer loaded: analyzers/SCAPlatformAnalyzerImpl.js');

/**
 * Performs Software Composition Analysis (SCA) using a local SBOM generator.
 * This implementation is serverless-friendly and does not call Docker or external
 * native tooling; it relies on `sbomGenerator.generateSBOM` to produce an
 * SPDX-like SBOM object.
 */
class SCAPlatformAnalyzer {
  /**
   * Create a new analyzer for a project path.
   * @param {string} projectPath - Path to the project to analyze.
   */
  constructor(projectPath) {
    this.projectPath = path.resolve(projectPath || '.');
  }

  /**
   * Perform a comprehensive analysis and return an object with the expected
   * fields used elsewhere in the codebase (sbom, licenseCompliance,
   * securityVulnerabilities, riskAssessment, reports, metadata).
  * @return {Promise<object>} analysis result
   */
  async comprehensiveAnalysis() {
    // Generate SBOM without using Docker (serverless-friendly)
    const sbom = await generateSBOM(this.projectPath);

    // Simple license checks based on the generated SBOM.
    // - Treat packages with licenseDeclared / licenseConcluded === 'NOASSERTION'
    //   as missing license (warning)
    // - Treat packages whose license is in a short disallowed list as violations
    const packages = sbom.packages || [];

    // SPDX mapping and risk/policy analysis
    const disallowedLicenses = new Set(['AGPL-3.0', 'GPL-3.0', 'GPL-2.0']);
    const violations = [];
    const warnings = [];
    const spdxCounts = {};

    packages.forEach((pkg) => {
      const licRaw = pkg.licenseDeclared || pkg.licenseConcluded || pkg.license || '';
      const lic = Array.isArray(licRaw) ? licRaw[0] : (licRaw || 'NOASSERTION');
      const name = pkg.name || pkg.SPDXID || 'unknown';
      const version = pkg.versionInfo || pkg.version || 'unknown';

      const spdx = this.mapToSPDXLicense(lic);
      spdxCounts[spdx] = (spdxCounts[spdx] || 0) + 1;

      if (!lic || lic === 'NOASSERTION' || lic === 'UNLICENSED') {
        warnings.push({
          package: name,
          version,
          license: lic || 'NONE',
          reason: 'missing or unknown license',
        });
        return;
      }

      // policy checks
      if (disallowedLicenses.has(spdx)) {
        violations.push({
          package: name,
          version,
          license: spdx,
          reason: 'disallowed license',
          severity: 'high',
        });
      }
    });

    const licenseSummary = {
      totalPackages: packages.length,
      uniqueLicenses: Object.keys(spdxCounts).length,
      licenseCounts: spdxCounts,
      licenseDistribution: this.calculateLicenseDistribution(spdxCounts),
    };

    const policyResult = this.detectPolicyViolations(packages);

    const quality = this.calculateQualityMetrics(packages);
    const licenseUsage = this.analyzeLicenseUsage(packages);

    const licenseCompliance = {
      summary: licenseSummary,
      violations: policyResult.violations.concat(violations),
      warnings: policyResult.warnings.concat(warnings),
      riskDistribution: this.classifyLicenseRisks(packages),
      qualityMetrics: quality,
      licenseUsage,
    };

    // perform lightweight vulnerability analysis using OSV (batch queries)
    const securityVulnerabilities = await this.analyzeVulnerabilities(packages);

    const totalVulns = securityVulnerabilities && securityVulnerabilities.summary ?
      (securityVulnerabilities.summary.totalVulnerabilities || 0) : 0;
    const detailedRisks = (securityVulnerabilities.vulnerabilities || []).map((v) => {
      return {
        package: v.package,
        count: Array.isArray(v.osvEntries) ? v.osvEntries.length : 0,
        details: v.osvEntries || [],
      };
    });

    const riskAssessment = {
      overallRiskScore: totalVulns * 10,
      detailedRisks,
    };

    const reports = {
      executiveSummary: {
        projectHealth: 'UNKNOWN',
        topRisks: [],
        quickActions: [],
        summaryMetrics: {
          overallRiskScore: 0,
          totalRisks: 0,
          highPriority: 0,
          complianceStatus: 'UNKNOWN',
        },
      },
    };

    return {
      sbom,
      licenseCompliance,
      securityVulnerabilities,
      riskAssessment,
      reports,
      metadata: {
        analysisTimestamp: new Date().toISOString(),
        generator: 'sbomGenerator (no-docker)',
      },
    };
  }

  // --- Helper methods ported from the enhanced analyzer ---
  /**
   * Map a raw license string to a best-effort SPDX identifier.
   * @param {string|string[]} license
  * @return {string}
   */
  mapToSPDXLicense(license) {
    const spdxMappings = {
      'MIT': 'MIT',
      'Apache-2.0': 'Apache-2.0',
      'Apache 2.0': 'Apache-2.0',
      'GPL-3.0': 'GPL-3.0',
      'GPL-2.0': 'GPL-2.0',
      'BSD-3-Clause': 'BSD-3-Clause',
      'BSD-2-Clause': 'BSD-2-Clause',
      'ISC': 'ISC',
      'LGPL-2.1': 'LGPL-2.1',
      'LGPL-3.0': 'LGPL-3.0',
      'MPL-2.0': 'MPL-2.0',
      'UNKNOWN': 'NOASSERTION',
      'UNLICENSED': 'UNLICENSED',
    };

    if (!license) return 'NOASSERTION';
    if (Array.isArray(license)) license = license[0];
    return spdxMappings[license] || license || 'NOASSERTION';
  }

  /**
   * Normalize SPDX identifiers for policy checks (strip "-only" / "-or-later").
   * @param {string} spdx
  * @return {string}
   */
  normalizeSPDX(spdx) {
    if (!spdx || typeof spdx !== 'string') return spdx;
    return spdx.replace(/-only|-or-later/gi, '').trim();
  }

  /**
   * Classify a single license into a risk bucket.
   * @param {string} license
  * @return {string} risk bucket
   */
  classifyLicenseRisk(license) {
    const riskMatrix = {
      PERMISSIVE: [
        'MIT',
        'Apache-2.0',
        'BSD-2-Clause',
        'BSD-3-Clause',
        'ISC',
        'Unlicense',
        'CC0-1.0',
      ],
      WEAK_COPYLEFT: ['LGPL-2.1', 'LGPL-3.0', 'MPL-2.0', 'EPL-1.0'],
      STRONG_COPYLEFT: ['GPL-2.0', 'GPL-3.0', 'AGPL-3.0'],
      PROPRIETARY: ['Proprietary', 'Commercial', 'UNLICENSED'],
    };

    if (!license) return 'UNKNOWN';
    for (const [risk, list] of Object.entries(riskMatrix)) {
      if (list.includes(license)) return risk;
    }
    return 'UNKNOWN';
  }

  /**
   * Build an aggregated risk distribution for a list of packages.
   * @param {Array} packages
  * @return {{distribution: Object, percentages: Object, total: number}}
   */
  classifyLicenseRisks(packages) {
    const distribution = {};
    packages.forEach((pkg) => {
      const licRaw = pkg.licenseDeclared || pkg.licenseConcluded || pkg.license || '';
      const spdx = this.mapToSPDXLicense(Array.isArray(licRaw) ? licRaw[0] : licRaw);
      const norm = this.normalizeSPDX(spdx);
      const risk = this.classifyLicenseRisk(norm);
      distribution[risk] = (distribution[risk] || 0) + 1;
    });
    const total = Object.values(distribution).reduce((s, c) => s + c, 0) || 0;
    const percentages = this.calculateRiskPercentages(distribution, total);
    return {distribution, percentages, total};
  }

  /**
   * Convert counts to percentages safely.
   * @param {Object} distribution
   * @param {number} total
  * @return {Object}
   */
  calculateRiskPercentages(distribution, total) {
    const percentages = {};
    Object.keys(distribution).forEach((risk) => {
      percentages[risk] = total > 0 ? Math.round((distribution[risk] / total) * 100) : 0;
    });
    return percentages;
  }

  /**
   * Load a simple, in-memory compliance policy set.
  * @return {Object}
   */
  loadCompliancePolicies() {
    return {
      blockedLicenses: ['GPL-3.0', 'AGPL-3.0', 'GPL-2.0'],
      warningLicenses: ['LGPL-2.1', 'LGPL-3.0', 'MPL-2.0'],
      blockedRiskLevels: ['STRONG_COPYLEFT', 'PROPRIETARY'],
      allowedLicenses: ['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC'],
    };
  }

  /**
   * Detect policy violations and warnings for a list of packages.
   * @param {Array} packages
  * @return {Object}
   */
  detectPolicyViolations(packages) {
    const policies = this.loadCompliancePolicies();
    const violations = [];
    const warnings = [];

    packages.forEach((pkg) => {
      const licRaw = pkg.licenseDeclared || pkg.licenseConcluded || pkg.license || '';
      const lic = Array.isArray(licRaw) ? licRaw[0] : licRaw;
      const spdx = this.mapToSPDXLicense(lic);
      const norm = this.normalizeSPDX(spdx);
      const riskLevel = this.classifyLicenseRisk(norm);

      if (
        policies.blockedLicenses.includes(norm) ||
        policies.blockedRiskLevels.includes(riskLevel)
      ) {
        violations.push({
          package: pkg.name || pkg.SPDXID || 'unknown',
          version: pkg.version || pkg.versionInfo || 'unknown',
          license: spdx,
          riskLevel,
          type: 'BLOCKED_LICENSE',
          severity: 'HIGH',
          message: `Blocked license: ${spdx}`,
        });
      } else if (policies.warningLicenses.includes(norm)) {
        warnings.push({
          package: pkg.name || pkg.SPDXID || 'unknown',
          version: pkg.version || pkg.versionInfo || 'unknown',
          license: spdx,
          riskLevel,
          type: 'WARNING_LICENSE',
          severity: 'MEDIUM',
          message: `Warning license: ${spdx}`,
        });
      }
    });

    return {
      violations,
      warnings,
      summary: {
        totalViolations: violations.length,
        totalWarnings: warnings.length,
        complianceStatus: violations.length === 0 ? 'COMPLIANT' : 'NON_COMPLIANT',
      },
    };
  }

  /**
   * Calculate simple package quality metrics based on license clarity.
   * @param {Array} packages
  * @return {Object}
   */
  calculateQualityMetrics(packages) {
    let excellent = 0; let good = 0; const fair = 0; let poor = 0;
    packages.forEach((pkg) => {
      const licRaw = pkg.licenseDeclared || pkg.licenseConcluded || pkg.license || '';
      const spdx = this.mapToSPDXLicense(Array.isArray(licRaw) ? licRaw[0] : licRaw);
      if (this.isStandardSPDXLicense(spdx) && spdx && spdx !== 'NOASSERTION') {
        excellent += 1;
      } else if (spdx && spdx !== 'NOASSERTION') {
        good += 1;
      } else {
        poor += 1;
      }
    });
    return {
      excellent,
      good,
      fair,
      poor,
      qualityScore: Math.round((excellent / (packages.length || 1)) * 100) || 0,
    };
  }

  /**
   * Heuristic: is this a standard SPDX license identifier?
   * @param {string} spdx
  * @return {boolean}
   */
  isStandardSPDXLicense(spdx) {
    if (!spdx || typeof spdx !== 'string') return false;
    // Very small heuristic: contains an alphanumeric token
    return /[A-Za-z0-9]+/.test(spdx) && spdx !== 'NOASSERTION' && spdx !== 'UNLICENSED';
  }

  /**
   * Scan project root for important files (package.json, lockfiles, node_modules).
   * @return {Object} availability map
   */
  scanProjectFiles() {
    const fs = require('fs');
    const root = this.projectPath;
    return {
      packageJson: fs.existsSync(path.join(root, 'package.json')),
      packageLock: fs.existsSync(path.join(root, 'package-lock.json')),
      yarnLock: fs.existsSync(path.join(root, 'yarn.lock')),
      nodeModules: fs.existsSync(path.join(root, 'node_modules')),
      dockerfile: fs.existsSync(path.join(root, 'Dockerfile')),
      snykConfig: fs.existsSync(path.join(root, '.snyk')),
      npmrc: fs.existsSync(path.join(root, '.npmrc')),
      srcDir: fs.existsSync(path.join(root, 'src')),
      libDir: fs.existsSync(path.join(root, 'lib')),
      appDir: fs.existsSync(path.join(root, 'app')),
    };
  }

  /**
   * Validate scanning environment and produce issues/recommendations summary.
   * @return {Object}
   */
  validateScanningEnvironment() {
    const files = this.scanProjectFiles();
    const issues = [];
    const recommendations = [];

    if (!files.packageJson) {
      issues.push('CRITICAL: package.json not found - license compliance cannot be checked');
    }
    if (!files.nodeModules) {
      issues.push('WARNING: node_modules not found - some license data may be incomplete');
      recommendations.push('Run "npm install" to generate node_modules');
    }
    if (!files.packageLock && !files.yarnLock) {
      issues.push('WARNING: No lock file found (package-lock.json or yarn.lock).');
      issues.push('Vulnerability scanning may be less accurate without exact versions.');
    }
    if (files.dockerfile) {
      recommendations.push('Dockerfile found - consider scanning base image vulnerabilities');
    }
    if (files.srcDir) recommendations.push('Source code detected - consider SAST/static analysis');

    return {issues, recommendations, fileSummary: this.getFileSummary(files)};
  }

  /**
   * Return a compact file summary for reports/logs.
   * @param {Object} [files]
   * @return {Object}
   */
  getFileSummary(files) {
    const f = files || this.scanProjectFiles();
    const essentialFiles = [
      {name: 'package.json', available: f.packageJson, purpose: 'License + Vulnerability'},
      {
        name: 'package-lock.json',
        available: f.packageLock,
        purpose: 'Vulnerability (exact versions)',
      },
      {name: 'node_modules/', available: f.nodeModules, purpose: 'License (actual package files)'},
      {name: 'yarn.lock', available: f.yarnLock, purpose: 'Vulnerability (yarn exact versions)'},
    ];
    const additionalFiles = [
      {name: 'Dockerfile', available: f.dockerfile, purpose: 'Container security'},
      {name: '.snyk', available: f.snykConfig, purpose: 'Snyk configuration'},
      {name: '.npmrc', available: f.npmrc, purpose: 'NPM configuration security'},
    ];
    return {essentialFiles, additionalFiles};
  }

  /**
   * Print a short environment report to console (useful in local runs).
   * @param {Object} environment
   * @return {void}
   */
  printEnvironmentReport(environment) {
    try {
      console.log('PROJECT STRUCTURE ANALYSIS');
      console.log('Essential files:');
      environment.fileSummary.essentialFiles.forEach((file) => {
        const status = file.available ? 'YES' : 'NO';
        console.log(`  ${status} ${file.name} - ${file.purpose}`);
      });
      if (environment.issues && environment.issues.length) {
        console.log('ISSUES:');
        environment.issues.forEach((i) => console.log('  -', i));
      }
      if (environment.recommendations && environment.recommendations.length) {
        console.log('RECOMMENDATIONS:');
        environment.recommendations.forEach((r) => console.log('  -', r));
      }
    } catch (e) {
      // do not fail analysis for logging errors
    }
  }

  /**
   * High-level license scanning wrapper that uses the SBOM-derived packages.
   * @return {Promise<Object>}
   */
  async scanLicenses() {
    const sbom = await generateSBOM(this.projectPath);
    const packages = sbom.packages || [];
    const filesUsed = ['package.json'];
    if (this.scanProjectFiles().nodeModules) filesUsed.push('node_modules/');

    return {
      status: 'completed',
      files_used: filesUsed,
      licenseSummary: this.analyzeLicenseUsage(packages),
      quality: this.calculateQualityMetrics(packages),
    };
  }

  /**
   * High-level vulnerability scanning wrapper that delegates to analyzeVulnerabilities.
   * @return {Promise<Object>}
   */
  async scanVulnerabilities() {
    const sbom = await generateSBOM(this.projectPath);
    const packages = sbom.packages || [];
    const vulnResult = await this.analyzeVulnerabilities(packages);
    return {
      status: 'completed',
      files_used: [this.scanProjectFiles().packageLock ? 'package-lock.json' : 'package.json'],
      result: vulnResult,
    };
  }

  /**
   * Return a list of scanned files (for metadata).
   * @return {Array<string>}
   */
  getScannedFilesList() {
    const files = this.scanProjectFiles();
    const scanned = [];
    if (files.packageJson) scanned.push('package.json');
    if (files.packageLock) scanned.push('package-lock.json');
    if (files.yarnLock) scanned.push('yarn.lock');
    if (files.nodeModules) scanned.push('node_modules/');
    return scanned;
  }

  /**
   * Analyze license usage and produce top-used licenses and a risk profile.
   * @param {Array} packages
  * @return {Object}
   */
  analyzeLicenseUsage(packages) {
    const licenseFrequency = {};
    packages.forEach((pkg) => {
      const licRaw = pkg.licenseDeclared || pkg.licenseConcluded || pkg.license || '';
      const spdx = this.mapToSPDXLicense(Array.isArray(licRaw) ? licRaw[0] : licRaw);
      licenseFrequency[spdx] = (licenseFrequency[spdx] || 0) + 1;
    });
    const mostUsed = Object.entries(licenseFrequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([license, count]) => ({
        license,
        count,
        percentage: Math.round((count / (packages.length || 1)) * 100),
      }));
    const riskData = this.classifyLicenseRisks(packages);
    const riskCounts = riskData.distribution || {};
    const copyleftCount = (riskCounts.WEAK_COPYLEFT || 0) + (riskCounts.STRONG_COPYLEFT || 0);
    return {
      mostUsedLicenses: mostUsed,
      riskProfile: {
        permissivePercentage:
          Math.round((riskCounts.PERMISSIVE || 0) / (packages.length || 1) * 100) || 0,
        copyleftPercentage:
          Math.round((copyleftCount / (packages.length || 1)) * 100) || 0,
        unknownPercentage:
          Math.round((riskCounts.UNKNOWN || 0) / (packages.length || 1) * 100) || 0,
      },
    };
  }

  /**
   * Lightweight OSV integration: batch-query OSV for each package.
   * Returns a summary and per-package vulnerability hits. Uses axios with a timeout
   * and falls back to an empty result on network errors.
   * @param {Array} packages
   * @return {Promise<Object>}
   */
  async analyzeVulnerabilities(packages) {
    if (!packages || packages.length === 0) {
      return {
        summary: {totalVulnerabilities: 0, bySeverity: {}},
        vulnerabilities: [],
        affectedPackages: [],
      };
    }

    const chunkSize = 50;
    const queriesForPackage = [];
    const pkgMap = [];

    // build queries with best-effort ecosystem detection
    packages.forEach((pkg) => {
      const parsed = this.parsePurlOrGuess(pkg);
      if (!parsed || !parsed.name) return;
      const ecosystem = parsed.ecosystem || 'npm';
      const version = parsed.version || parsed.pkgVersion || '';
      queriesForPackage.push({package: {ecosystem, name: parsed.name}, version});
      pkgMap.push({package: parsed.name, version, original: pkg});
    });

    const resultsPerPackage = [];
    const bySeverity = {};
    let totalVulnerabilities = 0;

    const apiUrl = 'https://api.osv.dev/v1/querybatch';

    for (let i = 0; i < queriesForPackage.length; i += chunkSize) {
      const chunk = queriesForPackage.slice(i, i + chunkSize);
      try {
        const resp = await axios.post(apiUrl, {queries: chunk}, {timeout: 10000});
        const data = (resp && resp.data && resp.data.results) ? resp.data.results : [];
        for (let idx = 0; idx < data.length; idx++) {
          const r = data[idx];
          const pkgIndex = i + idx;
          const pkgInfo = pkgMap[pkgIndex];
          const vulns = (r && r.vulns) ? r.vulns : [];
          totalVulnerabilities += vulns.length;
          // count severities where available
          for (let vi = 0; vi < vulns.length; vi++) {
            const v = vulns[vi];
            let sev = 'UNKNOWN';
            if (v && v.severity) {
              if (Array.isArray(v.severity) && v.severity.length) sev = v.severity[0];
              else sev = v.severity || 'UNKNOWN';
            }
            bySeverity[sev] = (bySeverity[sev] || 0) + 1;
          }

          if (vulns.length > 0) {
            resultsPerPackage.push({
              package: pkgInfo.package,
              version: pkgInfo.version,
              osvEntries: vulns,
            });
          }
        }
      } catch (err) {
        // network or API error: return a safe empty result but record an error marker
        return {
          summary: {totalVulnerabilities: 0, bySeverity: {}},
          vulnerabilities: [],
          affectedPackages: [],
          error: String(err && err.message ? err.message : err),
        };
      }
    }

    const affectedPackages = resultsPerPackage.map((r) => r.package);
    return {
      summary: {totalVulnerabilities, bySeverity},
      vulnerabilities: resultsPerPackage,
      affectedPackages,
    };
  }

  /**
   * Parse a purl (pkg:) if present or guess the ecosystem and package name.
   * @param {Object} pkg
   * @return {Object}
   */
  parsePurlOrGuess(pkg) {
    let purl = '';
    if (pkg.purl) purl = pkg.purl;
    else if (pkg.PURL) purl = pkg.PURL;
    else if (pkg.externalRefs) {
      const found = pkg.externalRefs.find((r) => {
        return r.reference && String(r.reference).startsWith('pkg:');
      });
      if (found) purl = found.reference;
    }
    if (purl) {
      // basic parse: pkg:<ecosystem>/<name>@<version>
      const m = String(purl).match(/^pkg:([^/]+)\/([^@]+)@?(.*)$/);
      if (m) {
        return {
          ecosystem: m[1],
          name: decodeURIComponent(m[2]),
          version: m[3] || pkg.version || pkg.versionInfo,
        };
      }
    }
    // fallback guesses
    const name = pkg.name || pkg.SPDXID || '';
    const version = pkg.version || pkg.versionInfo || '';
    // try to guess ecosystem from fields
    const manager = pkg.packageManager || pkg.type || '';
    const ecosystem = (manager && String(manager).toLowerCase().includes('npm')) ? 'npm' : 'npm';
    return {ecosystem, name, version, pkgVersion: version};
  }

  /**
   * Convert licenseCount map into a sorted distribution array.
   * @param {Object} licenseCount
  * @return {Array}
   */
  calculateLicenseDistribution(licenseCount) {
    const distribution = [];
    const total = Object.values(licenseCount).reduce((s, c) => s + c, 0) || 1;
    Object.entries(licenseCount)
      .sort((a, b) => b[1] - a[1])
      .forEach(([license, count]) => {
        distribution.push({license, count, percentage: Math.round((count / total) * 100)});
      });
    return distribution;
  }
}

module.exports = SCAPlatformAnalyzer;
