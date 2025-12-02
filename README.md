# License Compliance Checker (lc-checker)

lc-checker analyzes Node.js projects for license compliance, security risks, and supply-chain issues, and presents the results via charts and detailed tables.

## Features
- License analytics: top licenses used, risk distribution, compatibility score.
- Security overview: vulnerability severity distribution and detailed findings.
- Outdated dependencies: breakdown by type with recommendations.
- Supply-chain risk: unmaintained/no-repo packages, risk factors and details.
- Project uploads: strict ZIP validation (only `node_modules/`, `package.json`, `package-lock.json`).
- Firebase integration: Authentication, Firestore, Cloud Storage, Cloud Functions for analysis.

## Architecture
- Frontend: React (Create React App) with Chart.js via `react-chartjs-2`.
- Backend: Firebase Cloud Functions (`functions/`) for analysis and result publication.
- Data: Firestore collections `uploads` and `results`; reports stored under `reports/`.

## Setup
Prerequisites: Node.js 18+, Firebase project configured.

Install dependencies:
```
npm install
cd functions
npm install
```

Run locally:
```
npm start
```

Build:
```
npm run build
```

Deploy:
```
firebase deploy --only hosting
firebase deploy --only functions
```

## Usage
1. Upload a project ZIP (must contain only `node_modules/`, `package.json`, `package-lock.json`).
2. Wait for analysis to complete; open the Results page.
3. Switch projects with the dropdown; charts update accordingly.

## Key Files
- `src/Components/ResultsCharts/ChartsPanel.jsx`: Charts and tables rendering.
- `src/utils/transformResultToCharts.js`: Transforms analysis JSON to chart-ready data.
- `src/Components/Upload/upload.jsx`: Upload UI and ZIP validation.
- `functions/`: Cloud Functions analyzers and utilities.

## License
This project is released under a restrictive "All Rights Reserved" license. See `LICENSE` for full terms. Any use beyond personal evaluation requires prior written consent from the owner.

## Future Enhancements
- Dependency tree builder (package-lock.json)
- Duplicate package detection (package-lock.json)
- Circular dependency detection
- License Propagation Through Dependency Chain

## Troubleshooting
- Missing charts: Check `results` document fields and `reportPath` in storage.
- Upload rejected: Ensure only allowed files at ZIP root.
- Build failures: Install missing deps (e.g., `jszip`); try `npm ci` and clear cache.
