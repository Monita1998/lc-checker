const AdmZip = require('adm-zip');

/**
 * Unzips a file to the specified directory.
 * @param {string} zipPath - Path to the zip file.
 * @param {string} extractTo - Directory to extract files to.
 * @return {Promise<string>} The extraction directory path.
 */
async function unzipFile(zipPath, extractTo) {
  const zip = new AdmZip(zipPath);
  zip.extractAllTo(extractTo, true);
  return extractTo;
}
module.exports = {unzipFile};
