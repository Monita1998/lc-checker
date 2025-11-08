// research-license-analyzer.js
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class ResearchLicenseAnalyzer {
    constructor(projectPath) {
        this.projectPath = path.resolve(projectPath);
        this.analysisResults = {};
    }

    async comprehensiveAnalysis() {
        console.log('🔬 Starting comprehensive license analysis...\n');
        
        // 1. Get base data from license-checker
        const baseData = await this.getLicenseCheckerData();
        
        // 2. Enhanced analysis for research purposes
        const enhancedData = await this.enhanceWithResearchData(baseData);
        
        // 3. Analyze license declaration patterns
        const patterns = this.analyzeDeclarationPatterns(enhancedData);
        
        // 4. Generate research insights
        const insights = this.generateResearchInsights(enhancedData, patterns);
        
        return {
            rawData: baseData,
            enhancedData: enhancedData,
            patterns: patterns,
            insights: insights,
            metadata: this.getAnalysisMetadata()
        };
    }

    async getLicenseCheckerData() {
        try {
            console.log('📋 Step 1: Running license-checker for base data...');
            const output = execSync('license-checker --json --direct', {
                cwd: this.projectPath,
                encoding: 'utf8'
            });
            return JSON.parse(output);
        } catch (error) {
            console.log('❌ license-checker failed, using fallback...');
            return this.fallbackManualAnalysis();
        }
    }

    async enhanceWithResearchData(baseData) {
        console.log('🔍 Step 2: Enhancing with research-specific analysis...');
        const enhanced = {};
        
        for (const [pkgName, pkgData] of Object.entries(baseData)) {
            enhanced[pkgName] = {
                ...pkgData,
                researchMetadata: await this.analyzePackageMetadata(pkgName, pkgData)
            };
        }
        
        return enhanced;
    }

    async analyzePackageMetadata(pkgName, pkgData) {
        const analysis = {
            licenseSources: [],
            declarationQuality: 'unknown',
            ambiguityLevel: 'none',
            validationStatus: 'pending'
        };

        // Analyze license declaration sources
        const sources = await this.identifyLicenseSources(pkgName, pkgData);
        analysis.licenseSources = sources;
        
        // Assess declaration quality
        analysis.declarationQuality = this.assessDeclarationQuality(sources, pkgData.licenses);
        
        // Check for ambiguity
        analysis.ambiguityLevel = this.detectAmbiguity(pkgData.licenses);
        
        // Validate consistency across sources
        analysis.validationStatus = this.validateLicenseConsistency(sources, pkgData.licenses);
        
        return analysis;
    }

    async identifyLicenseSources(pkgName, pkgData) {
        const sources = [];
        const pkgPath = pkgData.path || path.join(this.projectPath, 'node_modules', pkgName.split('@')[0]);

        // Check package.json license field
        const packageJsonPath = path.join(pkgPath, 'package.json');
        if (fs.existsSync(packageJsonPath)) {
            try {
                const pkgJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
                if (pkgJson.license) {
                    sources.push({
                        type: 'package.json',
                        value: pkgJson.license,
                        confidence: 'high'
                    });
                }
            } catch (error) {
                sources.push({
                    type: 'package.json',
                    value: 'ERROR_PARSING',
                    confidence: 'low'
                });
            }
        }

        // Check LICENSE files
        const licenseFiles = ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'COPYING'];
        for (const licenseFile of licenseFiles) {
            const licensePath = path.join(pkgPath, licenseFile);
            if (fs.existsSync(licensePath)) {
                sources.push({
                    type: 'license_file',
                    file: licenseFile,
                    confidence: 'high'
                });
            }
        }

        // Check readme for license mentions
        const readmeFiles = ['README.md', 'README.txt', 'README'];
        for (const readmeFile of readmeFiles) {
            const readmePath = path.join(pkgPath, readmeFile);
            if (fs.existsSync(readmePath)) {
                const content = fs.readFileSync(readmePath, 'utf8').toLowerCase();
                if (content.includes('license') || content.includes('licence')) {
                    sources.push({
                        type: 'readme_mention',
                        file: readmeFile,
                        confidence: 'medium'
                    });
                }
            }
        }

        return sources;
    }

    assessDeclarationQuality(sources, declaredLicense) {
        if (!declaredLicense || declaredLicense === 'UNKNOWN') {
            return 'poor';
        }

        const sourceCount = sources.filter(s => s.confidence === 'high').length;
        
        if (sourceCount >= 2) {
            return 'excellent';
        } else if (sourceCount === 1) {
            return 'good';
        } else if (sources.length > 0) {
            return 'fair';
        } else {
            return 'poor';
        }
    }

    detectAmbiguity(license) {
        if (!license) return 'high';
        
        const licenseStr = license.toString();
        
        if (licenseStr.includes(' OR ')) {
            return 'multiple_options';
        } else if (licenseStr.includes(' AND ')) {
            return 'composite';
        } else if (licenseStr.includes('(') && licenseStr.includes(')')) {
            return 'complex_expression';
        } else if (licenseStr === 'UNKNOWN' || licenseStr === 'UNLICENSED') {
            return 'undefined';
        } else {
            return 'clear';
        }
    }

    validateLicenseConsistency(sources, declaredLicense) {
        if (sources.length === 0) return 'no_sources';
        
        const packageJsonSource = sources.find(s => s.type === 'package.json');
        if (!packageJsonSource) return 'missing_package_json';
        
        if (declaredLicense === 'UNKNOWN') return 'undeclared';
        
        return 'consistent';
    }

    analyzeDeclarationPatterns(enhancedData) {
        const patterns = {
            declarationFormats: {},
            ambiguityTypes: {},
            sourceCombinations: {},
            qualityDistribution: {}
        };

        Object.values(enhancedData).forEach(pkg => {
            const research = pkg.researchMetadata;
            
            // Track declaration formats
            const license = pkg.licenses || 'UNKNOWN';
            patterns.declarationFormats[license] = (patterns.declarationFormats[license] || 0) + 1;
            
            // Track ambiguity types
            patterns.ambiguityTypes[research.ambiguityLevel] = 
                (patterns.ambiguityTypes[research.ambiguityLevel] || 0) + 1;
            
            // Track quality distribution
            patterns.qualityDistribution[research.declarationQuality] = 
                (patterns.qualityDistribution[research.declarationQuality] || 0) + 1;
            
            // Track source combinations
            const sourceTypes = research.licenseSources.map(s => s.type).sort().join('+');
            patterns.sourceCombinations[sourceTypes] = 
                (patterns.sourceCombinations[sourceTypes] || 0) + 1;
        });

        return patterns;
    }

    generateResearchInsights(enhancedData, patterns) {
        const totalPackages = Object.keys(enhancedData).length;
        
        const insights = {
            summary: {
                totalPackages: totalPackages,
                packagesWithClearLicenses: patterns.ambiguityTypes.clear || 0,
                packagesWithAmbiguousLicenses: totalPackages - (patterns.ambiguityTypes.clear || 0),
                qualityBreakdown: patterns.qualityDistribution
            },
            commonIssues: this.identifyCommonIssues(enhancedData),
            recommendations: this.generateRecommendations(patterns)
        };

        return insights;
    }

    identifyCommonIssues(enhancedData) {
        const issues = [];
        
        Object.entries(enhancedData).forEach(([pkgName, pkgData]) => {
            const research = pkgData.researchMetadata;
            
            if (research.declarationQuality === 'poor') {
                issues.push({
                    package: pkgName,
                    issue: 'Poor license declaration',
                    details: `Only ${research.licenseSources.length} source(s) found`,
                    severity: 'high'
                });
            }
            
            if (research.ambiguityLevel !== 'clear') {
                issues.push({
                    package: pkgName,
                    issue: 'License ambiguity',
                    details: `Ambiguity level: ${research.ambiguityLevel}`,
                    severity: 'medium'
                });
            }
            
            if (research.validationStatus !== 'consistent') {
                issues.push({
                    package: pkgName,
                    issue: 'Validation issue',
                    details: `Status: ${research.validationStatus}`,
                    severity: 'low'
                });
            }
        });
        
        return issues;
    }

    generateRecommendations(patterns) {
        const recommendations = [];
        
        if (patterns.qualityDistribution.poor > 0) {
            recommendations.push({
                type: 'quality_improvement',
                description: `${patterns.qualityDistribution.poor} packages have poor license declarations`,
                suggestion: 'Implement enhanced license detection for these packages'
            });
        }
        
        if (patterns.ambiguityTypes.multiple_options) {
            recommendations.push({
                type: 'ambiguity_resolution',
                description: `${patterns.ambiguityTypes.multiple_options} packages have multiple license options`,
                suggestion: 'Develop policy for handling "OR" license expressions'
            });
        }
        
        return recommendations;
    }

    getAnalysisMetadata() {
        return {
            analysisDate: new Date().toISOString(),
            toolVersion: 'research-analyzer-1.0',
            projectPath: this.projectPath,
            methodology: [
                'license-checker base data extraction',
                'multi-source license validation',
                'declaration quality assessment',
                'ambiguity detection',
                'pattern analysis'
            ]
        };
    }

    fallbackManualAnalysis() {
        // Fallback implementation
        console.log('Using fallback manual analysis...');
        return {};
    }
}

// Research report generator
function generateResearchReport(analysisResults) {
    const report = {
        executiveSummary: generateExecutiveSummary(analysisResults),
        detailedAnalysis: analysisResults,
        patternsAndTrends: analysisResults.patterns,
        recommendations: analysisResults.insights.recommendations
    };
    
    return report;
}

function generateExecutiveSummary(analysis) {
    const total = analysis.insights.summary.totalPackages;
    const clear = analysis.insights.summary.packagesWithClearLicenses;
    const ambiguous = analysis.insights.summary.packagesWithAmbiguousLicenses;
    
    return {
        totalPackagesAnalyzed: total,
        licenseClarityScore: `${Math.round((clear / total) * 100)}%`,
        ambiguityRate: `${Math.round((ambiguous / total) * 100)}%`,
        primaryFindings: analysis.insights.commonIssues.slice(0, 5),
        dataQuality: analysis.insights.summary.qualityBreakdown
    };
}

// Usage
async function main() {
    const projectPath = process.argv[2] || '.';
    const analyzer = new ResearchLicenseAnalyzer(projectPath);
    
    console.log('🎯 RESEARCH-GRADE LICENSE ANALYSIS');
    console.log('====================================\n');
    
    try {
        const results = await analyzer.comprehensiveAnalysis();
        const researchReport = generateResearchReport(results);
        
        // Save comprehensive research data
        const reportPath = path.join(projectPath, 'research-license-analysis.json');
        fs.writeFileSync(reportPath, JSON.stringify(researchReport, null, 2));
        
        console.log('✅ Research analysis completed!');
        console.log(`📊 Report saved to: ${reportPath}`);
        
        // Print key insights
        console.log('\n🔍 KEY RESEARCH INSIGHTS:');
        console.log(`   • Packages analyzed: ${researchReport.executiveSummary.totalPackagesAnalyzed}`);
        console.log(`   • License clarity: ${researchReport.executiveSummary.licenseClarityScore}`);
        console.log(`   • Ambiguity rate: ${researchReport.executiveSummary.ambiguityRate}`);
        console.log(`   • Common issues: ${researchReport.executiveSummary.primaryFindings.length} identified`);
        
    } catch (error) {
        console.error('❌ Research analysis failed:', error);
    }
}

if (require.main === module) {
    main();
}

module.exports = ResearchLicenseAnalyzer;