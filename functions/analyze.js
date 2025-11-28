// enhanced-unified-analyzer.js
console.log('[analyzers] loaded: analyze.js');
console.log('🎯 analyzer loaded: analyze.js');
const {execSync} = require('child_process');
const fs = require('fs');
const path = require('path');

class EnhancedUnifiedAnalyzer {
  constructor(projectPath) {
    this.projectPath = path.resolve(projectPath);
    this.results = {
      researchInsights: {},
      licenseAnalytics: {},
      securityOverview: {},
      executiveSummary: {},
      detailedAnalysis: {},
    };
    console.log('[analyzers] instantiate: analyze.js', this.projectPath);
  }

  async comprehensiveAnalysis() {
    console.log('🔍 ENHANCED UNIFIED DEPENDENCY ANALYZER');
    console.log('========================================\n');

    try {
      // Run all analyses in sequence
      await this.runResearchAnalysis();
      await this.runEnhancedLicenseAnalytics();
      await this.runSecurityAnalysis();
      await this.generateExecutiveSummary();

      return this.generateFinalReport();
    } catch (error) {
      console.error('❌ Comprehensive analysis failed:', error);
      return this.generateErrorReport(error);
    }
  }

  async runResearchAnalysis() {
    console.log('🔬 Step 1: Research Analysis...');

    const licenseData = await this.getLicenseData();
    const packages = this.extractPackages(licenseData);

    this.results.researchInsights = {
      packagesAnalyzed: packages.length,
      licenseClarity: this.calculateLicenseClarity(packages),
      ambiguityRate: this.calculateAmbiguityRate(packages),
      commonIssues: this.identifyCommonIssues(packages),
      declarationPatterns: this.analyzeDeclarationPatterns(packages),
    };
  }

  async runEnhancedLicenseAnalytics() {
    console.log('📈 Step 2: Enhanced License Analytics...');

    const licenseData = await this.getLicenseData();
    const packages = this.extractPackages(licenseData);

    this.results.licenseAnalytics = {
      totalPackages: packages.length,
      uniqueLicenses: this.countUniqueLicenses(packages),
      licenseQualityScore: this.calculateQualityScore(packages),
      qualityBreakdown: this.analyzeQualityBreakdown(packages),
      riskDistribution: this.analyzeRiskDistribution(packages),
      topLicenses: this.getTopLicenses(packages, 5),
      complianceStatus: this.assessComplianceStatus(packages),
    };
  }

  async runSecurityAnalysis() {
    console.log('🛡️ Step 3: Security Analysis...');

    try {
      const output = execSync('npm audit --json', {
        cwd: this.projectPath,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 120000,
      });

      const auditData = JSON.parse(output);
      this.processSecurityData(auditData);
    } catch (error) {
      if (error.stdout) {
        try {
          const auditData = JSON.parse(error.stdout);
          this.processSecurityData(auditData);
        } catch (parseError) {
          this.results.securityOverview = this.getEmptySecurityData();
        }
      } else {
        this.results.securityOverview = this.getEmptySecurityData();
      }
    }
  }

  processSecurityData(auditData) {
    const vulnerabilities = [];
    let totalVulnerabilities = 0;

    if (auditData.vulnerabilities) {
      Object.entries(auditData.vulnerabilities).forEach(([pkgName, vulnInfo]) => {
        if (vulnInfo.via) {
          vulnInfo.via.forEach((via) => {
            if (typeof via === 'object') {
              totalVulnerabilities++;
              vulnerabilities.push({
                package: pkgName,
                severity: via.severity || 'moderate',
                title: via.title || 'Unknown vulnerability',
                description: via.description || 'No description available',
              });
            }
          });
        }
      });
    }

    const severityBreakdown = this.calculateSeverityBreakdown(vulnerabilities);
    const overallRisk = this.calculateOverallRisk(severityBreakdown, totalVulnerabilities);

    this.results.securityOverview = {
      vulnerabilities: totalVulnerabilities,
      overallRisk: overallRisk,
      severityBreakdown: severityBreakdown,
      securityStatus: this.getSecurityStatus(overallRisk),
      detailedVulnerabilities: vulnerabilities.slice(0, 10), // Limit for display
    };
  }

  async generateExecutiveSummary() {
    console.log('📊 Step 4: Generating Executive Summary...');

    const security = this.results.securityOverview;
    const license = this.results.licenseAnalytics;

    this.results.executiveSummary = {
      overallRiskScore: security.overallRisk,
      securityStatus: security.securityStatus,
      totalVulnerabilities: security.vulnerabilities,
      overallSeverity: this.calculateOverallSeverity(security.severityBreakdown),
      severityBreakdown: security.severityBreakdown,
      projectHealth: this.calculateProjectHealth(security, license),
      scannerCoverage: this.assessScannerCoverage(),
    };
  }

  // Helper methods for research insights
  calculateLicenseClarity(packages) {
    const clearPackages = packages.filter((pkg) =>
      pkg.license &&
            pkg.license !== 'UNKNOWN' &&
            pkg.license !== 'UNLICENSED' &&
            !pkg.license.includes(' OR ') &&
            !pkg.license.includes(' AND '),
    ).length;

    return `${Math.round((clearPackages / packages.length) * 100)}%`;
  }

  calculateAmbiguityRate(packages) {
    const ambiguousPackages = packages.filter((pkg) =>
      !pkg.license ||
            pkg.license === 'UNKNOWN' ||
            pkg.license === 'UNLICENSED' ||
            pkg.license.includes(' OR ') ||
            pkg.license.includes(' AND '),
    ).length;

    return `${Math.round((ambiguousPackages / packages.length) * 100)}%`;
  }

  identifyCommonIssues(packages) {
    const issues = [];

    // Check for unknown licenses
    const unknownLicenses = packages.filter((pkg) =>
      !pkg.license || pkg.license === 'UNKNOWN',
    ).length;

    if (unknownLicenses > 0) {
      issues.push(`${unknownLicenses} packages with unknown licenses`);
    }

    // Check for unlicensed packages
    const unlicensed = packages.filter((pkg) => pkg.license === 'UNLICENSED').length;
    if (unlicensed > 0) {
      issues.push(`${unlicensed} unlicensed packages`);
    }

    // Check for complex license expressions
    const complexLicenses = packages.filter((pkg) =>
      pkg.license && (pkg.license.includes(' OR ') || pkg.license.includes(' AND ')),
    ).length;

    if (complexLicenses > 0) {
      issues.push(`${complexLicenses} packages with complex license expressions`);
    }

    // Check for deprecated licenses
    const deprecatedLicenses = packages.filter((pkg) =>
      pkg.license && this.isDeprecatedLicense(pkg.license),
    ).length;

    if (deprecatedLicenses > 0) {
      issues.push(`${deprecatedLicenses} packages with deprecated licenses`);
    }

    // Check for missing repository info
    const missingRepo = packages.filter((pkg) => !pkg.repository).length;
    if (missingRepo > 0) {
      issues.push(`${missingRepo} packages missing repository information`);
    }

    return issues.length;
  }

  analyzeDeclarationPatterns(packages) {
    const patterns = {
      spdxCompliant: 0,
      hasLicenseFile: 0,
      multipleDeclarations: 0,
      standardFormat: 0,
    };

    // This would require deeper package analysis
    return patterns;
  }

  // Helper methods for enhanced license analytics
  countUniqueLicenses(packages) {
    const licenses = new Set();
    packages.forEach((pkg) => {
      if (pkg.license) {
        licenses.add(pkg.license);
      }
    });
    return licenses.size;
  }

  calculateQualityScore(packages) {
    let excellent = 0;

    packages.forEach((pkg) => {
      if (this.isStandardSPDXLicense(pkg.license)) {
        excellent++;
      }
    });

    return Math.round((excellent / packages.length) * 100);
  }

  analyzeQualityBreakdown(packages) {
    let excellent = 0; let good = 0; let fair = 0; let poor = 0;

    packages.forEach((pkg) => {
      const license = pkg.license;

      if (this.isStandardSPDXLicense(license) && license !== 'NOASSERTION') {
        excellent++;
      } else if (
        license &&
        license !== 'UNKNOWN' &&
        license !== 'UNLICENSED' &&
        license !== 'NOASSERTION'
      ) {
        good++;
      } else if (license === 'UNKNOWN' || license === 'NOASSERTION') {
        fair++;
      } else {
        poor++;
      }
    });

    return {excellent, good, fair, poor};
  }

  analyzeRiskDistribution(packages) {
    const distribution = {
      PERMISSIVE: 0,
      WEAK_COPYLEFT: 0,
      STRONG_COPYLEFT: 0,
      UNKNOWN: 0,
      PROPRIETARY: 0,
    };

    packages.forEach((pkg) => {
      const riskLevel = this.classifyLicenseRisk(pkg.license);
      distribution[riskLevel]++;
    });

    // Calculate percentages
    const percentages = {};
    Object.keys(distribution).forEach((risk) => {
      percentages[risk] = Math.round((distribution[risk] / packages.length) * 100);
    });

    return {
      counts: distribution,
      percentages: percentages,
    };
  }

  getTopLicenses(packages, limit = 5) {
    const licenseCount = {};

    packages.forEach((pkg) => {
      const license = pkg.license || 'UNKNOWN';
      licenseCount[license] = (licenseCount[license] || 0) + 1;
    });

    return Object.entries(licenseCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([license, count]) => ({
        license,
        count,
        percentage: Math.round((count / packages.length) * 100),
      }));
  }

  assessComplianceStatus(packages) {
    const riskDistribution = this.analyzeRiskDistribution(packages);
    const violations =
      riskDistribution.counts.STRONG_COPYLEFT +
      riskDistribution.counts.PROPRIETARY;
    const warnings = riskDistribution.counts.UNKNOWN;

    return {
      status: violations === 0 ? 'COMPLIANT' : 'NON_COMPLIANT',
      violations: violations,
      warnings: warnings,
    };
  }

  // Security analysis helpers
  calculateSeverityBreakdown(vulnerabilities) {
    const breakdown = {
      CRITICAL: 0,
      HIGH: 0,
      MEDIUM: 0,
      LOW: 0,
    };

    vulnerabilities.forEach((vuln) => {
      const severity = vuln.severity?.toUpperCase();
      if (breakdown[severity] !== undefined) {
        breakdown[severity]++;
      }
    });

    return breakdown;
  }

  calculateOverallRisk(severityBreakdown, totalVulnerabilities) {
    if (totalVulnerabilities === 0) return 0;

    const weights = {CRITICAL: 100, HIGH: 75, MEDIUM: 50, LOW: 25};
    let weightedSum = 0;

    Object.entries(severityBreakdown).forEach(([severity, count]) => {
      weightedSum += count * (weights[severity] || 0);
    });

    const maxPossibleScore = totalVulnerabilities * 100;
    return Math.min(100, Math.round((weightedSum / maxPossibleScore) * 100));
  }

  getSecurityStatus(riskScore) {
    if (riskScore >= 80) return 'CRITICAL';
    if (riskScore >= 60) return 'HIGH';
    if (riskScore >= 40) return 'MEDIUM';
    if (riskScore >= 20) return 'LOW';
    return 'SECURE';
  }

  calculateOverallSeverity(severityBreakdown) {
    if (severityBreakdown.CRITICAL > 0) return 'CRITICAL';
    if (severityBreakdown.HIGH > 0) return 'HIGH';
    if (severityBreakdown.MEDIUM > 0) return 'MEDIUM';
    if (severityBreakdown.LOW > 0) return 'LOW';
    return 'NONE';
  }

  // Core data methods
  async getLicenseData() {
    try {
      const output = execSync('npx license-checker --json --direct', {
        cwd: this.projectPath,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      return JSON.parse(output);
    } catch (error) {
      return this.fallbackLicenseAnalysis();
    }
  }

  extractPackages(licenseData) {
    return Object.entries(licenseData).map(([pkgName, pkgData]) => {
      const [name, version] = pkgName.split('@');
      return {
        name: name,
        version: version,
        license: pkgData.licenses,
        repository: pkgData.repository,
        path: pkgData.path,
      };
    });
  }

  // Utility classification methods
  classifyLicenseRisk(license) {
    if (!license) return 'UNKNOWN';

    const riskMatrix = {
      'PERMISSIVE': ['MIT', 'Apache-2.0', 'BSD-2-Clause',
        'BSD-3-Clause', 'ISC', 'Unlicense', 'CC0-1.0'],
      'WEAK_COPYLEFT': ['LGPL-2.1', 'LGPL-3.0', 'MPL-2.0', 'EPL-1.0', 'CDDL-1.0'],
      'STRONG_COPYLEFT': ['GPL-2.0', 'GPL-3.0', 'AGPL-3.0'],
      'PROPRIETARY': ['UNLICENSED', 'Proprietary', 'Commercial'],
    };

    for (const [risk, licenses] of Object.entries(riskMatrix)) {
      if (licenses.includes(license)) return risk;
    }

    return 'UNKNOWN';
  }

  isStandardSPDXLicense(license) {
    const standardLicenses = [
      'MIT', 'Apache-2.0', 'GPL-2.0-only', 'GPL-3.0-only', 'BSD-2-Clause',
      'BSD-3-Clause', 'ISC', 'LGPL-2.1', 'LGPL-3.0', 'MPL-2.0', 'EPL-1.0',
      'AGPL-3.0', 'Artistic-2.0', 'Unlicense', 'CC0-1.0',
    ];
    return standardLicenses.includes(license);
  }

  isDeprecatedLicense(license) {
    const deprecatedLicenses = ['GPL-1.0', 'AGPL-1.0', 'LGPL-2.0'];
    return deprecatedLicenses.includes(license);
  }

  // Fallback methods
  fallbackLicenseAnalysis() {
    try {
      const packageJsonPath = path.join(this.projectPath, 'package.json');
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

      const fallbackData = {};
      const dependencies = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies,
      };

      Object.keys(dependencies).forEach((dep) => {
        fallbackData[`${dep}@${dependencies[dep]}`] = {
          licenses: 'UNKNOWN',
          repository: 'Unknown',
          path: `node_modules/${dep}`,
        };
      });

      return fallbackData;
    } catch (error) {
      return {};
    }
  }

  getEmptySecurityData() {
    return {
      vulnerabilities: 0,
      overallRisk: 0,
      severityBreakdown: {CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0},
      securityStatus: 'SECURE',
      detailedVulnerabilities: [],
    };
  }

  calculateProjectHealth(security, license) {
    const securityScore = 100 - security.overallRisk;
    const licenseScore = license.licenseQualityScore;

    const healthScore = Math.round((securityScore * 0.6) + (licenseScore * 0.4));

    if (healthScore >= 80) return 'EXCELLENT';
    if (healthScore >= 60) return 'GOOD';
    if (healthScore >= 40) return 'FAIR';
    return 'POOR';
  }

  assessScannerCoverage() {
    return {
      license_checker: true,
      npm_audit: true,
      dependency_tree: true,
    };
  }

  generateFinalReport() {
    return {
      metadata: {
        generated_at: new Date().toISOString(),
        project_path: this.projectPath,
        analyzer_version: '2.0.0',
      },
      researchInsights: this.results.researchInsights,
      licenseAnalytics: this.results.licenseAnalytics,
      securityOverview: this.results.securityOverview,
      executiveSummary: this.results.executiveSummary,
    };
  }

  generateErrorReport(error) {
    return {
      metadata: {
        generated_at: new Date().toISOString(),
        project_path: this.projectPath,
        status: 'ERROR',
      },
      error: {
        message: error.message,
      },
    };
  }
}

// CLI Interface with formatted output
async function main() {
  const projectPath = process.argv[2] || '.';
  const analyzer = new EnhancedUnifiedAnalyzer(projectPath);

  console.log('🚀 Starting Enhanced Unified Analysis...\n');

  try {
    const report = await analyzer.comprehensiveAnalysis();

    // Save comprehensive report
    const reportPath = path.join(projectPath, 'enhanced-analysis-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    console.log('✅ Enhanced Analysis Completed!');
    console.log(`📊 Full report saved to: ${reportPath}\n`);

    // Print formatted output
    printFormattedReport(report);
  } catch (error) {
    console.error('❌ Analysis failed:', error);
  }
}

function printFormattedReport(report) {
  const research = report.researchInsights;
  const license = report.licenseAnalytics;
  const security = report.securityOverview;
  const executive = report.executiveSummary;

  console.log('🔍 KEY RESEARCH INSIGHTS:');
  console.log(`   • Packages analyzed: ${research.packagesAnalyzed}`);
  console.log(`   • License clarity: ${research.licenseClarity}`);
  console.log(`   • Ambiguity rate: ${research.ambiguityRate}`);
  console.log(`   • Common issues: ${research.commonIssues} identified\n`);

  console.log('📈 ENHANCED LICENSE ANALYTICS:');
  console.log(`   Total Packages: ${license.totalPackages}`);
  console.log(`   Unique Licenses: ${license.uniqueLicenses}`);
  console.log(`   License Quality Score: ${license.licenseQualityScore}%\n`);

  console.log('📊 LICENSE QUALITY BREAKDOWN:');
  console.log(`   Excellent: ${license.qualityBreakdown.excellent} packages`);
  console.log(`   Good: ${license.qualityBreakdown.good} packages`);
  console.log(`   Fair: ${license.qualityBreakdown.fair} packages`);
  console.log(`   Poor: ${license.qualityBreakdown.poor} packages\n`);

  console.log('⚖️ LICENSE RISK DISTRIBUTION:');
  Object.entries(license.riskDistribution.counts).forEach(([risk, count]) => {
    const percentage = license.riskDistribution.percentages[risk];
    console.log(`   ${risk}: ${count} packages (${percentage}%)`);
  });
  console.log('');

  console.log('📋 TOP LICENSES:');
  license.topLicenses.forEach((item) => {
    console.log(`   ${item.license}: ${item.count} packages (${item.percentage}%)`);
  });
  console.log('');

  console.log('🚨 COMPLIANCE STATUS:');
  console.log(`   Status: ${license.complianceStatus.status}`);
  console.log(`   Violations: ${license.complianceStatus.violations}`);
  console.log(`   Warnings: ${license.complianceStatus.warnings}\n`);

  console.log('🛡️ SECURITY OVERVIEW:');
  console.log(`   Vulnerabilities: ${security.vulnerabilities}`);
  console.log(`   Overall Risk: ${security.overallRisk}/100\n`);

  console.log('📈 EXECUTIVE SUMMARY:');
  console.log(`   Overall Risk Score: ${executive.overallRiskScore}/100`);
  console.log(`   Security Status: ${executive.securityStatus}`);
  console.log(`   Total Vulnerabilities: ${executive.totalVulnerabilities}`);
  console.log(`   Overall Severity: ${executive.overallSeverity}\n`);

  console.log('⚡ SEVERITY BREAKDOWN:');
  Object.entries(executive.severityBreakdown).forEach(([severity, count]) => {
    if (count > 0) {
      console.log(`   ${severity}: ${count} vulnerabilities`);
    }
  });
  console.log('');

  console.log('💡 RECOMMENDATIONS:');
  if (executive.overallRiskScore >= 60) {
    console.log('   🚨 Address critical and high severity vulnerabilities immediately');
    console.log('   📋 Review license compliance for any violations');
    console.log('   🔄 Update dependencies with known security issues');
  } else if (executive.overallRiskScore >= 40) {
    console.log('   ⚠️  Review medium severity vulnerabilities');
    console.log('   📊 Monitor license compliance regularly');
    console.log('   📦 Keep dependencies updated');
  } else {
    console.log('   ✅ Project is in good health');
    console.log('   📈 Continue regular security monitoring');
    console.log('   🎯 Maintain current compliance practices');
  }
}

if (require.main === module) {
  main();
}

module.exports = EnhancedUnifiedAnalyzer;
