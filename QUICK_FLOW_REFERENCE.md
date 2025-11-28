# 🔄 Quick Reference: Current Execution Flow

## **When ZIP File is Uploaded**

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. USER UPLOADS ZIP → Firebase Storage                          │
│    Firestore 'uploads' collection updated                       │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. CLOUD FUNCTION TRIGGERED (functions/index.js)                │
│    - Function: analyzeOnUpload                                  │
│    - Trigger: onDocumentUpdated('uploads/{uploadId}')           │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
              ┌────────┴────────┐
              │ CLOUD_RUN_URL?  │
              └────────┬────────┘
                       │
         ┌─────────────┴─────────────┐
         │                           │
         ▼ YES                       ▼ NO (Fallback)
┌────────────────────┐      ┌────────────────────┐
│ PATH A: Cloud Run  │      │ PATH B: Local      │
└────────┬───────────┘      └────────┬───────────┘
         │                           │
         │                           │
         ▼                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ PATH A: CLOUD RUN DELEGATION                                    │
│                                                                  │
│ 1. Cloud Function POSTs to Cloud Run URL                        │
│    POST /  {bucket, storagePath, uploadId}                      │
│                                                                  │
│ 2. runner.js receives request                                   │
│    - Downloads ZIP from GCS                                     │
│    - Extracts to tmpdir                                         │
│                                                                  │
│ 3. TRY: Load ../analyzers/analyze.js ✅                         │
│    - NEW enhanced analyzer with SBOM                            │
│    - comprehensiveAnalysis() runs:                              │
│      ├─ Research Analysis                                       │
│      ├─ License Analytics                                       │
│      ├─ Security Analysis (npm audit)                           │
│      ├─ SBOM Generation (sbomGenerator.js) ✅                   │
│      └─ Executive Summary                                       │
│                                                                  │
│ 4. FALLBACK: If analyze.js fails → analyzers/index.js ⚠️       │
│    - Uses OLD EnhancedUnifiedAnalyzer                           │
│    - NO built-in SBOM                                           │
│    - Tries external syft (unreliable)                           │
│                                                                  │
│ 5. Returns {report} to Cloud Function                           │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│ PATH B: LOCAL ANALYSIS (Fallback)                               │
│                                                                  │
│ 1. Cloud Function downloads ZIP from GCS                        │
│    - Saves to tmpdir                                            │
│                                                                  │
│ 2. Cloud Function extracts ZIP                                  │
│    - Validates contents (package.json, node_modules only)       │
│                                                                  │
│ 3. Instantiates analyzer ⚠️                                     │
│    const analyzer = new SCAPlatformAnalyzer(extractPath)        │
│    - Currently uses: EnhancedSCAPlatform.js                     │
│    - Which delegates to: SCAPlatformAnalyzerImpl.js             │
│    - NO SBOM GENERATION ❌                                      │
│                                                                  │
│ 4. Runs analysis                                                │
│    await analyzer.comprehensiveAnalysis()                       │
└──────────────────────┬──────────────────────────────────────────┘
                       │
         ┌─────────────┴─────────────┐
         │                           │
         ▼                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ BOTH PATHS CONVERGE                                             │
│                                                                  │
│ 1. Cloud Function saves report to GCS                           │
│    - Path: reports/{uploadId}-sca-report.json                   │
│                                                                  │
│ 2. Cloud Function updates Firestore 'results' collection        │
│    - Sets: packagesFound, riskScore, reportPath                 │
│                                                                  │
│ 3. Cloud Function updates 'uploads' doc status                  │
│    - status: 'scanned'                                          │
│    - scannedAt: timestamp                                       │
│    - analysisSummary: {...}                                     │
│                                                                  │
│ 4. Frontend fetches report and displays results                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## **🔍 Current Problems**

### **Problem 1: Inconsistent SBOM Generation**
```
PATH A (Cloud Run) → analyze.js ✅ → SBOM included
PATH A (Fallback)  → index.js ⚠️ → SBOM missing (uses old analyzer)
PATH B (Local)     → EnhancedSCAPlatform ❌ → SBOM missing
```

### **Problem 2: Multiple Analyzer Versions**
```
analyze.js                      → SBOM ✅, Security ✅, License ✅
EnhancedUnifiedAnalyzer.js      → SBOM ❌, Security ❌, License ✅
SCAPlatformAnalyzerImpl.js      → SBOM ❌, Security ✅, License ✅
```

---

## **✅ Solution: Standardize on analyze.js**

### **Fix 1: Update analyzers/index.js**
```javascript
// BEFORE
const EnhancedUnifiedAnalyzer = require('./EnhancedUnifiedAnalyzer');

// AFTER
const EnhancedUnifiedAnalyzer = require('./analyze');
```

### **Fix 2: Update functions/index.js**
```javascript
// BEFORE (line 13)
const SCAPlatformAnalyzer = require('./analyzers/EnhancedSCAPlatform');

// AFTER
const SCAPlatformAnalyzer = require('./analyzers/analyze');
```

### **Result: Consistent SBOM in All Paths**
```
PATH A (Cloud Run) → analyze.js ✅ → SBOM included
PATH A (Fallback)  → analyze.js ✅ → SBOM included
PATH B (Local)     → analyze.js ✅ → SBOM included
```

---

## **📊 File Hit Order (When ZIP Unzipped)**

### **Cloud Run Path (Primary):**
```
1. runner.js (POST /)
2. ../analyzers/analyze.js (TRY)
   └─ sbomGenerator.js (for SBOM)
3. ../analyzers/index.js (FALLBACK if analyze.js fails)
   └─ EnhancedUnifiedAnalyzer.js (old, no SBOM)
```

### **Local Path (Fallback):**
```
1. functions/index.js (analyzeOnUpload)
2. analyzers/EnhancedSCAPlatform.js
3. analyzers/SCAPlatformAnalyzerImpl.js (no SBOM)
```

---

## **🎯 Priority Actions**

1. ✅ **IMMEDIATE:** Update `analyzers/index.js` line 28
2. ✅ **THIS WEEK:** Update `functions/index.js` line 13
3. 📅 **NEXT WEEK:** Test both paths with same ZIP
4. 📅 **MONTH:** Archive legacy analyzers to `legacy/` folder

---

**See `ANALYSIS_FLOW_AND_TODO.md` for complete details!**
