// sca-platform-analyzer.js
const { execSync } = require('child_exec');
const fs = require('fs');
const path = require('path');
const axios = require('axios'); // For security API calls

class SCAPlatformAnalyzer {
    constructor(projectPath) {
        this.projectPath = path.resolve(projectPath);
        this.results = {
            licenseCompliance: {},
            securityVulnerabilities: {},
            riskAssessment: {},
            unifiedReport: {}
        };
    }

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
            metadata: this.getPlatformMetadata()
        };
    }

    async generateSPDXSBOM() {
        console.log('📋 Step 1: Generating SPDX-standard SBOM...');
        
        try {
            // Try using Syft via Docker for proper SPDX output
            const output = execSync(
                `docker run --rm -v "${this.projectPath}:/project" anchore/syft:latest /project -o spdx-json`,
                { encoding: 'utf8' }
            );
            return JSON.parse(output);
        } catch (error) {
            console.log('Syft failed, using enhanced license-checker with SPDX mapping...');
            return await this.generateEnhancedSBOM();
        }
    }

    async generateEnhancedSBOM() {
        const licenseData = await this.getLicenseCheckerData();
        const packageJson = this.readPackageJson();
        
        // Convert to SPDX-like structure
        return {
            spdxVersion: "SPDX-2.3",
            dataLicense: "CC0-1.0",
            SPDXID: "SPDXRef-DOCUMENT",
            name: `SBOM-for-${packageJson.name || 'project'}`,
            documentNamespace: `https://spdx.org/spdxdocs/${packageJson.name}-${Date.now()}`,
            creationInfo: {
                created: new Date().toISOString(),
                creators: ["Tool: SCA-Platform-Analyzer"]
            },
            packages: this.convertToSPDXPackages(licenseData, packageJson)
        };
    }

    convertToSPDXPackages(licenseData, projectInfo) {
        const spdxPackages = [];
        
        Object.entries(licenseData).forEach(([pkgName, pkgData]) => {
            const [name, version] = pkgName.split('@');
            const spdxId = `SPDXRef-Package-${name}-${version}`.replace(/[^a-zA-Z0-9-]/g, '');
            
            spdxPackages.push({
                SPDXID: spdxId,
                name: name,
                versionInfo: version,
                downloadLocation: pkgData.repository || "NOASSERTION",
                licenseConcluded: this.mapToSPDXLicense(pkgData.licenses),
                licenseDeclared: this.mapToSPDXLicense(pkgData.licenses),
                copyrightText: "NOASSERTION",
                description: pkgData.description || "NONE",
                externalRefs: [
                    {
                        referenceCategory: "PACKAGE-MANAGER",
                        referenceType: "purl",
                        referenceLocator: `pkg:npm/${name}@${version}`
                    }
                ]
            });
        });
        
        return spdxPackages;
    }

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
            'UNKNOWN': 'NOASSERTION'
        };
        
        return spdxMappings[license] || license || 'NOASSERTION';
    }

    async analyzeLicenseCompliance(sbom) {
        console.log('⚖️  Step 2: Analyzing License Compliance...');
        
        const policies = this.loadCompliancePolicies();
        const violations = [];
        const warnings = [];
        
        sbom.packages.forEach(pkg => {
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
                    remediation: 'Consider replacing with alternative package'
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
                    remediation: 'Review license obligations and ensure compliance'
                });
            }
        });
        
        return {
            summary: {
                totalPackages: sbom.packages.length,
                compliantPackages: sbom.packages.length - violations.length,
                violations: violations.length,
                warnings: warnings.length
            },
            violations: violations,
            warnings: warnings,
            riskDistribution: this.calculateLicenseRiskDistribution(sbom.packages)
        };
    }

    classifyLicenseRisk(license) {
        const riskMatrix = {
            'PERMISSIVE': ['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC'],
            'WEAK_COPYLEFT': ['LGPL-2.1', 'LGPL-3.0', 'MPL-2.0', 'EPL-1.0'],
            'STRONG_COPYLEFT': ['GPL-2.0', 'GPL-3.0', 'AGPL-3.0'],
            'UNKNOWN': ['NOASSERTION', 'UNKNOWN']
        };
        
        for (const [risk, licenses] of Object.entries(riskMatrix)) {
            if (licenses.includes(license)) return risk;
        }
        
        return 'UNKNOWN';
    }

    async analyzeSecurityVulnerabilities(sbom) {
        console.log('🛡️  Step 3: Analyzing Security Vulnerabilities...');
        
        const vulnerabilities = [];
        
        // Check each package for known vulnerabilities
        for (const pkg of sbom.packages) {
            const pkgVulnerabilities = await this.checkPackageVulnerabilities(pkg);
            vulnerabilities.push(...pkgVulnerabilities);
        }
        
        return {
            summary: {
                totalVulnerabilities: vulnerabilities.length,
                critical: vulnerabilities.filter(v => v.severity === 'critical').length,
                high: vulnerabilities.filter(v => v.severity === 'high').length,
                medium: vulnerabilities.filter(v => v.severity === 'medium').length,
                low: vulnerabilities.filter(v => v.severity === 'low').length
            },
            vulnerabilities: vulnerabilities,
            affectedPackages: this.getAffectedPackages(vulnerabilities)
        };
    }

    async checkPackageVulnerabilities(pkg) {
        try {
            // Use NPM Audit API or OSV Database
            const response = await axios.get(
                `https://api.osv.dev/v1/query`,
                {
                    data: {
                        package: {
                            name: pkg.name,
                            ecosystem: 'npm'
                        },
                        version: pkg.versionInfo
                    }
                }
            );
            
            if (response.data.vulns) {
                return response.data.vulns.map(vuln => ({
                    id: vuln.id,
                    package: pkg.name,
                    version: pkg.versionInfo,
                    severity: this.determineSeverity(vuln),
                    summary: vuln.summary,
                    references: vuln.references,
                    affectedVersions: vuln.affected,
                    patchedVersions: vuln.ranges?.map(range => range.fixed) || []
                }));
            }
        } catch (error) {
            console.log(`Could not check vulnerabilities for ${pkg.name}: ${error.message}`);
        }
        
        return [];
    }

    determineSeverity(vulnerability) {
        // Simplified severity determination
        const cvss = vulnerability.database_specific?.cvss || 0;
        if (cvss >= 9) return 'critical';
        if (cvss >= 7) return 'high';
        if (cvss >= 4) return 'medium';
        return 'low';
    }

    performUnifiedRiskAssessment(licenseAnalysis, securityAnalysis) {
        console.log('📊 Step 4: Performing Unified Risk Assessment...');
        
        const riskScores = {};
        const combinedRisks = [];
        
        // Combine license and security risks
        licenseAnalysis.violations.forEach(violation => {
            const riskScore = this.calculateCombinedRiskScore(violation.riskLevel, null);
            combinedRisks.push({
                type: 'LICENSE',
                package: violation.package,
                riskScore: riskScore,
                details: violation,
                priority: this.determinePriority(riskScore)
            });
        });
        
        securityAnalysis.vulnerabilities.forEach(vuln => {
            const riskScore = this.calculateCombinedRiskScore(null, vuln.severity);
            combinedRisks.push({
                type: 'SECURITY',
                package: vuln.package,
                riskScore: riskScore,
                details: vuln,
                priority: this.determinePriority(riskScore)
            });
        });
        
        // Sort by risk score (descending)
        combinedRisks.sort((a, b) => b.riskScore - a.riskScore);
        
        return {
            overallRiskScore: this.calculateOverallRisk(combinedRisks),
            highPriorityRisks: combinedRisks.filter(r => r.priority === 'HIGH'),
        mediumPriorityRisks: combinedRisks.filter(r => r.priority === 'MEDIUM'),
            riskBreakdown: {
                licenseRisks: licenseAnalysis.violations.length,
                securityRisks: securityAnalysis.vulnerabilities.length,
                totalRisks: combinedRisks.length
            },
            detailedRisks: combinedRisks
        };
    }

    calculateCombinedRiskScore(licenseRisk, securitySeverity) {
        let score = 0;
        
        // License risk scoring
        const licenseScores = {
            'STRONG_COPYLEFT': 90,
            'WEAK_COPYLEFT': 60,
            'PERMISSIVE': 10,
            'UNKNOWN': 50
        };
        
        if (licenseRisk) score += licenseScores[licenseRisk] || 30;
        
        // Security risk scoring
        const securityScores = {
            'critical': 100,
            'high': 75,
            'medium': 50,
            'low': 25
        };
        
        if (securitySeverity) score += securityScores[securitySeverity] || 0;
        
        return Math.min(100, score);
    }

    calculateOverallRisk(combinedRisks) {
        if (combinedRisks.length === 0) return 0;
        
        const averageScore = combinedRisks.reduce((sum, risk) => sum + risk.riskScore, 0) / combinedRisks.length;
        const maxScore = Math.max(...combinedRisks.map(r => r.riskScore));
        
        // Weighted average favoring high risks
        return Math.round((maxScore * 0.6) + (averageScore * 0.4));
    }

    determinePriority(riskScore) {
        if (riskScore >= 80) return 'HIGH';
        if (riskScore >= 50) return 'MEDIUM';
        return 'LOW';
    }

    generateActionableReports(riskAssessment) {
        console.log('📝 Step 5: Generating Actionable Reports...');
        
        return {
            executiveSummary: this.generateExecutiveSummary(riskAssessment),
            complianceReport: this.generateComplianceReport(riskAssessment),
            securityReport: this.generateSecurityReport(riskAssessment),
            remediationPlan: this.generateRemediationPlan(riskAssessment),
            dashboardData: this.generateDashboardData(riskAssessment)
        };
    }

    generateExecutiveSummary(riskAssessment) {
        return {
            projectHealth: this.calculateProjectHealth(riskAssessment),
            topRisks: riskAssessment.detailedRisks.slice(0, 5),
            quickActions: this.generateQuickActions(riskAssessment),
            summaryMetrics: {
                overallRiskScore: riskAssessment.overallRiskScore,
                totalRisks: riskAssessment.riskBreakdown.totalRisks,
                highPriority: riskAssessment.highPriorityRisks.length,
                complianceStatus: riskAssessment.riskBreakdown.licenseRisks === 0 ? 'COMPLIANT' : 'NON_COMPLIANT'
            }
        };
    }

    calculateProjectHealth(riskAssessment) {
        const riskScore = riskAssessment.overallRiskScore;
        
        if (riskScore >= 80) return 'CRITICAL';
        if (riskScore >= 60) return 'HIGH_RISK';
        if (riskScore >= 40) return 'MODERATE_RISK';
        if (riskScore >= 20) return 'LOW_RISK';
        return 'HEALTHY';
    }

    generateQuickActions(riskAssessment) {
        const actions = [];
        
        riskAssessment.highPriorityRisks.forEach(risk => {
            if (risk.type === 'LICENSE') {
                actions.push({
                    action: 'REPLACE_PACKAGE',
                    package: risk.package,
                    reason: 'Prohibited license',
                    urgency: 'HIGH',
                    suggestion: `Find alternative to ${risk.package} with permissive license`
                });
            } else if (risk.type === 'SECURITY') {
                actions.push({
                    action: 'UPDATE_PACKAGE',
                    package: risk.package,
                    reason: 'Security vulnerability',
                    urgency: 'HIGH',
                    suggestion: `Update ${risk.package} to patched version`
                });
            }
        });
        
        return actions;
    }

    generateDashboardData(riskAssessment) {
        return {
            riskDistribution: {
                license: riskAssessment.riskBreakdown.licenseRisks,
                security: riskAssessment.riskBreakdown.securityRisks
            },
            priorityBreakdown: {
                high: riskAssessment.highPriorityRisks.length,
                medium: riskAssessment.mediumPriorityRisks.length,
                low: riskAssessment.detailedRisks.filter(r => r.priority === 'LOW').length
            },
            trendData: this.generateTrendData(),
            healthScore: 100 - riskAssessment.overallRiskScore
        };
    }

    loadCompliancePolicies() {
        // Load from config file or use defaults
        return {
            blockedLicenses: ['GPL-3.0', 'AGPL-3.0', 'GPL-2.0'],
            warningLicenses: ['LGPL-2.1', 'LGPL-3.0', 'MPL-2.0'],
            allowedLicenses: ['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC'],
            requireLicenseApproval: true,
            securityThreshold: 'medium' // Block high/critical vulnerabilities
        };
    }

    getPlatformMetadata() {
        return {
            analysisTimestamp: new Date().toISOString(),
            platformVersion: '1.0',
            features: [
                'SPDX SBOM Generation',
                'License Compliance Checking',
                'Security Vulnerability Correlation',
                'Unified Risk Assessment',
                'Actionable Reporting'
            ],
            complianceStandards: ['SPDX-2.3', 'OWASP Top 10']
        };
    }
}

// CLI Interface
async function main() {
    const projectPath = process.argv[2] || '.';
    const analyzer = new SCAPlatformAnalyzer(projectPath);
    
    console.log('🎯 HOLISTIC SCA PLATFORM ANALYSIS');
    console.log('==================================\n');
    
    try {
        const results = await analyzer.comprehensiveAnalysis();
        
        // Save comprehensive results
        const reportPath = path.join(projectPath, 'sca-platform-report.json');
        fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
        
        console.log('✅ Analysis Completed!');
        console.log(`📊 Full report saved to: ${reportPath}`);
        
        // Print executive summary
        console.log('\n📈 EXECUTIVE SUMMARY:');
        console.log(`   Overall Risk Score: ${results.riskAssessment.overallRiskScore}/100`);
        console.log(`   Project Health: ${results.reports.executiveSummary.projectHealth}`);
        console.log(`   High Priority Risks: ${results.riskAssessment.highPriorityRisks.length}`);
        console.log(`   License Violations: ${results.licenseCompliance.summary.violations}`);
        console.log(`   Security Vulnerabilities: ${results.securityVulnerabilities.summary.totalVulnerabilities}`);
        
        console.log('\n🚨 TOP ACTIONS:');
        results.reports.executiveSummary.quickActions.forEach((action, index) => {
            console.log(`   ${index + 1}. ${action.action}: ${action.package} - ${action.reason}`);
        });
        
    } catch (error) {
        console.error('❌ Analysis failed:', error);
    }
}

if (require.main === module) {
    main();
}

module.exports = SCAPlatformAnalyzer;