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
exports.analyzeOnUpload = onDocumentUpdated('uploads/{uploadId}', async (event) => {
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

      // 2. Download ZIP from Storage (look up storagePath in upload doc)
      const uploadDoc = afterData;
      const storagePath = uploadDoc.storagePath || afterData.storagePath || afterData.downloadURL;
      if (!storagePath) throw new Error('No storagePath found on upload document');

      const bucket = storage.bucket();
      const fileName = path.basename(storagePath);
      const tempZipPath = path.join(os.tmpdir(), fileName);
      const extractPath = path.join(os.tmpdir(), `extract-${Date.now()}`);

      console.log('📦 Downloading zip from storage:', storagePath);
      await bucket.file(storagePath).download({destination: tempZipPath});
      console.log('📦 Downloaded to', tempZipPath);

      // 3. Unzip
      await unzipFile(tempZipPath, extractPath);
      console.log('📂 Extracted to', extractPath);

      // 4. Run analyzer
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

      // 6. Store results in 'results' collection
      await db.collection('results').doc(uploadId).set({
        uid: afterData.uid,
        uploadId,
        data: analysisResults,
        analyzedAt: FieldValue.serverTimestamp(),
        status: 'completed',
        summary: analysisResults.reports?.executiveSummary || 'Analysis completed',
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
