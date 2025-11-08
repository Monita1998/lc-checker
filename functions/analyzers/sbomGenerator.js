const fs = require('fs');
const path = require('path');

/**
 * Lightweight SBOM generator that does NOT rely on Docker or external native tools.
 * Produces an SPDX-like JSON structure with a `packages` array so existing code
 * can consume it (e.g. analysisResults.sbom.packages.length).
 *
 * Supported strategies (in order):
 *  - npm: parse package-lock.json (preferred)
 *  - npm fallback: parse package.json dependencies/devDependencies
 *  - python: parse requirements.txt (simple 'pkg==version' lines)
 */
/**
 * Generate an SPDX-like SBOM for the provided project path.
 * @param {string} projectPath - Path to the project root to analyze
 * @return {Promise<object>} SPDX-like SBOM document
 */
async function generateSBOM(projectPath) {
  const root = path.resolve(projectPath);

  // Helpers
  /**
   * Build a minimal SPDX-like package object for the SBOM.
   * @param {string} name - Package name
   * @param {string} version - Package version string
   * @param {object} [opts] - Optional metadata (resolved, license, description)
   * @return {object} SPDX-like package object
   */
  const makeSpdxPackage = (name, version, opts = {}) => {
    const safeId = `SPDXRef-Package-${name}-${version}`.replace(/[^a-zA-Z0-9-_.]/g, '-');
    return {
      SPDXID: safeId,
      name,
      versionInfo: version || '0.0.0',
      downloadLocation: opts.resolved || 'NOASSERTION',
      licenseConcluded: opts.license || 'NOASSERTION',
      licenseDeclared: opts.license || 'NOASSERTION',
      copyrightText: 'NOASSERTION',
      description: opts.description || '',
      externalRefs: [
        {
          referenceCategory: 'PACKAGE-MANAGER',
          referenceType: 'purl',
          referenceLocator: `pkg:npm/${name}@${version}`,
        },
      ],
    };
  };

  // 1) Try package-lock.json
  const lockPath = path.join(root, 'package-lock.json');
  if (fs.existsSync(lockPath)) {
    try {
      const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
      const deps = lock.dependencies || {};
      const packages = Object.entries(deps).map(([pkgName, pkgData]) => {
        let version = '0.0.0';
        if (pkgData.version) version = pkgData.version;
        else if (pkgData.resolved) version = extractVersionFromResolved(pkgData.resolved);

        return makeSpdxPackage(pkgName, version, {
          resolved: pkgData.resolved || 'NOASSERTION',
          license: pkgData.license || 'NOASSERTION',
          description: pkgData.description || '',
        });
      });

      const docName1 = path.basename(root);
      const documentNamespace1 = 'https://example.org/spdxdocs/' + docName1 + '-' + Date.now();

      return {
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
      };
    } catch (e) {
      // fallthrough to other strategies
      console.warn('Failed to parse package-lock.json for SBOM:', e.message);
    }
  }

  // 2) Try package.json dependencies
  const pjPath = path.join(root, 'package.json');
  if (fs.existsSync(pjPath)) {
    try {
      const pj = JSON.parse(fs.readFileSync(pjPath, 'utf8'));
      const deps = Object.assign({}, pj.dependencies || {}, pj.devDependencies || {});
      const packages = Object.entries(deps).map(([pkgName, pkgRange]) => {
        // package.json often has ranges; we will use the range as versionInfo
        return makeSpdxPackage(pkgName, pkgRange, {license: 'NOASSERTION'});
      });

      const docName2 = pj.name || path.basename(root);
      const documentNamespace2 = 'https://example.org/spdxdocs/' + docName2 + '-' + Date.now();

      return {
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
      };
    } catch (e) {
      console.warn('Failed to parse package.json for SBOM:', e.message);
    }
  }

  // 3) Try Python requirements.txt (very simple parser)
  const reqPath = path.join(root, 'requirements.txt');
  if (fs.existsSync(reqPath)) {
    try {
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

      const docName3 = path.basename(root);
      const documentNamespace3 = 'https://example.org/spdxdocs/' + docName3 + '-' + Date.now();

      return {
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
      };
    } catch (e) {
      console.warn('Failed to parse requirements.txt for SBOM:', e.message);
    }
  }

  // 4) Last resort: do a lightweight recursive search for package.json files under project
  try {
    const packages = [];
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
          } catch (e) {
            // ignore malformed package.json
          }
        }
        if (ent.isDirectory()) walk(full);
      }
    };

    walk(root);

    if (packages.length > 0) {
      const docName4 = path.basename(root);
      const documentNamespace4 = 'https://example.org/spdxdocs/' + docName4 + '-' + Date.now();

      return {
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
      };
    }
  } catch (e) {
    console.warn('Fallback SBOM scan failed:', e.message);
  }

  // If everything fails, return empty SBOM
  const docName5 = path.basename(root);
  const documentNamespace5 = 'https://example.org/spdxdocs/' + docName5 + '-' + Date.now();
  return {
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
  };
}

/**
 * Extract a semver-like version string from a resolved package tarball URL.
 * Example matches: "-1.2.3.tgz" or "-1.2.3-beta.tgz".
 * @param {string} resolved - The resolved URL or path from package-lock.json
 * @return {string} extracted version (or '0.0.0' when no version found)
 */
function extractVersionFromResolved(resolved) {
  // Try to extract /package/-/package-1.2.3.tgz or @scope/name/-/name-1.2.3.tgz
  const m = resolved && resolved.match(/-(\d+\.\d+\.\d+(?:[-.][^/]+)*)\.tgz$/);
  return m ? m[1] : '0.0.0';
}

module.exports = {generateSBOM};
