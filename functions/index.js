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
// Load the analyzer through a feature-flagged wrapper. Set
// USE_ENHANCED_ANALYZER='true' to enable the full enhanced analyzer.
const SCAPlatformAnalyzer = require('./analyzers/EnhancedSCAPlatform');

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
            metadata: {contentType: 'application/json'},
          });
          console.log('✅ Uploaded report to', reportUploadPath);

          await db.collection('results').doc(uploadId).set({
            uid: afterData.uid,
            uploadId,
            reportPath: reportUploadPath,
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

      // Validate extracted contents: only allow top-level node_modules, package.json,
      // and package-lock.json.
      // If the archive contains a single root folder (common), inspect its contents instead.
      try {
        const allowed = new Set(['node_modules', 'package.json', 'package-lock.json']);
        let rootToCheck = extractPath;
        const topLevel = fs.readdirSync(rootToCheck);
        if (topLevel.length === 1) {
          const single = topLevel[0];
          const singlePath = path.join(rootToCheck, single);
          if (fs.existsSync(singlePath) && fs.statSync(singlePath).isDirectory()) {
            rootToCheck = singlePath;
          }
        }

        const entries = fs.readdirSync(rootToCheck);

        // Detailed logging: list each top-level entry and whether it will be
        // used for analysis or ignored. This helps debugging why a particular
        // uploaded archive did or did not contribute to the analysis.
        console.log('📋 Archive top-level entries:', entries);
        const entryReasons = [];
        entries.forEach((name) => {
          try {
            const p = path.join(rootToCheck, name);
            const stat = fs.existsSync(p) ? fs.statSync(p) : null;
            if (allowed.has(name)) {
              let reason = '';
              if (name === 'package.json') reason = 'dependency manifest';
              else if (name === 'package-lock.json') reason = 'lockfile for SBOM';
              else if (name === 'node_modules') reason = 'installed packages';
              else reason = 'allowed entry';
              entryReasons.push({
                name,
                type: stat && stat.isDirectory() ? 'dir' : 'file',
                action: 'used',
                reason,
              });
            } else {
              entryReasons.push({
                name,
                type: stat && stat.isDirectory() ? 'dir' : 'file',
                action: 'ignored',
                reason: 'not relevant for analysis',
              });
            }
          } catch (e) {
            entryReasons.push({name, type: 'unknown', action: 'error', reason: String(e)});
          }
        });
        console.log('🔍 Archive entry analysis:', JSON.stringify(entryReasons, null, 2));

        const invalid = entries.filter((name) => !allowed.has(name));

        if (invalid.length > 0) {
          const msg = 'Zip contains unexpected files/folders: ' + invalid.join(', ') +
            '. Only node_modules, package.json and package-lock.json are allowed. ' +
            'Please upload a zip with only the expected files.';

          console.warn('❌ Invalid archive contents detected:', invalid);

          // Update upload doc to indicate failure and provide user-friendly message
          try {
            await event.data.after.ref.update({
              status: 'invalid_zip',
              errorMessage: msg,
              scanFailedAt: FieldValue.serverTimestamp(),
            });
          } catch (uErr) {
            console.error('Failed to update upload doc for invalid archive:', uErr);
          }

          // Cleanup temporary files and exit without running the analyzer or writing results
          try {
            fs.rmSync(tempZipPath, {force: true});
          } catch (e) {
            // ignore cleanup error
          }
          try {
            fs.rmSync(extractPath, {recursive: true, force: true});
          } catch (e) {
            // ignore cleanup error
          }

          return null;
        }

        // Log whether the extracted project contains package.json or node_modules
        // This is useful to know if the analyzer will have data to work with.
        const pkgExists = fs.existsSync(path.join(rootToCheck, 'package.json'));
        const nmExists = fs.existsSync(path.join(rootToCheck, 'node_modules'));
        console.log(`📌 package.json present: ${pkgExists}; node_modules present: ${nmExists}`);
        if (!pkgExists && !nmExists) {
          console.warn('⚠️ No package.json/node_modules found; analyzer may skip.');
        }
      } catch (vErr) {
        console.warn('Warning: failed to validate archive contents; proceeding. Error:', vErr);
      }
      // If no Cloud Run URL was provided or the POST failed, run analyzer
      // locally (best-effort fallback). This keeps behavior backward
      // compatible while allowing opt-in delegation.
      const analyzer = new SCAPlatformAnalyzer(extractPath);
      const analysisResults = await analyzer.comprehensiveAnalysis();

      // 5. Save report file locally and upload to reports/
      const reportFileName = `${uploadId}-sca-report.json`;
      const reportPath = path.join(os.tmpdir(), reportFileName);
      fs.writeFileSync(reportPath, JSON.stringify(analysisResults, null, 2));

      const reportUploadPath = `reports/${reportFileName}`;
      await bucket.upload(reportPath, {
        destination: reportUploadPath,
        metadata: {contentType: 'application/json'},
      });
      console.log('✅ Uploaded report to', reportUploadPath);

      // 6. Store lightweight results in 'results' collection and keep the
      // complete analysis JSON in Cloud Storage under `reportUploadPath`.
      // Storing the entire analysis object in Firestore can cause large
      // documents and memory pressure when the function builds them.
      await db.collection('results').doc(uploadId).set({
        uid: afterData.uid,
        uploadId,
        reportPath: reportUploadPath,
        analyzedAt: FieldValue.serverTimestamp(),
        status: 'completed',
        summary: analysisResults.reports?.executiveSummary || 'Analysis completed',
        stats: {
          packagesFound: (analysisResults.sbom?.packages || []).length,
          riskScore: analysisResults.riskAssessment?.overallRiskScore || null,
        },
      });

      // 7. Update upload document status
      await event.data.after.ref.update({
        status: 'scanned',
        scannedAt: FieldValue.serverTimestamp(),
        analysisSummary: {
          packagesFound: (analysisResults.sbom?.packages || []).length,
          riskLevel: analysisResults.riskAssessment?.overallRiskScore || null,
          reportPath: reportUploadPath,
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
