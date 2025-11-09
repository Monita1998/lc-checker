#!/usr/bin/env node
/*
  pushResultToFirestore.js
  Helper to push a local analysis JSON (tests/analysis-result.json) into Firestore

  Usage:
    set GOOGLE_APPLICATION_CREDENTIALS=C:\path\to\serviceAccountKey.json
    node scripts/pushResultToFirestore.js --uid <USER_UID> --uploadId <UPLOAD_ID> [--path path/to/json]

  The script uses the Google Application Credentials env var or default ADC.
  It writes a document to collection `results` with id equal to uploadId (or auto id if omitted).
  Document shape:
    {
      uid: <uid>,
      uploadId: <uploadId>,
      data: <analyzer JSON>,
      analyzedAt: FieldValue.serverTimestamp(),
      status: 'completed',
      summary: <optional summary from analyzer>
    }
*/

const fs = require('fs');
const path = require('path');
const { Firestore, FieldValue } = require('@google-cloud/firestore');

function usageAndExit(msg) {
  if (msg) console.error(msg);
  console.log('Usage: node scripts/pushResultToFirestore.js --uid <USER_UID> --uploadId <UPLOAD_ID> [--path path/to/json]');
  process.exit(msg ? 1 : 0);
}

const argv = require('minimist')(process.argv.slice(2));
const uid = argv.uid || argv.u;
const uploadId = argv.uploadId || argv.i || argv.id;
const jsonPath = argv.path || argv.p || 'tests/analysis-result.json';

if (!uid) usageAndExit('Error: --uid is required');
if (!uploadId) usageAndExit('Error: --uploadId is required');

const resolvedJsonPath = path.resolve(jsonPath);
if (!fs.existsSync(resolvedJsonPath)) {
  usageAndExit(`Error: JSON file not found at ${resolvedJsonPath}`);
}

let analyzerJson;
try {
  analyzerJson = JSON.parse(fs.readFileSync(resolvedJsonPath, 'utf8'));
} catch (e) {
  console.error('Failed to read/parse JSON:', e);
  process.exit(1);
}

// Firestore client - uses Application Default Credentials / GOOGLE_APPLICATION_CREDENTIALS
const firestore = new Firestore();

async function writeResult() {
  const docRef = firestore.collection('results').doc(uploadId);
  const payload = {
    uid: uid,
    uploadId: uploadId,
    data: analyzerJson,
    analyzedAt: FieldValue.serverTimestamp(),
    status: 'completed',
    summary: analyzerJson.summary || analyzerJson.metadata || null
  };

  await docRef.set(payload, { merge: true });
  console.log(`Wrote results to results/${uploadId}`);
}

writeResult().catch(err => {
  console.error('Failed to write to Firestore:', err);
  process.exit(1);
});
