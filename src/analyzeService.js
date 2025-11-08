const adm = require('adm-zip');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { collection, addDoc, serverTimestamp, doc, setDoc } = require('firebase/firestore');
const { ref, getDownloadURL, getBytes } = require('firebase/storage');
const { db, storage } = require('./firebase'); // Your Firebase config

class AnalyzeService {
    constructor(uploadId, uid, storagePath) {
        this.uploadId = uploadId;
        this.uid = uid;
        this.storagePath = storagePath;
        this.tempDir = path.join(__dirname, 'temp', uploadId);
    }

    async analyzeAndStore() {
        try {
            console.log(`🔍 Starting analysis for upload: ${this.uploadId}`);
            
            // 1. Download file from Firebase Storage
            const fileBuffer = await this.downloadFile();
            
            // 2. Unzip the file
            const extractedPath = await this.unzipFile(fileBuffer);
            
            // 3. Analyze for licenses
            const analysisResult = await this.analyzeLicenses(extractedPath);
            
            // 4. Store results in Firebase
            await this.storeResults(analysisResult);
            
            // 5. Cleanup temp files
            this.cleanup();
            
            console.log(`✅ Analysis completed for: ${this.uploadId}`);
            return analysisResult;
            
        } catch (error) {
            console.error(`❌ Analysis failed for ${this.uploadId}:`, error);
            await this.storeError(error.message);
            throw error;
        }
    }

    async downloadFile() {
        console.log('📥 Downloading file from Firebase Storage...');
        const storageRef = ref(storage, this.storagePath);
        const fileBuffer = await getBytes(storageRef);
        return fileBuffer;
    }

    async unzipFile(fileBuffer) {
        console.log('📦 Unzipping file...');
        
        // Create temp directory
        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
        }

        try {
            const zip = new adm(fileBuffer);
            zip.extractAllTo(this.tempDir, true);
            console.log(`✅ File unzipped to: ${this.tempDir}`);
            return this.tempDir;
        } catch (error) {
            throw new Error(`Failed to unzip file: ${error.message}`);
        }
    }

    async analyzeLicenses(projectPath) {
        console.log('🔎 Analyzing licenses...');
        
        const analysisResult = {
            metadata: {
                analyzedAt: new Date().toISOString(),
                projectPath: projectPath,
                totalFiles: this.countFiles(projectPath)
            },
            packages: [],
            licenseSummary: {},
            vulnerabilities: [],
            riskAssessment: {}
        };

        try {
            // Look for package.json (Node.js projects)
            const packageJsonPath = path.join(projectPath, 'package.json');
            if (fs.existsSync(packageJsonPath)) {
                const nodeAnalysis = await this.analyzeNodeProject(projectPath);
                analysisResult.packages = nodeAnalysis.packages;
                analysisResult.licenseSummary = nodeAnalysis.licenseSummary;
            }

            // Look for requirements.txt (Python projects)
            const requirementsPath = path.join(projectPath, 'requirements.txt');
            if (fs.existsSync(requirementsPath)) {
                const pythonAnalysis = await this.analyzePythonProject(projectPath);
                analysisResult.packages = [...analysisResult.packages, ...pythonAnalysis.packages];
                analysisResult.licenseSummary = this.mergeLicenseSummaries(
                    analysisResult.licenseSummary, 
                    pythonAnalysis.licenseSummary
                );
            }

            // Look for pom.xml (Java projects)
            const pomPath = path.join(projectPath, 'pom.xml');
            if (fs.existsSync(pomPath)) {
                const javaAnalysis = await this.analyzeJavaProject(projectPath);
                analysisResult.packages = [...analysisResult.packages, ...javaAnalysis.packages];
                analysisResult.licenseSummary = this.mergeLicenseSummaries(
                    analysisResult.licenseSummary, 
                    javaAnalysis.licenseSummary
                );
            }

            // Perform risk assessment
            analysisResult.riskAssessment = this.performRiskAssessment(analysisResult);
            
            console.log(`✅ License analysis completed. Found ${analysisResult.packages.length} packages.`);
            return analysisResult;

        } catch (error) {
            console.error('License analysis error:', error);
            throw new Error(`License analysis failed: ${error.message}`);
        }
    }

    async analyzeNodeProject(projectPath) {
        const packages = [];
        const licenseSummary = {
            MIT: 0, Apache2: 0, GPL: 0, BSD: 0, ISC: 0, Unknown: 0
        };

        try {
            // Read package.json
            const packageJson = JSON.parse(fs.readFileSync(path.join(projectPath, 'package.json'), 'utf8'));
            
            // Analyze dependencies
            const dependencies = {
                ...packageJson.dependencies,
                ...packageJson.devDependencies
            };

            for (const [pkgName, version] of Object.entries(dependencies)) {
                try {
                    const licenseInfo = await this.getNpmPackageLicense(pkgName, version);
                    packages.push({
                        name: pkgName,
                        version: version,
                        type: 'npm',
                        license: licenseInfo.license,
                        repository: licenseInfo.repository,
                        description: licenseInfo.description
                    });

                    // Update license summary
                    const licenseType = this.categorizeLicense(licenseInfo.license);
                    licenseSummary[licenseType] = (licenseSummary[licenseType] || 0) + 1;

                } catch (error) {
                    console.log(`Could not analyze ${pkgName}: ${error.message}`);
                    packages.push({
                        name: pkgName,
                        version: version,
                        type: 'npm',
                        license: 'Unknown',
                        error: error.message
                    });
                    licenseSummary.Unknown += 1;
                }
            }

        } catch (error) {
            console.error('Node project analysis error:', error);
        }

        return { packages, licenseSummary };
    }

    async getNpmPackageLicense(packageName, version) {
        try {
            // Use npm view command to get package info
            const command = `npm view ${packageName}@${version} license repository description --json`;
            const output = execSync(command, { encoding: 'utf8' });
            const packageInfo = JSON.parse(output);
            
            return {
                license: packageInfo.license || 'Unknown',
                repository: packageInfo.repository?.url || '',
                description: packageInfo.description || ''
            };
        } catch (error) {
            return {
                license: 'Unknown',
                repository: '',
                description: ''
            };
        }
    }

    async analyzePythonProject(projectPath) {
        const packages = [];
        const licenseSummary = {
            MIT: 0, Apache2: 0, GPL: 0, BSD: 0, Unknown: 0
        };

        try {
            const requirementsPath = path.join(projectPath, 'requirements.txt');
            if (fs.existsSync(requirementsPath)) {
                const requirements = fs.readFileSync(requirementsPath, 'utf8')
                    .split('\n')
                    .filter(line => line.trim() && !line.startsWith('#'))
                    .map(line => line.split('==')[0].trim());

                for (const pkgName of requirements) {
                    try {
                        const licenseInfo = await this.getPyPiPackageLicense(pkgName);
                        packages.push({
                            name: pkgName,
                            type: 'pypi',
                            license: licenseInfo.license,
                            repository: licenseInfo.repository
                        });

                        const licenseType = this.categorizeLicense(licenseInfo.license);
                        licenseSummary[licenseType] = (licenseSummary[licenseType] || 0) + 1;

                    } catch (error) {
                        console.log(`Could not analyze Python package ${pkgName}: ${error.message}`);
                        packages.push({
                            name: pkgName,
                            type: 'pypi',
                            license: 'Unknown',
                            error: error.message
                        });
                        licenseSummary.Unknown += 1;
                    }
                }
            }
        } catch (error) {
            console.error('Python project analysis error:', error);
        }

        return { packages, licenseSummary };
    }

    async analyzeJavaProject(projectPath) {
        // Basic Java project analysis (simplified)
        const packages = [];
        const licenseSummary = {
            Apache2: 0, MIT: 0, GPL: 0, Unknown: 0
        };

        try {
            const pomPath = path.join(projectPath, 'pom.xml');
            if (fs.existsSync(pomPath)) {
                // For Java, we'd typically use Maven dependency plugin
                // This is a simplified version
                packages.push({
                    name: 'java-project',
                    type: 'maven',
                    license: 'Unknown', // Would need Maven analysis
                    note: 'Java project detected - manual license review recommended'
                });
            }
        } catch (error) {
            console.error('Java project analysis error:', error);
        }

        return { packages, licenseSummary };
    }

    categorizeLicense(license) {
        if (!license) return 'Unknown';
        
        const licenseStr = license.toLowerCase();
        if (licenseStr.includes('mit')) return 'MIT';
        if (licenseStr.includes('apache')) return 'Apache2';
        if (licenseStr.includes('gpl')) return 'GPL';
        if (licenseStr.includes('bsd')) return 'BSD';
        if (licenseStr.includes('isc')) return 'ISC';
        
        return 'Unknown';
    }

    mergeLicenseSummaries(summary1, summary2) {
        const merged = { ...summary1 };
        for (const [license, count] of Object.entries(summary2)) {
            merged[license] = (merged[license] || 0) + count;
        }
        return merged;
    }

    performRiskAssessment(analysisResult) {
        const risks = [];
        let totalRiskScore = 0;

        analysisResult.packages.forEach(pkg => {
            const risk = this.calculatePackageRisk(pkg);
            risks.push({
                package: pkg.name,
                license: pkg.license,
                riskLevel: risk.level,
                riskScore: risk.score,
                issues: risk.issues
            });
            totalRiskScore += risk.score;
        });

        const averageRisk = risks.length > 0 ? totalRiskScore / risks.length : 0;

        return {
            overallRisk: this.getOverallRiskLevel(averageRisk),
            averageRiskScore: Math.round(averageRisk),
            highRiskPackages: risks.filter(r => r.riskLevel === 'high'),
            mediumRiskPackages: risks.filter(r => r.riskLevel === 'medium'),
            lowRiskPackages: risks.filter(r => r.riskLevel === 'low'),
            detailedRisks: risks
        };
    }

    calculatePackageRisk(pkg) {
        let score = 0;
        const issues = [];

        // License-based risk
        if (pkg.license === 'Unknown') {
            score += 70;
            issues.push('Unknown license - requires manual review');
        } else if (pkg.license.includes('GPL')) {
            score += 80;
            issues.push('GPL license - may have copyleft requirements');
        } else if (pkg.license.includes('AGPL')) {
            score += 90;
            issues.push('AGPL license - strong copyleft requirements');
        }

        // Determine risk level
        let level = 'low';
        if (score >= 70) level = 'high';
        else if (score >= 40) level = 'medium';

        return { score, level, issues };
    }

    getOverallRiskLevel(averageScore) {
        if (averageScore >= 70) return 'HIGH';
        if (averageScore >= 40) return 'MEDIUM';
        return 'LOW';
    }

    countFiles(dirPath) {
        try {
            const files = fs.readdirSync(dirPath, { recursive: true });
            return files.length;
        } catch (error) {
            return 0;
        }
    }

    async storeResults(analysisResult) {
        console.log('💾 Storing results in Firebase...');

        const resultData = {
            uid: this.uid,
            uploadId: this.uploadId,
            data: analysisResult,
            analyzedAt: serverTimestamp(),
            status: 'completed',
            summary: {
                totalPackages: analysisResult.packages.length,
                riskLevel: analysisResult.riskAssessment.overallRisk,
                licenseDistribution: analysisResult.licenseSummary
            }
        };

        try {
            // Store in 'results' collection with same ID as upload
            await setDoc(doc(db, 'results', this.uploadId), resultData);
            
            // Also update the upload document status
            await setDoc(doc(db, 'uploads', this.uploadId), {
                status: 'scanned',
                scannedAt: serverTimestamp()
            }, { merge: true });

            console.log(`✅ Results stored for upload: ${this.uploadId}`);
        } catch (error) {
            console.error('Error storing results:', error);
            throw error;
        }
    }

    async storeError(errorMessage) {
        try {
            await setDoc(doc(db, 'results', this.uploadId), {
                uid: this.uid,
                uploadId: this.uploadId,
                status: 'failed',
                error: errorMessage,
                analyzedAt: serverTimestamp()
            });

            await setDoc(doc(db, 'uploads', this.uploadId), {
                status: 'failed',
                errorMessage: errorMessage
            }, { merge: true });
        } catch (error) {
            console.error('Error storing error result:', error);
        }
    }

    cleanup() {
        try {
            if (fs.existsSync(this.tempDir)) {
                fs.rmSync(this.tempDir, { recursive: true, force: true });
                console.log('🧹 Temporary files cleaned up');
            }
        } catch (error) {
            console.error('Cleanup error:', error);
        }
    }
}

module.exports = AnalyzeService;