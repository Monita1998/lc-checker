const functions = require('firebase-functions');
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {unzipFile} = require('./utils/unzipper');
const SCAPlatformAnalyzer = require('./analyzers/SCAPlatformAnalyzer');

admin.initializeApp();
const storage = admin.storage();

exports.analyzeUploadedZip = functions.storage
  .object()
  .onFinalize(async (object) => {
    try {
      const filePath = object.name;
      const contentType = object.contentType || '';

      // Only process ZIP files
      if (!contentType.includes('zip')) {
        console.log(`Skipping non-zip file: ${filePath}`);
        return null;
      }

      console.log(`🚀 New ZIP uploaded: ${filePath}`);

      const bucket = storage.bucket(object.bucket);
      const fileName = path.basename(filePath);
      const tempZipPath = path.join(os.tmpdir(), fileName);
      const extractPath = path.join(os.tmpdir(), `extract-${Date.now()}`);

      // 1️⃣ Download ZIP to temp dir
      await bucket.file(filePath).download({destination: tempZipPath});
      console.log(`📦 ZIP downloaded to ${tempZipPath}`);

      // 2️⃣ Unzip
      await unzipFile(tempZipPath, extractPath);
      console.log(`📂 Extracted to ${extractPath}`);

      // 3️⃣ Run SCA Analyzer
      const analyzer = new SCAPlatformAnalyzer(extractPath);
      const results = await analyzer.comprehensiveAnalysis();

      // 4️⃣ Save analysis report
      const reportFileName = fileName.replace('.zip', '-sca-report.json');
      const reportPath = path.join(os.tmpdir(), reportFileName);
      fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));

      // Upload report to same folder (e.g. reports/)
      const reportUploadPath = `reports/${reportFileName}`;
      await bucket.upload(reportPath, {
        destination: reportUploadPath,
        metadata: {contentType: 'application/json'},
      });
      console.log(`✅ Report uploaded: ${reportUploadPath}`);

      // 5️⃣ Cleanup: delete local + remote zip
      fs.rmSync(tempZipPath, {force: true});
      fs.rmSync(extractPath, {recursive: true, force: true});
      fs.rmSync(reportPath, {force: true});
      await bucket.file(filePath).delete();
      console.log(`🧹 Deleted original zip: ${filePath}`);

      console.log('🎯 Analysis completed successfully!');
      return null;
    } catch (error) {
      console.error('❌ Analysis failed:', error);
      throw error;
    }
  });
