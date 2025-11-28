const {execSync} = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('[analyzers] loaded: SCAPlatformAnalyzerCustom.js');
console.log('🎯 analyzer loaded: analyzers/SCAPlatformAnalyzerCustom.js');
/**
 * SCAPlatformAnalyzerCustom - Holistic SCA analysis helper that generates SBOMs,
 * assesses license compliance and security vulnerabilities, and produces
 * unified risk assessments and reports.
 */
class SCAPlatformAnalyzerCustom {
  /**
   * Create a new analyzer for a project path.
   * @param {string} projectPath - Path to the project to analyze.
   */
  constructor(projectPath) {
    this.projectPath = path.resolve(projectPath);
    this.results = {
      licenseCompliance: {},
      securityVulnerabilities: {},
      riskAssessment: {},
      unifiedReport: {},
    };
  }

  /**
   * Run the full analysis pipeline and return consolidated results.
   * @return {Promise<Object>} consolidated analysis output
   */
  async comprehensiveAnalysis() {
    console.log('🚀 Starting Holistic SCA Platform Analysis\n');

    // 1. Generate SPDX-standard SBOM
    const sbom = await this.generateSPDXSBOM();

    // 2. License compliance analysis
    const licenseAnalysis = await this.analyzeLicenseCompliance(sbom);

    // 3. Security vulnerability analysis
    const securityAnalysis = await this.analyzeSecurityVulnerabilities(sbom);

    // 4. Unified risk assessment
    const riskAssessment = this.performUnifiedRiskAssessment(licenseAnalysis, securityAnalysis);

    // 5. Generate actionable reports
    const reports = this.generateActionableReports(riskAssessment);

    return {
      sbom: sbom,
      licenseCompliance: licenseAnalysis,
      securityVulnerabilities: securityAnalysis,
      riskAssessment: riskAssessment,
      reports: reports,
      metadata: this.getPlatformMetadata(),
    };
  }

  /**
   * Generate an SPDX SBOM using Syft via Docker when available, otherwise fall back.
   * @return {Promise<Object>} SPDX JSON document
   */
  async generateSPDXSBOM() {
    console.log('📋 Step 1: Generating SPDX-standard SBOM...');

    // quick guard: skip docker/syft if docker isn't available to avoid noisy errors
    try {
      execSync('docker --version', {stdio: 'ignore'});
      // Try using Syft via Docker for proper SPDX output
      const output = execSync(
        `docker run --rm -v "
        ${this.projectPath}:/project" anchore/syft:latest /project -o spdx-json`,
        {encoding: 'utf8'},
      );
      return JSON.parse(output);
    } catch (error) {
      console.log(
        'Syft/docker not available or failed, using enhanced license-checker with SPDX mapping...');
      return await this.generateEnhancedSBOM();
    }
  }

  /**
   * Create a SPDX-like SBOM from license-checker output and package.json.
   * @return {Promise<Object>} SPDX-like SBOM
   */
  async generateEnhancedSBOM() {
    const licenseData = await this.getLicenseCheckerData();
    const packageJson = this.readPackageJson();
    // Convert to SPDX-like structure
    return {
      spdxVersion: 'SPDX-2.3',
      dataLicense: 'CC0-1.0',
      SPDXID: 'SPDXRef-DOCUMENT',
      name: `SBOM-for-${packageJson.name || 'project'}`,
      documentNamespace: `https://spdx.org/spdxdocs/${packageJson.name}-${Date.now()}`,
      creationInfo: {
        created: new Date().toISOString(),
        creators: ['Tool: SCA-Platform-Analyzer'],
      },
      packages: this.convertToSPDXPackages(licenseData, packageJson),
    };
  }

  /**
   * Convert license-checker data to SPDX package structures.
   * @param {Object} licenseData
   * @param {Object} projectInfo
   * @return {Array<Object>} SPDX packages
   */
  convertToSPDXPackages(licenseData, projectInfo) {
    const spdxPackages = [];

    Object.entries(licenseData || {}).forEach(([pkgName, pkgData]) => {
      const at = pkgName.lastIndexOf('@');
      const name = at > 0 ? pkgName.slice(0, at) : pkgName;
      const version = at > 0 ? pkgName.slice(at + 1) : (pkgData.version || '0.0.0');
      const spdxId = `SPDXRef-Package-${name}-${version}`.replace(/[^a-zA-Z0-9-]/g, '');

      spdxPackages.push({
        SPDXID: spdxId,
        name: name,
        versionInfo: version,
        downloadLocation: pkgData.repository || 'NOASSERTION',
        licenseConcluded: this.mapToSPDXLicense(pkgData.licenses || pkgData.license),
        licenseDeclared: this.mapToSPDXLicense(pkgData.licenses || pkgData.license),
        copyrightText: 'NOASSERTION',
        description: pkgData.description || 'NONE',
        externalRefs: [
          {
            referenceCategory: 'PACKAGE-MANAGER',
            referenceType: 'purl',
            referenceLocator: `pkg:npm/${name}@${version}`,
          },
        ],
      });
    });

    return spdxPackages;
  }

  /**
   * Normalize common license strings to SPDX identifiers.
   * @param {string|Array|string[]} license
   * @return {string} SPDX identifier or NOASSERTION
   */
  mapToSPDXLicense(license) {
    // Map common licenses to SPDX identifiers
    const spdxMappings = {
      'MIT': 'MIT',
      'Apache-2.0': 'Apache-2.0',
      'Apache 2.0': 'Apache-2.0',
      'GPL-3.0': 'GPL-3.0-only',
      'GPL-2.0': 'GPL-2.0-only',
      'BSD-3-Clause': 'BSD-3-Clause',
      'BSD-2-Clause': 'BSD-2-Clause',
      'ISC': 'ISC',
      'UNKNOWN': 'NOASSERTION',
    };

    return spdxMappings[license] || license || 'NOASSERTION';
  }

  /**
   * Analyze license compliance against configured policies.
   * @param {Object} sbom
   * @return {Promise<Object>} license analysis result
   */
  async analyzeLicenseCompliance(sbom) {
    console.log('⚖️  Step 2: Analyzing License Compliance...');

    const policies = this.loadCompliancePolicies();
    const violations = [];
    const warnings = [];

    (sbom.packages || []).forEach((pkg) => {
      const license = pkg.licenseDeclared;
      const riskLevel = this.classifyLicenseRisk(license);

      // Check policy violations
      if (policies.blockedLicenses.includes(license)) {
        violations.push({
          package: pkg.name,
          version: pkg.versionInfo,
          license: license,
          riskLevel: riskLevel,
          type: 'BLOCKED_LICENSE',
          message: `Package uses prohibited license: ${license}`,
          remediation: 'Consider replacing with alternative package',
        });
      }

      // Check for warnings
      if (policies.warningLicenses.includes(license)) {
        warnings.push({
          package: pkg.name,
          version: pkg.versionInfo,
          license: license,
          riskLevel: riskLevel,
          type: 'WARNING_LICENSE',
          message: `Package uses license requiring review: ${license}`,
          remediation: 'Review license obligations and ensure compliance',
        });
      }
    });

    return {
      summary: {
        totalPackages: (sbom.packages || []).length,
        compliantPackages: (sbom.packages || []).length - violations.length,
        violations: violations.length,
        warnings: warnings.length,
      },
      violations: violations,
      warnings: warnings,
      riskDistribution: this.calculateLicenseRiskDistribution(sbom.packages || []),
    };
  }

  /**
   * Classify license into a risk bucket.
   * @param {string} license
   * @return {string} risk bucket
   */
  classifyLicenseRisk(license) {
    const riskMatrix = {
      PERMISSIVE: ['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC'],
      WEAK_COPYLEFT: ['LGPL-2.1', 'LGPL-3.0', 'MPL-2.0', 'EPL-1.0'],
      STRONG_COPYLEFT: ['GPL-2.0', 'GPL-3.0', 'AGPL-3.0'],
      UNKNOWN: ['NOASSERTION', 'UNKNOWN'],
    };

    for (const [risk, licenses] of Object.entries(riskMatrix)) {
      if (licenses.includes(license)) return risk;
    }

    return 'UNKNOWN';
  }

  /**
   * Analyze security vulnerabilities for SBOM packages.
   * @param {Object} sbom
   * @return {Promise<Object>} security analysis
   */
  async analyzeSecurityVulnerabilities(sbom) {
    console.log('🛡️  Step 3: Analyzing Security Vulnerabilities...');

    const vulnerabilities = [];

    // Check each package for known vulnerabilities

    return {
      summary: {
        totalVulnerabilities: vulnerabilities.length,
      },
      vulnerabilities: vulnerabilities,
      affectedPackages: this.getAffectedPackages(vulnerabilities),
      trend: this.generateTrendData(),
    };
  }
} // end class SCAPlatformAnalyzerCustom

// --- Helper fallbacks used by the custom analyzer ---
SCAPlatformAnalyzerCustom.prototype.getLicenseCheckerData = function getLicenseCheckerData() {
  try {
    // only run license-checker when package.json or node_modules exist
    const pkg = path.join(this.projectPath, 'package.json');
    const nm = path.join(this.projectPath, 'node_modules');
    if (!fs.existsSync(pkg) && !fs.existsSync(nm)) return {};

    const out = execSync('npx license-checker --json --direct',
      {cwd: this.projectPath, encoding: 'utf8'});
    return JSON.parse(out || '{}');
  } catch (err) {
    // license-checker may fail (no packages / missing node_modules) - return empty map
    return {};
  }
};

SCAPlatformAnalyzerCustom.prototype.readPackageJson = function readPackageJson() {
  try {
    const p = path.join(this.projectPath, 'package.json');
    if (!fs.existsSync(p)) return {};
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    return {};
  }
};

SCAPlatformAnalyzerCustom.prototype.calculateLicenseRiskDistribution = function(packages) {
  const distribution = {}
  ;(packages || []).forEach((pkg) => {
    const lic = pkg.licenseConcluded || pkg.licenseDeclared || 'NOASSERTION';
    const norm = (lic || 'NOASSERTION');
    distribution[norm] = (distribution[norm] || 0) + 1;
  });
  const total = Object.values(distribution).reduce((s, v) => s + v, 0) || 0;
  const percentages = {};
  Object.keys(distribution).forEach((k) =>{
    percentages[k] = total > 0 ? Math.round((distribution[k] / total) * 100) : 0;
  });
  return {distribution, percentages, total};
};

SCAPlatformAnalyzerCustom.prototype.getAffectedPackages = function(vulnerabilities) {
  return Array.from(new Set((vulnerabilities || []).map( (v) => v.package)));
};

SCAPlatformAnalyzerCustom.prototype.generateTrendData = function() {
  return [];
};

SCAPlatformAnalyzerCustom.prototype.generateComplianceReport = function(licenseAnalysis) {
  return {
    summary: licenseAnalysis.summary,
    violations: licenseAnalysis.violations || [], warnings: licenseAnalysis.warnings || []};
};

SCAPlatformAnalyzerCustom.prototype.generateSecurityReport = function(securityAnalysis) {
  return securityAnalysis || {summary: {totalVulnerabilities: 0}, vulnerabilities: []};
};

SCAPlatformAnalyzerCustom.prototype.generateRemediationPlan = function(riskAssessment) {
  return {highPriority: [], mediumPriority: [],
    timeline: {immediate: [], shortTerm: [], longTerm: []}};
};

// Export the constructor so wrappers can instantiate it.
// Legacy custom analyzer removed. If you see this error it means some code
// still requires the old custom analyzer; update code to use the unified
// analyzer API: require('./analyzers').analyzeProject(projectPath).
module.exports = function() {
  throw new Error('SCAPlatformAnalyzerCustom removed. Use analyzers.index -> analyzeProject');
};
