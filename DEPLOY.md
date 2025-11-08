# Deploying lc-checker (Hosting + Cloud Functions)

This document describes how to deploy the project locally and via GitHub Actions. The repo already contains `firebase.json` and a `functions/` folder.

Prerequisites
- Node.js 16+ (we use node 18 in the workflow sample)
- npm
- Firebase CLI (for local deploys): `npm install -g firebase-tools`
- A Firebase project created in the Firebase Console. Note its project id (e.g., `my-firebase-project`).

Local deploy (manual)
1. Login to Firebase from your machine (PowerShell):

```powershell
npm i -g firebase-tools
firebase login
```

2. Ensure `firebase.json` is configured for hosting and functions. The repo includes a `functions/` folder; check `firebase.json` for paths.

3. (Optional) Build the frontend locally before deploy:

```powershell
npm ci
npm run build
```

4. Deploy (PowerShell):

```powershell
firebase deploy --project YOUR_FIREBASE_PROJECT_ID --only hosting,functions
```

Replace `YOUR_FIREBASE_PROJECT_ID` with the Firebase project id.

Continuous deploy via GitHub Actions (recommended)

This repo includes a workflow at `.github/workflows/firebase-deploy.yml` that triggers on pushes to `main`. Before the workflow can deploy, add two GitHub repository secrets:

- `FIREBASE_PROJECT` — your Firebase project id (string)
- `FIREBASE_TOKEN` — CI token created with `firebase login:ci`

How to create `FIREBASE_TOKEN` (PowerShell):

```powershell
# Install firebase-tools if you haven't
npm i -g firebase-tools

# Login interactively and create a CI token
firebase login:ci

# That will print a token string you can copy and add to GitHub Secrets
```

Add the two secrets to your GitHub repository: Settings → Secrets → Actions → New repository secret.

Workflow behavior
- On push to `main`, the job:
  - checks out the code
  - installs dependencies with `npm ci`
  - builds the frontend (`npm run build`)
  - installs `firebase-tools`
  - runs `firebase deploy --only hosting,functions` using the provided `FIREBASE_TOKEN` and `FIREBASE_PROJECT`

Troubleshooting
- If the workflow fails with authentication errors, verify `FIREBASE_TOKEN` is correct and not expired.
- If `functions` deployment fails due to Node version mismatch, ensure your Firebase project supports the runtime in `functions/package.json` (e.g., node 18).
- For debugging locally, use `firebase deploy --only hosting,functions --debug` to get verbose logs.

Next steps after deploy
- Upload a small sample zip (tests/extracted-sample or create a tiny node project zip) to the app and verify the Cloud Function runs and a `results` document is created in Firestore. Check Storage for `reports/` file uploads.

If you'd like, I can:
- scaffold a staging workflow that deploys from `staging` branch to a staging Firebase project,
- or implement a GitHub Actions job that tests the analyzer with a small sample archive before deploy.
