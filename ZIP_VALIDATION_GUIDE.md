# ZIP File Validation Guide

## 📦 Required Files for Analysis

Your ZIP file should contain **3 mandatory files** for accurate analysis:

| File | Severity | Purpose |
|------|----------|---------|
| `package.json` | **CRITICAL** | Project manifest with dependency list |
| `node_modules/` | **HIGH** | Installed packages for detailed license/security analysis |
| `package-lock.json` (or `yarn.lock`) | **MEDIUM** | Lock file for exact version tracking and SBOM generation |

---

## ✅ Valid ZIP Structure

### Perfect ZIP (No Warnings)
```
my-project.zip
├── package.json          ✅ CRITICAL
├── package-lock.json     ✅ MEDIUM (or yarn.lock)
└── node_modules/         ✅ HIGH
    ├── express/
    ├── axios/
    └── ...
```

**Result:** 
- ✅ Analysis completes successfully
- ✅ No warnings
- ✅ All features work: license compatibility, outdated dependencies, supply chain risk, SBOM

---

## ⚠️ Validation Warnings (Analysis Still Runs)

### Missing node_modules (HIGH Warning)
```
my-project.zip
├── package.json          ✅
└── package-lock.json     ✅
```

**Warning:**
```json
{
  "type": "MISSING_FILE",
  "severity": "HIGH",
  "message": "Missing node_modules: Installed packages for detailed analysis. Analysis results may be incomplete or inaccurate.",
  "file": "node_modules"
}
```

**Impact:**
- ⚠️ License analysis will be limited (only direct dependencies from package.json)
- ⚠️ Security analysis may miss transitive vulnerabilities
- ⚠️ SBOM will have fewer packages
- ✅ Analysis still completes with available data

---

### Missing package-lock.json (MEDIUM Warning)
```
my-project.zip
├── package.json          ✅
└── node_modules/         ✅
```

**Warning:**
```json
{
  "type": "MISSING_FILE",
  "severity": "MEDIUM",
  "message": "Missing package-lock.json: Lock file for exact version tracking. Analysis results may be incomplete or inaccurate.",
  "file": "package-lock.json"
}
```

**Impact:**
- ⚠️ SBOM may not have exact versions for all packages
- ⚠️ Outdated dependencies detection less accurate
- ✅ Most analysis features still work

---

### Unexpected Files in ZIP (WARNING)
```
my-project.zip
├── package.json          ✅
├── package-lock.json     ✅
├── node_modules/         ✅
├── src/                  ⚠️ Unexpected
├── public/               ⚠️ Unexpected
├── README.md             ⚠️ Unexpected
└── .git/                 ⚠️ Unexpected
```

**Warning:**
```json
{
  "type": "UNEXPECTED_FILES",
  "severity": "WARNING",
  "message": "Zip contains unexpected files/folders: src, public, README.md, .git. For accurate analysis, upload only: package.json, package-lock.json, and node_modules folder.",
  "files": ["src", "public", "README.md", ".git"]
}
```

**Impact:**
- ⚠️ Analysis may take longer (more files to scan)
- ⚠️ Could cause issues if extraction path has conflicts
- ✅ Analysis completes normally, extra files are ignored

**Recommendation:** For best results, create a clean ZIP with only the 3 required files.

---

## ❌ Critical Issues (Analysis Still Attempts)

### No package.json or node_modules (CRITICAL)
```
my-project.zip
├── src/
├── public/
└── README.md
```

**Warning:**
```json
{
  "type": "CANNOT_ANALYZE",
  "severity": "CRITICAL",
  "message": "Cannot perform analysis: No package.json or node_modules found. Results will be empty or inaccurate."
}
```

**Impact:**
- ❌ No packages to analyze
- ❌ All results will be empty or minimal
- ❌ License compatibility: empty
- ❌ Outdated dependencies: empty
- ❌ Supply chain risk: empty
- ❌ SBOM: only project info, no dependencies

**Analysis still runs but returns mostly empty results.**

---

## 📊 Validation Summary Structure

After upload, check Firestore for validation details:

### In Upload Document
```json
{
  "validationWarnings": [
    {
      "type": "MISSING_FILE",
      "severity": "HIGH",
      "message": "Missing node_modules...",
      "file": "node_modules"
    }
  ],
  "validationSummary": {
    "hasPackageJson": true,
    "hasNodeModules": false,
    "hasLockFile": true,
    "unexpectedFilesCount": 0,
    "warningsCount": 1,
    "canAnalyze": true
  }
}
```

### In Results Document
```json
{
  "validationWarnings": [...],
  "analysisSummary": {
    "packagesFound": 1139,
    "hasWarnings": true,
    "warningCount": 1
  }
}
```

---

## 🎯 How to Create Perfect ZIP

### Method 1: Command Line
```bash
cd /path/to/your/project
zip -r ../my-project.zip package.json package-lock.json node_modules/
```

### Method 2: PowerShell
```powershell
cd C:\path\to\your\project
Compress-Archive -Path package.json,package-lock.json,node_modules -DestinationPath ..\my-project.zip
```

### Method 3: Manual Selection
1. Open your project folder
2. Select only these 3 items:
   - `package.json`
   - `package-lock.json` (or `yarn.lock`)
   - `node_modules/` folder
3. Right-click → Send to → Compressed (zipped) folder
4. Upload the ZIP

---

## 🧪 Testing Scenarios

### Scenario 1: Perfect Upload ✅
**Upload:** All 3 files  
**Expected:** No warnings, full analysis results

### Scenario 2: Missing node_modules ⚠️
**Upload:** Only package.json + package-lock.json  
**Expected:** HIGH warning, limited analysis

### Scenario 3: Extra Files ⚠️
**Upload:** All 3 required + src/ + public/  
**Expected:** WARNING about unexpected files, analysis completes

### Scenario 4: Minimal ❌
**Upload:** Only package.json  
**Expected:** HIGH + MEDIUM warnings, basic analysis only

### Scenario 5: Invalid ❌
**Upload:** No package.json or node_modules  
**Expected:** CRITICAL warning, empty results

---

## 💡 Best Practices

### For Most Accurate Results:
1. ✅ Always include all 3 files
2. ✅ Use clean ZIP (no extra files)
3. ✅ Ensure node_modules is fresh (`npm install` or `npm ci`)
4. ✅ Check validation warnings in UI after upload

### Quick Checklist Before Upload:
- [ ] `package.json` exists
- [ ] `package-lock.json` (or `yarn.lock`) exists
- [ ] `node_modules/` folder exists and populated
- [ ] No extra files included (src/, .git/, etc.)
- [ ] ZIP is under 500MB (Firebase storage limit)

---

## 🚨 Warning Display in UI

When warnings exist, your frontend should display them to users:

### Example UI Message:
```
⚠️ Analysis completed with warnings

The uploaded ZIP file is missing some recommended files:
• HIGH: Missing node_modules folder
  → Install dependencies with `npm install` before creating ZIP

This may affect:
- License compatibility detection
- Supply chain risk assessment
- SBOM completeness

For most accurate results, please re-upload with all required files.
```

---

## 🔍 How Validation Works

1. **Upload ZIP** → Cloud Function triggered
2. **Extract ZIP** → Unzip to temporary directory
3. **Detect Single Root** → If ZIP has one folder, use that as root
4. **Check Required Files** → Validate package.json, node_modules, lock file
5. **Check Unexpected Files** → Warn about extra files
6. **Store Warnings** → Save to Firestore `validationWarnings` field
7. **Run Analysis** → Analyze with available files (never blocks)
8. **Return Results** → Include warnings in response

**Key Point:** Analysis **always runs**, warnings are just **notifications** for better results.

---

## 📚 Related Documentation
- **NEW_FEATURES_IMPLEMENTATION.md** - New SCA features details
- **QUICK_REFERENCE_NEW_FEATURES.md** - Usage guide for new features
- **ANALYSIS_FLOW_AND_TODO.md** - Complete architecture

---

**Remember:** Even with warnings, analysis will complete. Warnings help you understand why results might be limited and how to improve them! 🎯
