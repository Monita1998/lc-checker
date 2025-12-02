// ✅ Modern v2 syntax for Firebase Cloud Functions
const {onDocumentUpdated} = require('firebase-functions/v2/firestore');
const {onRequest} = require('firebase-functions/v2/https');
const {initializeApp} = require('firebase-admin/app');
const {getFirestore, FieldValue} = require('firebase-admin/firestore');
const {getStorage} = require('firebase-admin/storage');
const os = require('os');
const path = require('path');
const fs = require('fs');
const {unzipFile} = require('./utils/unzipper');

// Use the enhanced unified analyzer with built-in SBOM generation
// This analyzer provides: license analysis, security scanning, and SPDX 2.3 SBOM
const SCAPlatformAnalyzer = require('./analyzers/analyze');

// Initialize Admin SDK
initializeApp();
const db = getFirestore();
const storage = getStorage();

// 🎯 Firestore Trigger: Analyze upload on update
// Increase memory & timeout to accommodate heavier analysis jobs. This function
// can require more than the default 256MB for large archives; it is set to 1GB
// here. If you need a different size, valid values include '512MB', '1GB', etc.
// (This runs on Functions v2 / Cloud Run; these runtime options are honored.)
exports.analyzeOnUpload = onDocumentUpdated({
  document: 'uploads/{uploadId}',
  memory: '2GB',
  timeoutSeconds: 3600,
}, async (event) => {
  const beforeData = event.data.before.data();
  const afterData = event.data.after.data();
  const uploadId = event.params.uploadId;

  console.log('🎯 Cloud Function triggered!');
  console.log('Upload ID:', uploadId);
  console.log('Before status:', beforeData.status);
  console.log('After status:', afterData.status);

  // Only run when status changes TO 'not_scanned'
  if (beforeData.status !== 'not_scanned' && afterData.status === 'not_scanned') {
    console.log('🚀 Starting analysis...');

    try {
      // 1. Update status to 'scanning'
      await event.data.after.ref.update({
        status: 'scanning',
        scanStartedAt: FieldValue.serverTimestamp(),
        note: 'Cloud Function is working!',
      });

      console.log('✅ Status updated to scanning');

      // 2. Lookup storagePath in upload doc
      const uploadDoc = afterData;
      const storagePath = uploadDoc.storagePath || afterData.storagePath || afterData.downloadURL;
      if (!storagePath) throw new Error('No storagePath found on upload document');

      const bucket = storage.bucket();

      // If a Cloud Run runner URL is provided, delegate the heavy work and
      // await the runner's response. The runner is expected to return the
      // full analysis report JSON in the HTTP response body. The Cloud
      // Function will then upload the report to Storage and update Firestore.
      const cloudRunUrl = process.env.CLOUD_RUN_URL;
      const cloudRunAuth = process.env.CLOUD_RUN_AUTH_TOKEN || null;

      if (cloudRunUrl) {
        console.log('➡️ Delegating synchronous analysis to Cloud Run:', cloudRunUrl);

        const job = {
          projectId: process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || null,
          bucket: bucket.name,
          storagePath,
          uploadId,
        };

        try {
          const headers = {'Content-Type': 'application/json'};
          if (cloudRunAuth) headers.Authorization = `Bearer ${cloudRunAuth}`;

          const resp = await fetch(cloudRunUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(job),
          });

          if (!resp.ok) {
            const bodyText = await resp.text().catch(() => '<unreadable>');
            throw new Error(`Cloud Run runner responded ${resp.status}: ${bodyText}`);
          }

          const body = await resp.json().catch(() => null);
          if (!body || !body.report) {
            throw new Error('Cloud Run runner returned no report');
          }

          const analysisResults = body.report;

          // Persist the report to Storage and Firestore (Cloud Function does this now).
          const reportFileName = `${uploadId}-sca-report.json`;
          const reportPath = path.join(os.tmpdir(), reportFileName);
          fs.writeFileSync(reportPath, JSON.stringify(analysisResults, null, 2));

          const reportUploadPath = `reports/${reportFileName}`;
          await bucket.upload(reportPath, {
            destination: reportUploadPath,
            metadata: {
              contentType: 'application/json',
              metadata: {
                firebaseStorageDownloadTokens: require('uuid').v4(),
              },
            },
          });
          console.log('✅ Uploaded report to', reportUploadPath);

          // Make file publicly readable and get public URL
          const reportFile = bucket.file(reportUploadPath);
          await reportFile.makePublic();
          // Construct public URL
          const reportUrl = `https://storage.googleapis.com/${bucket.name}/${reportUploadPath}`;
          console.log('✅ Generated public URL for report (Cloud Run path)');

          await db.collection('results').doc(uploadId).set({
            uid: afterData.uid,
            uploadId,
            reportPath: reportUploadPath,
            reportUrl: reportUrl, // Signed URL for download
            data: analysisResults, // Full JSON data for in-app viewing
            analyzedAt: FieldValue.serverTimestamp(),
            status: 'completed',
            summary: analysisResults.reports?.executiveSummary || 'Analysis completed',
            stats: {
              packagesFound: (analysisResults.sbom?.packages || []).length,
              riskScore: analysisResults.riskAssessment?.overallRiskScore || null,
            },
          });

          await event.data.after.ref.update({
            status: 'scanned',
            scannedAt: FieldValue.serverTimestamp(),
            analysisSummary: {
              packagesFound: (analysisResults.sbom?.packages || []).length,
              riskLevel: analysisResults.riskAssessment?.overallRiskScore || null,
              reportPath: reportUploadPath,
              reportUrl: reportUrl, // Add download URL
            },
          });

          console.log('✅ Analysis completed via Cloud Run and stored by function');

          // cleanup
          try {
            fs.rmSync(reportPath, {force: true});
          } catch (e) {
            // best-effort
          }

          return null;
        } catch (crErr) {
          console.error('Failed to POST job to Cloud Run runner (will fallback):', crErr);
          // fall through to the local path below
        }
      }

      // If not delegating to Cloud Run (or delegation failed), continue with
      // the previous local flow: download, unzip, validate, analyze.
      const fileName = path.basename(storagePath);
      const tempZipPath = path.join(os.tmpdir(), fileName);
      const extractPath = path.join(os.tmpdir(), `extract-${Date.now()}`);

      console.log('📦 Downloading zip from storage:', storagePath);
      await bucket.file(storagePath).download({destination: tempZipPath});
      console.log('📦 Downloaded to', tempZipPath);

      // 3. Unzip
      await unzipFile(tempZipPath, extractPath);
      console.log('📂 Extracted to', extractPath);

      // Validate and locate the project root to analyze
      // Expected files: package.json, package-lock.json (or yarn.lock), node_modules/
      // If the archive contains a single root folder (common), inspect its contents
      let rootToCheck = extractPath;
      const warnings = [];
      try {
        const topLevel = fs.readdirSync(rootToCheck);
        if (topLevel.length === 1) {
          const single = topLevel[0];
          const singlePath = path.join(rootToCheck, single);
          if (fs.existsSync(singlePath) && fs.statSync(singlePath).isDirectory()) {
            rootToCheck = singlePath;
            console.log(`📁 Single root folder detected, using: ${single}`);
          }
        }

        const entries = fs.readdirSync(rootToCheck);
        console.log('📋 Archive top-level entries:', entries);

        // Check for required and recommended files
        const requiredFiles = {
          'package.json': {
            exists: fs.existsSync(path.join(rootToCheck, 'package.json')),
            description: 'Project manifest with dependency list',
            severity: 'CRITICAL',
          },
          'node_modules': {
            exists: fs.existsSync(path.join(rootToCheck, 'node_modules')),
            description: 'Installed packages for detailed analysis',
            severity: 'HIGH',
          },
          'package-lock.json': {
            exists: fs.existsSync(path.join(rootToCheck, 'package-lock.json')) ||
                    fs.existsSync(path.join(rootToCheck, 'yarn.lock')),
            description: 'Lock file for exact version tracking',
            severity: 'MEDIUM',
          },
        };

        // Check for unexpected files (anything other than the 3 mandatory files)
        // STRICT: Only allow package.json, package-lock.json (or yarn.lock), node_modules
        const allowedFiles = [
          'package.json',
          'package-lock.json',
          'yarn.lock',
          'node_modules',
        ];
        const unexpectedFiles = entries.filter((name) => !allowedFiles.includes(name));

        if (unexpectedFiles.length > 0) {
          const msg = `Invalid ZIP: Contains unexpected files/folders: ` +
                      `${unexpectedFiles.join(', ')}. ` +
                      'Please upload ONLY: package.json, package-lock.json, ' +
                      'and node_modules folder.';
          console.error('❌ UPLOAD REJECTED - Unexpected files:', unexpectedFiles);

          // REJECT the upload - update Firestore with error status
          await db.collection('results').doc(uploadId).set({
            uploadId,
            uid: afterData.uid,
            projectName: fileName,
            status: 'failed',
            summary: 'Upload rejected: ZIP contains unexpected files',
            validationWarnings: [{
              type: 'INVALID_ZIP_STRUCTURE',
              severity: 'CRITICAL',
              message: msg,
              files: unexpectedFiles,
            }],
            analyzedAt: FieldValue.serverTimestamp(),
          });

          console.log('❌ Upload rejected due to invalid ZIP structure');
          return; // Stop processing
        }

        // Check for missing critical files and generate detailed warnings
        // Analysis will proceed but with incomplete results
        const missingFileImpacts = {
          'package.json': [
            'License information may be incomplete',
            'Project metadata unavailable',
            'Dependency list incomplete',
          ],
          'node_modules': [
            'Detailed package analysis unavailable',
            'License extraction limited',
            'Vulnerability scanning incomplete',
            'SBOM will only include dependencies from lock file',
          ],
          'package-lock.json': [
            'Exact version tracking unavailable',
            'Dependency tree may be incomplete',
            'Some outdated package checks may be skipped',
          ],
        };

        Object.entries(requiredFiles).forEach(([fileName, fileInfo]) => {
          if (!fileInfo.exists) {
            const impacts = missingFileImpacts[fileName] || [];
            const impactList = impacts.length > 0 ?
              ` Impact: ${impacts.join('; ')}.` : '';
            const msg = `Missing ${fileName}: ${fileInfo.description}.${impactList}`;
            warnings.push({
              type: 'MISSING_FILE',
              severity: fileInfo.severity,
              message: msg,
              file: fileName,
              impacts: impacts,
            });
            console.warn(`⚠️ ${fileInfo.severity}: Missing ${fileName}`);
            console.warn(`   Impact: ${impacts.join('; ')}`);
          } else {
            console.log(`✅ Found ${fileName}`);
          }
        });

        // Log file validation summary
        const validationSummary = {
          hasPackageJson: requiredFiles['package.json'].exists,
          hasNodeModules: requiredFiles['node_modules'].exists,
          hasLockFile: requiredFiles['package-lock.json'].exists,
          unexpectedFilesCount: unexpectedFiles.length,
          warningsCount: warnings.length,
          canAnalyze: requiredFiles['package.json'].exists ||
                      requiredFiles['node_modules'].exists,
        };
        console.log('📊 Validation summary:', JSON.stringify(validationSummary, null, 2));

        // If neither package.json nor node_modules exists, analysis will be minimal
        if (!validationSummary.canAnalyze) {
          const criticalMsg = 'Cannot perform analysis: No package.json or node_modules found. ' +
                             'Results will be empty or inaccurate.';
          warnings.push({
            type: 'CANNOT_ANALYZE',
            severity: 'CRITICAL',
            message: criticalMsg,
          });
          console.error('❌ CRITICAL:', criticalMsg);
        }

        // Store warnings in upload document for UI display
        if (warnings.length > 0) {
          await event.data.after.ref.update({
            validationWarnings: warnings,
            validationSummary: validationSummary,
          });
        }
      } catch (vErr) {
        console.warn('Warning: failed to validate archive contents; proceeding. Error:', vErr);
      }
      // If no Cloud Run URL was provided or the POST failed, run analyzer
      // locally (best-effort fallback). This keeps behavior backward
      // compatible while allowing opt-in delegation.
      const analyzer = new SCAPlatformAnalyzer(rootToCheck);
      const analysisResults = await analyzer.comprehensiveAnalysis();

      // 5. Save report file locally and upload to reports/
      const reportFileName = `${uploadId}-sca-report.json`;
      const reportPath = path.join(os.tmpdir(), reportFileName);
      fs.writeFileSync(reportPath, JSON.stringify(analysisResults, null, 2));

      const reportUploadPath = `reports/${reportFileName}`;
      await bucket.upload(reportPath, {
        destination: reportUploadPath,
        metadata: {
          contentType: 'application/json',
          metadata: {
            firebaseStorageDownloadTokens: require('uuid').v4(), // Generate access token
          },
        },
      });
      console.log('✅ Uploaded report to', reportUploadPath);

      // Make file publicly readable and get public URL
      const reportFile = bucket.file(reportUploadPath);
      await reportFile.makePublic();
      // Construct public URL
      const reportUrl = `https://storage.googleapis.com/${bucket.name}/${reportUploadPath}`;
      console.log('✅ Generated public URL for report');

      // 6. Store complete results in 'results' collection with multiple access options:
      // - data: Full JSON embedded in Firestore (for immediate UI display)
      // - reportUrl: Signed download URL (for downloading JSON file)
      // - reportPath: Storage path (for direct Storage access)
      await db.collection('results').doc(uploadId).set({
        uid: afterData.uid,
        uploadId,
        reportPath: reportUploadPath,
        reportUrl: reportUrl, // Signed URL for download (7 days)
        data: analysisResults, // Full JSON data for in-app viewing
        analyzedAt: FieldValue.serverTimestamp(),
        status: 'completed',
        summary: analysisResults.reports?.executiveSummary || 'Analysis completed',
        stats: {
          packagesFound: (analysisResults.sbom?.packages || []).length,
          riskScore: analysisResults.riskAssessment?.overallRiskScore || null,
        },
        validationWarnings: warnings.length > 0 ? warnings : null,
      });

      // 7. Update upload document status
      await event.data.after.ref.update({
        status: 'scanned',
        scannedAt: FieldValue.serverTimestamp(),
        analysisSummary: {
          packagesFound: (analysisResults.sbom?.packages || []).length,
          riskLevel: analysisResults.riskAssessment?.overallRiskScore || null,
          reportPath: reportUploadPath,
          reportUrl: reportUrl, // Add download URL
          hasWarnings: warnings.length > 0,
          warningCount: warnings.length,
        },
      });

      // 8. Cleanup local files
      try {
        fs.rmSync(tempZipPath, {force: true});
      } catch (e) {
        // ignore cleanup error
      }
      try {
        fs.rmSync(reportPath, {force: true});
      } catch (e) {
        // ignore cleanup error
      }
      try {
        fs.rmSync(extractPath, {recursive: true, force: true});
      } catch (e) {
        // ignore cleanup error
      }

      console.log('🎉 Analysis completed successfully!');
    } catch (error) {
      console.error('❌ Error in Cloud Function:', error);
      // Update status to 'failed'
      try {
        await event.data.after.ref.update({
          status: 'failed',
          errorMessage: error.message,
          scanFailedAt: FieldValue.serverTimestamp(),
        });
      } catch (e) {
        console.error('Failed to update upload doc with failure state:', e);
      }
    }
  } else {
    console.log('⏸️  No analysis needed - status not changed to not_scanned');
  }

  return null;
});

// 🌍 Test HTTP endpoint
exports.helloWorld = onRequest((req, res) => {
  res.json({
    message: 'Hello from Cloud Functions!',
    timestamp: new Date().toISOString(),
    status: 'working',
  });
});
