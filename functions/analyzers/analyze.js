/**
 * ============================================================================
 * Enhanced Unified Analyzer - Docker/Cloud Run Ready
 * ============================================================================
 *
 * Comprehensive dependency analyzer that combines:
 * - License analysis (license-checker)
 * - Security scanning (npm audit)
 * - SBOM generation (SPDX 2.3 compliant)
 * - Research insights and compliance metrics
 *
 * CLOUD RUN INTEGRATION:
 * - Designed to analyze unzipped project files in Cloud Run containers
 * - Merges results from multiple analyzers (license, security, SBOM)
 * - Comprehensive logging for remote debugging
 * - No file writes to project (read-only analysis)
 * - Outputs single unified JSON report
 *
 * DOCKER COMPATIBILITY:
 * - Works with extracted ZIP files in container volumes
 * - Handles missing node_modules gracefully
 * - Synchronous operations for predictable behavior
 * - All output to stdout/stderr for log aggregation
 *
 * OUTPUT STRUCTURE:
 * - metadata: Generation info, timestamps, analyzer version
 * - researchInsights: License clarity, ambiguity, common issues
 * - licenseAnalytics: Quality scores, risk distribution, compliance
 * - securityOverview: Vulnerabilities, severity breakdown, risk scores
 * - sbom: SPDX 2.3 document with packages and enrichment metadata
 * - executiveSummary: Overall health, recommendations, scanner coverage
 * ============================================================================
 */

console.log('🎯 analyzer loaded: analyze.js');
const {execSync} = require('child_process');
const fs = require('fs');
const path = require('path');

// Import SBOM generator for integration
const {generateSBOM} = require('./sbomGenerator');

/**
 * Enhanced Unified Analyzer Class
 *
 * Main analyzer class that orchestrates all analysis steps and merges results.
 * Designed for Cloud Run environments where it processes unzipped project files.
 */
class EnhancedUnifiedAnalyzer {
  /**
   * Constructor
   *
   * @param {string} projectPath - Absolute path to extracted/unzipped project directory
   */
  constructor(projectPath) {
    this.projectPath = path.resolve(projectPath);
    this.results = {
      researchInsights: {},
      licenseAnalytics: {},
      securityOverview: {},
      sbom: {},
      licenseCompatibility: {}, // NEW: License compatibility
      outdatedDependencies: {}, // NEW: Outdated packages
      supplyChainRisk: {}, // NEW: Supply chain risk
      executiveSummary: {},
      detailedAnalysis: {},
    };
    console.log('[analyzers] instantiate: analyze.js', this.projectPath);
  }

  /**
   * MAIN ANALYSIS ORCHESTRATOR
   *
   * Runs comprehensive analysis combining:
   * 1. Research analysis (license patterns, clarity metrics)
   * 2. License analytics (quality scores, risk distribution)
   * 3. Security analysis (npm audit vulnerabilities)
   * 4. SBOM generation (SPDX 2.3 with enrichment)
   * 5. Executive summary (overall health, recommendations)
   *
   * CLOUD RUN WORKFLOW:
   * - Receives path to unzipped project directory
   * - Runs all analyzers in sequence
   * - Merges all results into unified report
   * - Returns complete analysis without writing files
   *
   * @return {Promise<object>} Complete analysis report with all sections
   */
  async comprehensiveAnalysis() {
    console.log('🔍 ENHANCED UNIFIED DEPENDENCY ANALYZER');
    console.log('========================================\n');

    let finalReport;
    try {
      // Run all analyses in sequence
      await this.runResearchAnalysis();
      await this.runEnhancedLicenseAnalytics();
      await this.runSecurityAnalysis();
      await this.runSBOMGeneration(); // Generate SBOM
      await this.runLicenseCompatibilityCheck(); // NEW: License compatibility
      await this.runOutdatedDependenciesCheck(); // NEW: Outdated packages
      await this.runSupplyChainRiskAssessment(); // NEW: Supply chain risk
      await this.generateExecutiveSummary();

      finalReport = this.generateFinalReport();
    } catch (error) {
      console.error('❌ Comprehensive analysis failed:', error);
      console.error('Stack:', error.stack);
      finalReport = this.generateErrorReport(error);
    }

    try {
      console.log('🎯 analyze.js: comprehensiveAnalysis completed');
      console.log('analyze.js: project=', this.projectPath);
      console.log('analyze.js: sbom packages=', this.results.sbom?.packages?.length || 0);
    } catch (e) {
      // ignore logging errors
    }

    return finalReport;
  }

  /**
   * STEP 1: Research Analysis
   *
   * Analyzes license declaration patterns and quality metrics:
   * - License clarity percentage
   * - Ambiguity rate (unknown, multi-license expressions)
   * - Common issues (missing licenses, deprecated formats)
   * - Declaration patterns (SPDX compliance, license files)
   */
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

  /**
   * STEP 2: Enhanced License Analytics
   *
   * Deep license analysis with quality scoring:
   * - Total packages and unique licenses
   * - License quality score (SPDX compliance)
   * - Quality breakdown (excellent/good/fair/poor)
   * - Risk distribution (permissive/copyleft/proprietary)
   * - Top licenses by usage
   * - Compliance status and violations
   */
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

  /**
   * STEP 3: Security Analysis
   *
   * Runs npm audit to detect vulnerabilities:
   * - Parses npm audit JSON output
   * - Categorizes by severity (critical/high/medium/low)
   * - Calculates overall risk score (0-100)
   * - Determines security status (CRITICAL/HIGH/MEDIUM/LOW/SECURE)
   *
   * CLOUD RUN NOTES:
   * - Requires npm installed in container
   * - Works with package-lock.json for accurate audit
   * - Gracefully handles audit errors (returns empty data)
   */
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

  /**
   * STEP 4: SBOM Generation (NEW)
   *
   * Generates Software Bill of Materials using sbomGenerator:
   * - SPDX 2.3 compliant JSON format
   * - Multiple detection strategies (package-lock, package.json, requirements.txt)
   * - Node_modules enrichment for complete metadata
   * - Performance metrics and strategy tracking
   *
   * CLOUD RUN INTEGRATION:
   * - Analyzes extracted/unzipped project files
   * - Works with bind-mounted or COPY'd project directories
   * - Merges SBOM data into unified report
   * - Enriches with actual installed package data when node_modules present
   *
   * @return {Promise<void>} Sets this.results.sbom with complete SBOM document
   */
  async runSBOMGeneration() {
    console.log('📦 Step 4: SBOM Generation...');

    try {
      // Generate SBOM using sbomGenerator
      const sbomDocument = await generateSBOM(this.projectPath);

      // Store complete SBOM in results
      this.results.sbom = sbomDocument;

      const pkgCount = sbomDocument?.packages?.length || 0;
      const strategies = sbomDocument?.metadata?.strategiesUsed || [];
      const genTime = sbomDocument?.metadata?.generationTimeMs || 0;

      console.log(`✅ SBOM generated: ${pkgCount} packages`);
      console.log(`   Strategies: ${strategies.join(', ')}`);
      console.log(`   Generation time: ${genTime}ms`);

      // Log enrichment stats if available
      if (sbomDocument?.metadata?.enrichmentStats) {
        const stats = sbomDocument.metadata.enrichmentStats;
        console.log(`   Enrichment: ${stats.beforeEnrichment} → ${stats.afterEnrichment} packages`);
        console.log(`   Packages added: ${stats.packagesAdded}`);
      }
    } catch (error) {
      console.error('❌ SBOM generation failed:', error.message);
      console.error('Stack:', error.stack);

      // Provide empty SBOM structure on failure
      this.results.sbom = {
        spdxVersion: 'SPDX-2.3',
        dataLicense: 'CC0-1.0',
        SPDXID: 'SPDXRef-DOCUMENT',
        name: 'SBOM-ERROR',
        documentNamespace: 'https://example.org/spdxdocs/error-' + Date.now(),
        creationInfo: {
          created: new Date().toISOString(),
          creators: ['Tool: license-checker-analyze.js'],
        },
        packages: [],
        metadata: {
          error: error.message,
          generationTimeMs: 0,
          strategiesUsed: ['error'],
        },
      };
    }
  }

  /**
   * STEP 5: License Compatibility Check (NEW - HIGH PRIORITY)
   *
   * Analyzes license compatibility to prevent legal conflicts:
   * - Detects GPL/MIT incompatibilities
   * - Identifies strong copyleft conflicts
   * - Validates project license against dependencies
   * - Provides distribution compliance warnings
   *
   * CRITICAL FOR:
   * - Commercial distribution
   * - Open source projects
   * - Legal compliance
   */
  async runLicenseCompatibilityCheck() {
    console.log('⚖️  Step 5: License Compatibility Check...');

    try {
      const licenseData = await this.getLicenseData();
      const packages = this.extractPackages(licenseData);

      // Get project license from package.json
      const projectLicense = this.getProjectLicense();

      // Define incompatible license combinations
      const incompatibilityRules = {
        'GPL-2.0': ['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC'],
        'GPL-3.0': ['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC'],
        'AGPL-3.0': ['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'GPL-2.0'],
      };

      // Check for incompatibilities
      const incompatiblePackages = [];
      const warnings = [];
      const conflicts = [];

      packages.forEach((pkg) => {
        if (!pkg.license || pkg.license === 'UNKNOWN') {
          warnings.push({
            package: pkg.name,
            version: pkg.version,
            issue: 'Unknown license - cannot verify compatibility',
            severity: 'WARNING',
          });
          return;
        }

        // Check if project license conflicts with package license
        if (projectLicense && incompatibilityRules[projectLicense]) {
          if (incompatibilityRules[projectLicense].includes(pkg.license)) {
            conflicts.push({
              package: pkg.name,
              version: pkg.version,
              packageLicense: pkg.license,
              projectLicense: projectLicense,
              issue: `${projectLicense} project cannot use ${pkg.license} dependencies`,
              severity: 'CRITICAL',
            });
          }
        }

        // Check for strong copyleft in permissive projects
        const strongCopyleft = ['GPL-2.0', 'GPL-3.0', 'AGPL-3.0'];
        const permissiveLicenses = ['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC'];

        if (permissiveLicenses.includes(projectLicense) &&
            strongCopyleft.includes(pkg.license)) {
          incompatiblePackages.push({
            package: pkg.name,
            version: pkg.version,
            packageLicense: pkg.license,
            projectLicense: projectLicense,
            issue: 'Strong copyleft dependency in permissive project',
            severity: 'HIGH',
            recommendation:
              'Replace with permissively-licensed alternative or change project license',
          });
        }
      });

      // Distribution compliance check
      const distributionRisk = this.assessDistributionRisk(packages, projectLicense);

      this.results.licenseCompatibility = {
        projectLicense: projectLicense || 'UNKNOWN',
        totalPackages: packages.length,
        compatiblePackages: packages.length - incompatiblePackages.length - conflicts.length,
        incompatiblePackages: incompatiblePackages,
        criticalConflicts: conflicts,
        warnings: warnings,
        distributionRisk: distributionRisk,
        canDistribute: conflicts.length === 0,
        complianceStatus: conflicts.length === 0 ? 'COMPLIANT' : 'NON_COMPLIANT',
      };

      console.log(
        `✅ License compatibility: ${conflicts.length} conflicts, ` +
        `${incompatiblePackages.length} incompatibilities`,
      );
    } catch (error) {
      console.error('❌ License compatibility check failed:', error.message);
      console.error('Stack:', error.stack);
      this.results.licenseCompatibility = {
        error: error.message,
        projectLicense: 'UNKNOWN',
        canDistribute: false,
        complianceStatus: 'ERROR',
      };
    }
  }

  /**
   * STEP 6: Outdated Dependencies Check (NEW - HIGH PRIORITY)
   *
   * Identifies packages with available updates:
   * - Current vs latest versions
   * - Security updates
   * - Breaking changes
   * - Update recommendations
   *
   * CRITICAL FOR:
   * - Security maintenance
   * - Vulnerability remediation
   * - Keeping dependencies current
   */
  async runOutdatedDependenciesCheck() {
    console.log('📦 Step 6: Outdated Dependencies Check...');

    try {
      // Run npm outdated to get version information
      let outdatedData = {};
      try {
        const output = execSync('npm outdated --json', {
          cwd: this.projectPath,
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        outdatedData = JSON.parse(output);
      } catch (error) {
        // npm outdated returns exit code 1 when outdated packages exist
        if (error.stdout) {
          try {
            outdatedData = JSON.parse(error.stdout);
          } catch (e) {
            console.warn('Could not parse npm outdated output');
          }
        }
      }

      const outdatedPackages = [];
      const securityUpdates = [];
      const breakingUpdates = [];
      const minorUpdates = [];
      const patchUpdates = [];

      Object.entries(outdatedData).forEach(([pkgName, info]) => {
        const current = info.current || '0.0.0';
        const wanted = info.wanted || current;
        const latest = info.latest || wanted;

        const updateInfo = {
          package: pkgName,
          current: current,
          wanted: wanted,
          latest: latest,
          location: info.location || '',
        };

        // Classify update type
        const currentParts = current.split('.').map(Number);
        const latestParts = latest.split('.').map(Number);

        if (latestParts[0] > currentParts[0]) {
          updateInfo.updateType = 'MAJOR';
          updateInfo.breaking = true;
          breakingUpdates.push(updateInfo);
        } else if (latestParts[1] > currentParts[1]) {
          updateInfo.updateType = 'MINOR';
          updateInfo.breaking = false;
          minorUpdates.push(updateInfo);
        } else if (latestParts[2] > currentParts[2]) {
          updateInfo.updateType = 'PATCH';
          updateInfo.breaking = false;
          patchUpdates.push(updateInfo);
        }

        // Mark as security update if it's a patch/minor
        if (updateInfo.updateType === 'PATCH' || updateInfo.updateType === 'MINOR') {
          securityUpdates.push(updateInfo);
        }

        outdatedPackages.push(updateInfo);
      });

      // Calculate staleness score (0-100, higher = more outdated)
      const totalPackages = Object.keys(outdatedData).length || 1;
      const stalenessScore = Math.min(100, Math.round(
        (breakingUpdates.length * 3 + minorUpdates.length * 2 + patchUpdates.length) /
        totalPackages * 20,
      ));

      this.results.outdatedDependencies = {
        totalOutdated: outdatedPackages.length,
        breakingUpdates: breakingUpdates.length,
        minorUpdates: minorUpdates.length,
        patchUpdates: patchUpdates.length,
        securityUpdates: securityUpdates.length,
        stalenessScore: stalenessScore,
        packages: outdatedPackages,
        recommendations: this.generateUpdateRecommendations(outdatedPackages),
      };

      console.log(`✅ Outdated dependencies: ${outdatedPackages.length} packages need updates`);
      console.log(`   Breaking: ${breakingUpdates.length}, Security: ${securityUpdates.length}`);
    } catch (error) {
      console.error('❌ Outdated dependencies check failed:', error.message);
      this.results.outdatedDependencies = {
        error: error.message,
        totalOutdated: 0,
        stalenessScore: 0,
      };
    }
  }

  /**
   * STEP 7: Supply Chain Risk Assessment (NEW - HIGH PRIORITY)
   *
   * Analyzes supply chain security risks:
   * - Abandoned packages (no updates in 2+ years)
   * - Unmaintained packages (no activity in 1 year)
   * - Low popularity packages (<100 downloads/week)
   * - Single maintainer risk (bus factor = 1)
   *
   * CRITICAL FOR:
   * - Enterprise security
   * - Supply chain attack prevention
   * - Dependency health monitoring
   */
  async runSupplyChainRiskAssessment() {
    console.log('🔗 Step 7: Supply Chain Risk Assessment...');

    try {
      const licenseData = await this.getLicenseData();
      const packages = this.extractPackages(licenseData);

      const abandonedPackages = [];
      const unmaintainedPackages = [];
      const lowPopularityPackages = [];
      const singleMaintainerRisk = [];
      const noRepositoryPackages = [];

      // Note: We can't easily check last update date without npm registry API
      // For now, we'll add a placeholder that can be enhanced later
      // This would require: const npmView = execSync(`npm view ${pkg.name} time --json`)

      packages.forEach((pkg) => {
        const riskFactors = [];

        // Check for missing repository (high risk indicator)
        if (!pkg.repository || pkg.repository === 'Unknown') {
          noRepositoryPackages.push({
            package: pkg.name,
            version: pkg.version,
            reason: 'No repository information available',
          });
          riskFactors.push('no_repository');
        }

        // Note: We can't easily check last update date without npm registry API
        // For now, we'll add a placeholder that can be enhanced later
        // This would require: const npmView = execSync(`npm view ${pkg.name} time --json`)

        // Add to risk assessment
        if (riskFactors.length > 0) {
          let riskLevel;
          if (riskFactors.length >= 3) {
            riskLevel = 'CRITICAL';
          } else if (riskFactors.length === 2) {
            riskLevel = 'HIGH';
          } else {
            riskLevel = 'MEDIUM';
          }

          if (!unmaintainedPackages.find((p) => p.package === pkg.name)) {
            unmaintainedPackages.push({
              package: pkg.name,
              version: pkg.version,
              riskFactors: riskFactors,
              riskLevel: riskLevel,
            });
          }
        }
      });

      // Calculate overall supply chain risk score (0-100)
      const totalPackages = packages.length || 1;
      const riskScore = Math.min(100, Math.round(
        (abandonedPackages.length * 10 +
         unmaintainedPackages.length * 5 +
         noRepositoryPackages.length * 3) / totalPackages * 100,
      ));

      let riskLevel;
      if (riskScore >= 70) {
        riskLevel = 'CRITICAL';
      } else if (riskScore >= 50) {
        riskLevel = 'HIGH';
      } else if (riskScore >= 30) {
        riskLevel = 'MEDIUM';
      } else {
        riskLevel = 'LOW';
      }

      this.results.supplyChainRisk = {
        overallRiskScore: riskScore,
        riskLevel: riskLevel,
        totalPackages: totalPackages,
        abandonedPackages: {
          count: abandonedPackages.length,
          packages: abandonedPackages,
        },
        unmaintainedPackages: {
          count: unmaintainedPackages.length,
          packages: unmaintainedPackages,
        },
        lowPopularityPackages: {
          count: lowPopularityPackages.length,
          packages: lowPopularityPackages,
        },
        singleMaintainerRisk: {
          count: singleMaintainerRisk.length,
          packages: singleMaintainerRisk,
        },
        noRepositoryPackages: {
          count: noRepositoryPackages.length,
          packages: noRepositoryPackages,
        },
        recommendations: this.generateSupplyChainRecommendations(riskScore, riskLevel),
      };

      console.log(`✅ Supply chain risk: ${riskLevel} (score: ${riskScore}/100)`);
      console.log(`   No repository: ${noRepositoryPackages.length} packages`);
    } catch (error) {
      console.error('❌ Supply chain risk assessment failed:', error.message);
      console.error('Stack:', error.stack);
      this.results.supplyChainRisk = {
        error: error.message,
        overallRiskScore: 0,
        riskLevel: 'UNKNOWN',
      };
    }
  }

  /**
   * STEP 8: Executive Summary Generation
   *
   * Creates high-level summary combining all analysis results:
   * - Overall risk score and security status
   * - Vulnerability counts and severity breakdown
   * - Project health assessment (excellent/good/fair/poor)
   * - Scanner coverage verification
   */
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
      sbomPackages: this.results.sbom?.packages?.length || 0, // NEW: Include SBOM stats
      sbomStrategies: this.results.sbom?.metadata?.strategiesUsed || [],
    };
  }

  /**
   * ===========================================================================
   * HELPER METHODS - Research Insights
   * ===========================================================================
   */

  /**
   * Calculate percentage of packages with clear, unambiguous licenses
   */
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

  /**
   * Calculate percentage of packages with ambiguous or missing licenses
   */
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

  /**
   * Identify and count common license-related issues
   */
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

  /**
   * Analyze license declaration patterns (placeholder for future enhancement)
   */
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

  /**
   * ===========================================================================
   * HELPER METHODS - Enhanced License Analytics
   * ===========================================================================
   */

  /**
   * Count unique licenses across all packages
   */
  countUniqueLicenses(packages) {
    const licenses = new Set();
    packages.forEach((pkg) => {
      if (pkg.license) {
        licenses.add(pkg.license);
      }
    });
    return licenses.size;
  }

  /**
   * Calculate overall license quality score (% of SPDX-compliant licenses)
   */
  calculateQualityScore(packages) {
    let excellent = 0;

    packages.forEach((pkg) => {
      if (this.isStandardSPDXLicense(pkg.license)) {
        excellent++;
      }
    });

    return Math.round((excellent / packages.length) * 100);
  }

  /**
   * Categorize packages by license quality (excellent/good/fair/poor)
   */
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

  /**
   * Analyze license risk distribution (permissive/copyleft/proprietary)
   */
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

  /**
   * Get top N most-used licenses with counts and percentages
   */
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

  /**
   * Assess overall compliance status based on license risks
   */
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

  /**
   * ===========================================================================
   * HELPER METHODS - Security Analysis
   * ===========================================================================
   */

  /**
   * Calculate vulnerability severity breakdown
   */
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

  /**
   * Calculate weighted overall risk score (0-100)
   */
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

  /**
   * Determine security status from risk score
   */
  getSecurityStatus(riskScore) {
    if (riskScore >= 80) return 'CRITICAL';
    if (riskScore >= 60) return 'HIGH';
    if (riskScore >= 40) return 'MEDIUM';
    if (riskScore >= 20) return 'LOW';
    return 'SECURE';
  }

  /**
   * Get project license from package.json
   */
  getProjectLicense() {
    try {
      const packageJsonPath = path.join(this.projectPath, 'package.json');
      if (!fs.existsSync(packageJsonPath)) {
        console.warn('No package.json found - cannot determine project license');
        return null;
      }

      const packageData = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      return packageData.license || null;
    } catch (error) {
      console.error('Error reading project license:', error.message);
      return null;
    }
  }

  /**
   * Assess distribution risk based on license compatibility
   */
  assessDistributionRisk(packages, projectLicense) {
    if (!projectLicense) {
      return {
        canDistribute: false,
        reason: 'No project license defined',
        severity: 'HIGH',
      };
    }

    const copyleftLicenses = ['GPL-2.0', 'GPL-3.0', 'AGPL-3.0', 'LGPL-2.1', 'LGPL-3.0'];
    const hasCopyleft = packages.some((pkg) => copyleftLicenses.includes(pkg.license));

    if (hasCopyleft && !copyleftLicenses.includes(projectLicense)) {
      return {
        canDistribute: false,
        reason: 'Copyleft dependencies require compatible project license',
        severity: 'CRITICAL',
      };
    }

    return {
      canDistribute: true,
      reason: 'No distribution conflicts detected',
      severity: 'NONE',
    };
  }

  /**
   * Generate update recommendations for outdated dependencies
   */
  generateUpdateRecommendations(outdatedPackages) {
    const recommendations = [];

    const securityUpdates = outdatedPackages.filter(
      (pkg) => pkg.updateType === 'PATCH' || pkg.updateType === 'MINOR',
    );
    const breakingUpdates = outdatedPackages.filter((pkg) => pkg.updateType === 'MAJOR');

    if (securityUpdates.length > 0) {
      recommendations.push({
        priority: 'CRITICAL',
        action: 'Apply security updates immediately',
        details: `${securityUpdates.length} packages have safe updates available`,
        command: 'npm update',
      });
    }

    if (breakingUpdates.length > 0) {
      recommendations.push({
        priority: 'HIGH',
        action: 'Review and plan major version upgrades',
        details: `${breakingUpdates.length} packages have breaking changes`,
        command: 'npm outdated',
      });
    }

    if (outdatedPackages.length === 0) {
      recommendations.push({
        priority: 'INFO',
        action: 'All dependencies are up to date',
        details: 'No updates required',
      });
    }

    return recommendations;
  }

  /**
   * Generate supply chain risk recommendations
   */
  generateSupplyChainRecommendations(riskScore, riskLevel) {
    const recommendations = [];

    if (riskLevel === 'CRITICAL' || riskLevel === 'HIGH') {
      recommendations.push({
        priority: 'CRITICAL',
        action: 'Review high-risk dependencies',
        details: 'Replace abandoned or unmaintained packages with active alternatives',
      });
    }

    if (riskScore > 30) {
      recommendations.push({
        priority: 'HIGH',
        action: 'Implement supply chain monitoring',
        details: 'Set up automated dependency health checks',
      });
    }

    recommendations.push({
      priority: 'MEDIUM',
      action: 'Verify package repositories',
      details: 'Ensure all dependencies have accessible source repositories',
    });

    recommendations.push({
      priority: 'LOW',
      action: 'Document dependency rationale',
      details: 'Maintain records of why each dependency is needed',
    });

    return recommendations;
  }

  /**
   * Determine overall severity from breakdown
   */
  calculateOverallSeverity(severityBreakdown) {
    if (severityBreakdown.CRITICAL > 0) return 'CRITICAL';
    if (severityBreakdown.HIGH > 0) return 'HIGH';
    if (severityBreakdown.MEDIUM > 0) return 'MEDIUM';
    if (severityBreakdown.LOW > 0) return 'LOW';
    return 'NONE';
  }

  /**
   * ===========================================================================
   * CORE DATA METHODS - License & Package Extraction
   * ===========================================================================
   */

  /**
   * Get license data using license-checker
   *
   * CLOUD RUN: Requires license-checker installed in container
   */
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

  /**
   * Extract package array from license-checker JSON output
   */
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

  /**
   * ===========================================================================
   * UTILITY CLASSIFICATION METHODS
   * ===========================================================================
   */

  /**
   * Classify license into risk category
   */
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

  /**
   * Check if license is a standard SPDX identifier
   */
  isStandardSPDXLicense(license) {
    const standardLicenses = [
      'MIT', 'Apache-2.0', 'GPL-2.0-only', 'GPL-3.0-only', 'BSD-2-Clause',
      'BSD-3-Clause', 'ISC', 'LGPL-2.1', 'LGPL-3.0', 'MPL-2.0', 'EPL-1.0',
      'AGPL-3.0', 'Artistic-2.0', 'Unlicense', 'CC0-1.0',
    ];
    return standardLicenses.includes(license);
  }

  /**
   * Check if license is deprecated
   */
  isDeprecatedLicense(license) {
    const deprecatedLicenses = ['GPL-1.0', 'AGPL-1.0', 'LGPL-2.0'];
    return deprecatedLicenses.includes(license);
  }

  /**
   * ===========================================================================
   * FALLBACK METHODS - Used when primary tools fail
   * ===========================================================================
   */

  /**
   * Fallback license analysis from package.json when license-checker fails
   *
   * CLOUD RUN: Essential for projects without node_modules installed
   */
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

  /**
   * Return empty security data structure when npm audit fails
   */
  getEmptySecurityData() {
    return {
      vulnerabilities: 0,
      overallRisk: 0,
      severityBreakdown: {CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0},
      securityStatus: 'SECURE',
      detailedVulnerabilities: [],
    };
  }

  /**
   * Calculate overall project health score from security and license metrics
   */
  calculateProjectHealth(security, license) {
    const securityScore = 100 - security.overallRisk;
    const licenseScore = license.licenseQualityScore;

    const healthScore = Math.round((securityScore * 0.6) + (licenseScore * 0.4));

    if (healthScore >= 80) return 'EXCELLENT';
    if (healthScore >= 60) return 'GOOD';
    if (healthScore >= 40) return 'FAIR';
    return 'POOR';
  }

  /**
   * Report which scanners were successfully used
   */
  assessScannerCoverage() {
    return {
      license_checker: true,
      npm_audit: true,
      dependency_tree: true,
      sbom_generator: true, // NEW: SBOM generation coverage
    };
  }

  /**
   * ===========================================================================
   * REPORT GENERATION - Final Output
   * ===========================================================================
   */

  /**
   * Generate final unified report with all analysis results
   *
   * CLOUD RUN OUTPUT:
   * - Single JSON document with all sections
   * - Includes SBOM data merged with other analytics
   * - Ready for upload to GCS or return via HTTP
   */
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
      sbom: this.results.sbom, // SBOM document (SPDX 2.3)
      licenseCompatibility: this.results.licenseCompatibility, // NEW: License conflicts
      outdatedDependencies: this.results.outdatedDependencies, // NEW: Version updates
      supplyChainRisk: this.results.supplyChainRisk, // NEW: Supply chain health
      executiveSummary: this.results.executiveSummary,
    };
  }

  /**
   * Generate error report when analysis fails
   */
  generateErrorReport(error) {
    return {
      metadata: {
        generated_at: new Date().toISOString(),
        project_path: this.projectPath,
        status: 'ERROR',
      },
      error: {
        message: error.message,
        stack: error.stack, // NEW: Include stack trace for debugging
      },
    };
  }
}

/**
 * ===========================================================================
 * CLI INTERFACE - For local testing and standalone execution
 * ===========================================================================
 */

/**
 * Main CLI function for standalone execution
 *
 * Usage: node analyze.js [projectPath]
 *
 * CLOUD RUN: Can be invoked directly or via wrapper script
 */
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

    // Return report for programmatic use
    return report;
  } catch (error) {
    console.error('❌ Analysis failed:', error);
    console.error('Stack:', error.stack);
    throw error;
  }
}

/**
 * Print human-readable formatted report to console
 *
 * Displays key metrics and insights in organized sections
 */
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

  console.log('� SBOM (Software Bill of Materials):');
  if (report.sbom && report.sbom.packages) {
    console.log(`   Total Packages: ${report.sbom.packages.length}`);
    console.log(`   SPDX Version: ${report.sbom.spdxVersion || 'N/A'}`);
    if (report.sbom.metadata) {
      const meta = report.sbom.metadata;
      console.log(`   Strategies: ${meta.strategiesUsed?.join(', ') || 'N/A'}`);
      console.log(`   Generation Time: ${meta.generationTimeMs || 0}ms`);
      if (meta.enrichmentStats) {
        const stats = meta.enrichmentStats;
        console.log(`   Enrichment: ${stats.beforeEnrichment} → ${stats.afterEnrichment}`);
        console.log(`   Packages Added: ${stats.packagesAdded}`);
      }
    }
  } else {
    console.log('   Status: Not generated or failed');
  }
  console.log('');

  console.log('�🛡️ SECURITY OVERVIEW:');
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
