const fs = require('fs');
const path = require('path');

console.log('🎯 analyzer loaded: analyzers/sbomGenerator.js');

/**
 * ============================================================================
 * SBOM Generator - Docker/Cloud Run Ready
 * ============================================================================
 *
 * Lightweight Software Bill of Materials (SBOM) generator that produces SPDX 2.3
 * compliant JSON documents. Designed for Docker/Cloud Run environments with
 * comprehensive logging and error handling for production observability.
 *
 * KEY FEATURES:
 * - No external dependencies (uses only Node.js built-ins: fs, path)
 * - Multiple fallback strategies for maximum compatibility
 * - Node_modules enrichment for complete package metadata
 * - Detailed logging suitable for Docker/Cloud Run log aggregation
 * - Comprehensive error handling with stack traces
 * - Performance metrics (generation time, enrichment stats)
 *
 * SUPPORTED STRATEGIES (in order of preference):
 * 1. package-lock.json - Most accurate, includes resolved URLs and integrity hashes
 * 2. package.json - Fallback for npm projects without lock file
 * 3. requirements.txt - Python projects (simple parser for pkg==version format)
 * 4. Recursive project scan - Searches for all package.json files in project tree
 * 5. Empty SBOM - Last resort when no package manifests are found
 *
 * OUTPUT FORMAT:
 * SPDX 2.3 JSON with:
 * - packages[]: Array of package objects with SPDXID, name, version, license, etc.
 * - metadata: Generation time, strategies used, file summary, enrichment statistics
 *
 * DOCKER/CLOUD RUN COMPATIBILITY:
 * - All console.log/warn/error output goes to stdout/stderr for log aggregation
 * - No file system writes (read-only operation)
 * - Synchronous file operations for predictable behavior in containers
 * - Detailed error context for remote debugging
 * ============================================================================
 */

/**
 * Generate an SPDX 2.3 compliant SBOM for the provided project path.
 *
 * This is the main entry point. It tries multiple strategies to extract package
 * information and enriches the result with data from node_modules when available.
 *
 * @param {string} projectPath - Absolute path to the project root to analyze
 * @return {Promise<object>} SPDX 2.3 JSON document with packages[] and metadata
 */
async function generateSBOM(projectPath) {
  const root = path.resolve(projectPath || '.');
  const start = Date.now();
  const strategiesUsed = [];

  /**
   * UTILITY: Extract repository URL from package.json
   *
   * Handles both string format ("git://...") and object format ({url: "git://..."}).
   * Logs warnings when extraction fails for debugging in Docker/Cloud Run logs.
   *
   * @param {object} pj - Parsed package.json object
   * @return {string} Repository URL or empty string
   */
  const getRepoUrl = (pj) => {
    try {
      if (!pj || !pj.repository) return '';
      if (typeof pj.repository === 'string') return pj.repository;
      if (pj.repository && pj.repository.url) return pj.repository.url;
    } catch (error) {
      console.warn('sbomGenerator: error extracting repo URL:', error.message);
    }
    return '';
  };

  /**
   * UTILITY: Build file system summary for metadata
   *
   * Checks for existence and size of key package manifest files:
   * - package.json, package-lock.json, yarn.lock, node_modules
   *
   * Logs warnings for stat failures (helpful for Docker volume mount debugging).
   *
   * @return {object} File summary with boolean flags and sizes
   */
  const buildFileSummary = () => {
    try {
      const stat = (p) => {
        try {
          return fs.statSync(p);
        } catch (error) {
          console.warn(`sbomGenerator: cannot stat ${p}:`, error.message);
          return null;
        }
      };

      const pj = stat(path.join(root, 'package.json'));
      const pl = stat(path.join(root, 'package-lock.json'));
      const yl = stat(path.join(root, 'yarn.lock'));
      const nm = stat(path.join(root, 'node_modules'));

      return {
        packageJson: !!pj,
        packageJsonSize: pj ? pj.size : 0,
        packageLock: !!pl,
        packageLockSize: pl ? pl.size : 0,
        yarnLock: !!yl,
        yarnLockSize: yl ? yl.size : 0,
        nodeModules: !!nm,
      };
    } catch (error) {
      console.error('sbomGenerator: error building file summary:', error.message);
      return {};
    }
  };

  /**
   * UTILITY: Create SPDX 2.3 compliant package object
   *
   * Generates a standardized package entry with:
   * - SPDXID: Unique identifier (sanitized for spec compliance)
   * - name, versionInfo: Package identification
   * - downloadLocation, licenseConcluded, licenseDeclared: SPDX required fields
   * - Optional: description, externalRefs, integrity, resolved URL
   *
   * @param {string} name - Package name
   * @param {string} version - Package version
   * @param {object} opts - Optional fields (license, description, extra metadata)
   * @return {object} SPDX package object
   */
  const makeSpdxPackage = (name, version, opts = {}) => {
    const safeId = `SPDXRef-Package-${name}-${version}`.replace(/[^a-zA-Z0-9-_.]/g, '-');
    return Object.assign({
      SPDXID: safeId,
      name,
      versionInfo: version || '0.0.0',
      downloadLocation: opts.resolved || 'NOASSERTION',
      licenseConcluded: opts.license || 'NOASSERTION',
      licenseDeclared: opts.license || 'NOASSERTION',
      copyrightText: 'NOASSERTION',
      description: opts.description || '',
      externalRefs: opts.externalRefs || [],
    }, opts.extra || {});
  };

  /**
   * ENRICHMENT: Scan node_modules to augment package metadata
   *
   * This function significantly enhances SBOM quality by:
   * 1. Scanning installed packages in node_modules/
   * 2. Reading each package's actual package.json
   * 3. Adding license, description, repository data from source
   * 4. Handling both scoped (@org/pkg) and normal packages
   *
   * DOCKER COMPATIBILITY:
   * - Works with bind-mounted node_modules or COPY'd in Dockerfile
   * - Logs progress for observability in container logs
   * - Gracefully skips if node_modules not present
   *
   * ENRICHMENT STATS:
   * - Tracks packages added and packages updated
   * - Final count logged for verification
   *
   * @param {Array} packages - Existing packages array to enrich
   * @return {Array} Enriched packages array
   */
  const enrichFromNodeModules = (packages) => {
    try {
      const nmRoot = path.join(root, 'node_modules');
      if (!fs.existsSync(nmRoot)) {
        console.log('sbomGenerator: node_modules not found, skipping enrichment');
        return packages;
      }

      console.log('sbomGenerator: enriching packages from node_modules');
      const pkgMap = {};
      packages.forEach((p) => {
        if (p && p.name) pkgMap[p.name] = p;
      });

      const entries = fs.readdirSync(nmRoot, {withFileTypes: true});
      let enrichedCount = 0;

      for (const ent of entries) {
        if (!ent.isDirectory()) continue;

        // scoped packages
        if (ent.name.startsWith('@')) {
          const scopeDir = path.join(nmRoot, ent.name);
          try {
            const scoped = fs.readdirSync(scopeDir, {withFileTypes: true});
            for (const s of scoped) {
              if (!s.isDirectory()) continue;
              const pjson = path.join(scopeDir, s.name, 'package.json');
              try {
                const pj = JSON.parse(fs.readFileSync(pjson, 'utf8'));
                const nmName = `${ent.name}/${s.name}`;
                const repoUrl = getRepoUrl(pj);
                if (!pkgMap[nmName]) {
                  packages.push(makeSpdxPackage(nmName, pj.version || '0.0.0', {
                    license: pj.license || 'NOASSERTION',
                    description: pj.description || '',
                    extra: {repository: repoUrl || ''},
                  }));
                  enrichedCount++;
                } else {
                  const existing = pkgMap[nmName];
                  existing.repository = existing.repository || repoUrl;
                  existing.description = existing.description || pj.description || '';
                  enrichedCount++;
                }
              } catch (error) {
                const pkgId = `${ent.name}/${s.name}`;
                console.warn('sbomGenerator: failed to read scoped package', pkgId, error.message);
              }
            }
          } catch (error) {
            console.warn('sbomGenerator: failed to read scope directory', ent.name, error.message);
          }

          continue;
        }

        // normal package folder
        const pjson = path.join(nmRoot, ent.name, 'package.json');
        try {
          const pj = JSON.parse(fs.readFileSync(pjson, 'utf8'));
          const repoUrl = getRepoUrl(pj);
          if (!pkgMap[ent.name]) {
            packages.push(makeSpdxPackage(ent.name, pj.version || '0.0.0', {
              license: pj.license || 'NOASSERTION',
              description: pj.description || '',
              extra: {repository: repoUrl || ''},
            }));
            enrichedCount++;
          } else {
            const existing = pkgMap[ent.name];
            existing.repository = existing.repository || repoUrl;
            existing.description = existing.description || pj.description || '';
            enrichedCount++;
          }
        } catch (error) {
          console.warn('sbomGenerator: failed to read package', ent.name, error.message);
        }
      }

      console.log(`sbomGenerator: enriched ${enrichedCount} packages from node_modules`);
    } catch (error) {
      console.error('sbomGenerator: error during enrichment:', error.message);
      console.error('Stack:', error.stack);
    }

    return packages;
  };

  /**
   * FINALIZATION: Add metadata, enrich packages, and log completion
   *
   * This function:
   * 1. Calls enrichment to scan node_modules
   * 2. Calculates generation time and enrichment statistics
   * 3. Attaches comprehensive metadata to SBOM document:
   *    - generationTimeMs: Performance metric for monitoring
   *    - strategiesUsed: Which detection methods succeeded
   *    - fileSummary: Manifest files present in project
   *    - enrichmentStats: Before/after package counts, packages added
   *
   * DOCKER/CLOUD RUN OBSERVABILITY:
   * - Logs completion with package count and timing
   * - Logs strategy used for debugging
   * - Stack traces on errors for remote troubleshooting
   *
   * @param {object} doc - SBOM document to finalize
   * @param {string} strategy - Strategy name that generated this SBOM
   * @return {object} Finalized SBOM with metadata
   */
  const finalize = (doc, strategy) => {
    try {
      if (strategy) strategiesUsed.push(strategy);
      doc = doc || {};
      doc.packages = doc.packages || [];
      const beforeEnrich = doc.packages.length;
      doc.packages = enrichFromNodeModules(doc.packages);
      const afterEnrich = doc.packages.length;

      const pkgCount = doc.packages.length;
      const elapsed = Date.now() - start;

      doc.metadata = doc.metadata || {};
      doc.metadata.generationTimeMs = elapsed;
      doc.metadata.strategiesUsed = Array.from(new Set(strategiesUsed));
      doc.metadata.fileSummary = buildFileSummary();
      doc.metadata.enrichmentStats = {
        beforeEnrichment: beforeEnrich,
        afterEnrichment: afterEnrich,
        packagesAdded: afterEnrich - beforeEnrich,
      };

      console.log('🎯 sbomGenerator: generateSBOM done - packages:', pkgCount);
      console.log('sbomGenerator: strategy:', strategy, 'time:', elapsed, 'ms');
    } catch (error) {
      console.error('sbomGenerator: error during finalization:', error.message);
      console.error('Stack:', error.stack);
    }
    return doc;
  };

  /**
   * ===========================================================================
   * STRATEGY 1: package-lock.json (NPM Lock File)
   * ===========================================================================
   *
   * PREFERRED STRATEGY for npm projects.
   *
   * Extracts complete dependency tree with:
   * - Exact versions (not ranges)
   * - Resolved URLs (download locations)
   * - Integrity hashes (SRI for verification)
   * - License information when available
   *
   * This provides the most accurate and complete SBOM for npm-based projects.
   */
  const lockPath = path.join(root, 'package-lock.json');
  if (fs.existsSync(lockPath)) {
    try {
      console.log('sbomGenerator: attempting package-lock.json strategy');
      strategiesUsed.push('package-lock');
      const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
      const deps = lock.dependencies || {};
      const packages = Object.entries(deps).map(([pkgName, pkgData]) => {
        let version = '0.0.0';
        if (pkgData.version) version = pkgData.version;
        else if (pkgData.resolved) version = extractVersionFromResolved(pkgData.resolved);

        const extra = {};
        if (pkgData.integrity) extra.integrity = pkgData.integrity;
        if (pkgData.resolved) extra.resolved = pkgData.resolved;

        return makeSpdxPackage(pkgName, version, {
          license: pkgData.license || 'NOASSERTION',
          description: pkgData.description || '',
          externalRefs: [
            {
              referenceCategory: 'PACKAGE-MANAGER',
              referenceType: 'purl',
              referenceLocator: `pkg:npm/${pkgName}@${version}`,
            },
          ],
          extra,
        });
      });

      console.log(`sbomGenerator: package-lock.json found ${packages.length} packages`);
      const docName1 = path.basename(root);
      const documentNamespace1 = 'https://example.org/spdxdocs/' + docName1 + '-' + Date.now();

      return finalize({
        spdxVersion: 'SPDX-2.3',
        dataLicense: 'CC0-1.0',
        SPDXID: 'SPDXRef-DOCUMENT',
        name: `SBOM-for-${docName1}`,
        documentNamespace: documentNamespace1,
        creationInfo: {
          created: new Date().toISOString(),
          creators: ['Tool: license-checker-sbomGenerator'],
        },
        packages,
      }, 'package-lock');
    } catch (error) {
      console.error('sbomGenerator: Failed to parse package-lock.json:', error.message);
      console.error('Stack:', error.stack);
    }
  }

  /**
   * ===========================================================================
   * STRATEGY 2: package.json (NPM Manifest)
   * ===========================================================================
   *
   * FALLBACK for npm projects without package-lock.json.
   *
   * Extracts dependencies from package.json:
   * - dependencies + devDependencies
   * - Version ranges (not exact versions)
   * - No integrity hashes or resolved URLs
   *
   * Less precise than package-lock.json but ensures we capture dependencies
   * even in projects without lock files.
   */
  const pjPath = path.join(root, 'package.json');
  if (fs.existsSync(pjPath)) {
    try {
      console.log('sbomGenerator: attempting package.json strategy');
      strategiesUsed.push('package-json');
      const pj = JSON.parse(fs.readFileSync(pjPath, 'utf8'));
      const deps = Object.assign({}, pj.dependencies || {}, pj.devDependencies || {});
      const packages = Object.entries(deps).map(([pkgName, pkgRange]) => {
        // package.json often has ranges; we will use the range as versionInfo
        return makeSpdxPackage(pkgName, pkgRange, {license: 'NOASSERTION'});
      });

      console.log(`sbomGenerator: package.json found ${packages.length} dependencies`);
      const docName2 = pj.name || path.basename(root);
      const documentNamespace2 = 'https://example.org/spdxdocs/' + docName2 + '-' + Date.now();

      return finalize({
        spdxVersion: 'SPDX-2.3',
        dataLicense: 'CC0-1.0',
        SPDXID: 'SPDXRef-DOCUMENT',
        name: `SBOM-for-${docName2}`,
        documentNamespace: documentNamespace2,
        creationInfo: {
          created: new Date().toISOString(),
          creators: ['Tool: license-checker-sbomGenerator'],
        },
        packages,
      }, 'package-json');
    } catch (error) {
      console.error('sbomGenerator: Failed to parse package.json:', error.message);
      console.error('Stack:', error.stack);
    }
  }

  /**
   * ===========================================================================
   * STRATEGY 3: requirements.txt (Python)
   * ===========================================================================
   *
   * PYTHON PROJECT SUPPORT.
   *
   * Simple parser for pip requirements.txt format:
   * - Supports: pkg==1.2.3, pkg>=1.2, pkg<2.0 syntax
   * - Extracts package name and version/constraint
   * - No license or metadata (not in requirements.txt)
   *
   * LIMITATIONS:
   * - Basic parser, doesn't handle all pip syntax (-e, git+, etc.)
   * - No dependency resolution (only top-level requirements)
   *
   * For better Python SBOM, consider using pip-tools or similar in Dockerfile.
   */
  const reqPath = path.join(root, 'requirements.txt');
  if (fs.existsSync(reqPath)) {
    try {
      console.log('sbomGenerator: attempting requirements.txt strategy');
      strategiesUsed.push('requirements-txt');
      const lines = fs.readFileSync(reqPath, 'utf8')
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      const packages = lines.map((line) => {
        // simple 'pkg==1.2.3' or 'pkg>=1.2' etc. We'll split on first non-name char
        const m = line.match(/^([a-zA-Z0-9_.+-]+)\s*(?:==|>=|<=|~=|>|<)?\s*(.*)$/);
        const name = m ? m[1] : line;
        const version = (m && m[2]) ? m[2] : '0.0.0';
        return {
          SPDXID: `SPDXRef-Package-${name}-${version}`,
          name,
          versionInfo: version,
          downloadLocation: 'NOASSERTION',
          licenseConcluded: 'NOASSERTION',
          licenseDeclared: 'NOASSERTION',
          copyrightText: 'NOASSERTION',
          description: '',
          externalRefs: [],
        };
      });

      console.log(`sbomGenerator: requirements.txt found ${packages.length} packages`);
      const docName3 = path.basename(root);
      const documentNamespace3 = 'https://example.org/spdxdocs/' + docName3 + '-' + Date.now();

      return finalize({
        spdxVersion: 'SPDX-2.3',
        dataLicense: 'CC0-1.0',
        SPDXID: 'SPDXRef-DOCUMENT',
        name: `SBOM-for-${docName3}`,
        documentNamespace: documentNamespace3,
        creationInfo: {
          created: new Date().toISOString(),
          creators: ['Tool: license-checker-sbomGenerator'],
        },
        packages,
      }, 'requirements-txt');
    } catch (error) {
      console.error('sbomGenerator: Failed to parse requirements.txt:', error.message);
      console.error('Stack:', error.stack);
    }
  }

  /**
   * ===========================================================================
   * STRATEGY 4: Recursive Project Scan
   * ===========================================================================
   *
   * LAST-RESORT automatic discovery.
   *
   * Recursively walks project directory tree looking for package.json files:
   * - Finds packages in subdirectories (monorepos, nested projects)
   * - Skips node_modules to avoid huge scans
   * - Extracts name and version from each package.json found
   *
   * USE CASES:
   * - Monorepo projects without root package-lock.json
   * - Multi-language projects with npm packages in subdirs
   * - Projects with unconventional structure
   *
   * DOCKER CONSIDERATION:
   * - Only scans files present in container (respects .dockerignore)
   * - Can be slow on large projects, but thorough
   */
  try {
    console.log('sbomGenerator: attempting project-scan strategy (recursive)');
    const packages = [];

    /**
     * Recursive directory walker
     *
     * Traverses directory tree, finding all package.json files.
     * Skips node_modules to prevent scanning thousands of dependency packages.
     *
     * @param {string} dir - Directory to scan
     */
    const walk = (dir) => {
      const entries = fs.readdirSync(dir, {withFileTypes: true});
      for (const ent of entries) {
        const full = path.join(dir, ent.name);
        if (ent.isDirectory() && ent.name === 'node_modules') {
          // skip node_modules to avoid huge scans
          continue;
        }
        if (ent.isFile() && ent.name === 'package.json') {
          try {
            const pj = JSON.parse(fs.readFileSync(full, 'utf8'));
            if (pj.name) {
              packages.push(
                makeSpdxPackage(
                  pj.name,
                  pj.version || '0.0.0',
                  {description: pj.description || ''},
                ),
              );
            }
          } catch (error) {
            console.warn('sbomGenerator: failed to parse package.json at', full, error.message);
          }
        }
        if (ent.isDirectory()) {
          try {
            walk(full);
          } catch (error) {
            console.warn('sbomGenerator: failed to walk directory', full, error.message);
          }
        }
      }
    };

    walk(root);

    if (packages.length > 0) {
      console.log(`sbomGenerator: project-scan found ${packages.length} packages`);
      const docName4 = path.basename(root);
      const documentNamespace4 = 'https://example.org/spdxdocs/' + docName4 + '-' + Date.now();

      return finalize({
        spdxVersion: 'SPDX-2.3',
        dataLicense: 'CC0-1.0',
        SPDXID: 'SPDXRef-DOCUMENT',
        name: `SBOM-for-${docName4}`,
        documentNamespace: documentNamespace4,
        creationInfo: {
          created: new Date().toISOString(),
          creators: ['Tool: license-checker-sbomGenerator'],
        },
        packages,
      }, 'project-scan');
    }
  } catch (error) {
    console.error('sbomGenerator: Fallback SBOM scan failed:', error.message);
    console.error('Stack:', error.stack);
  }

  /**
   * ===========================================================================
   * STRATEGY 5: Empty SBOM (Fallback)
   * ===========================================================================
   *
   * FINAL FALLBACK when no package manifests are found.
   *
   * Returns a valid SPDX 2.3 document with:
   * - Empty packages array
   * - Full metadata and generation stats
   * - "empty" in strategiesUsed
   *
   * This ensures the analyzer always returns a valid SBOM structure,
   * even for projects without dependencies or unrecognized formats.
   *
   * DOCKER/CLOUD RUN:
   * - Warning logged for visibility in container logs
   * - Indicates possible issue with uploaded file or extraction
   */
  console.warn('sbomGenerator: All strategies failed, returning empty SBOM');
  const docName5 = path.basename(root);
  const documentNamespace5 = 'https://example.org/spdxdocs/' + docName5 + '-' + Date.now();
  strategiesUsed.push('empty');
  return finalize({
    spdxVersion: 'SPDX-2.3',
    dataLicense: 'CC0-1.0',
    SPDXID: 'SPDXRef-DOCUMENT',
    name: `SBOM-for-${docName5}`,
    documentNamespace: documentNamespace5,
    creationInfo: {
      created: new Date().toISOString(),
      creators: ['Tool: license-checker-sbomGenerator'],
    },
    packages: [],
  }, 'empty');
}

/**
 * HELPER: Extract semantic version from package tarball URL
 *
 * Parses npm registry URLs to extract version strings:
 * - Input: "https://registry.npmjs.org/pkg/-/pkg-1.2.3.tgz"
 * - Output: "1.2.3"
 *
 * Handles:
 * - Standard packages: /package/-/package-1.2.3.tgz
 * - Scoped packages: /@scope/name/-/name-1.2.3.tgz
 * - Pre-release versions: 1.2.3-beta.1, 1.2.3-rc.2
 *
 * Used as fallback when package-lock.json has resolved URL but missing version field.
 *
 * @param {string} resolved - The resolved URL or path from package-lock.json
 * @return {string} Extracted version string or '0.0.0' if extraction fails
 */
function extractVersionFromResolved(resolved) {
  // Try to extract /package/-/package-1.2.3.tgz or @scope/name/-/name-1.2.3.tgz
  const m = resolved && resolved.match(/-(\d+\.\d+\.\d+(?:[-.][^/]+)*)\.tgz$/);
  return m ? m[1] : '0.0.0';
}

module.exports = {generateSBOM};
