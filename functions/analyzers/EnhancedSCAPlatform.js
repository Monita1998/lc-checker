/* eslint-disable linebreak-style */
/* EnhancedSCAPlatform shim
 * Delegates to the existing serverless-friendly SCAPlatformAnalyzer implementation.
 * The full enhanced analyzer lives in `EnhancedSCAPlatformReference.js` and can be
 * ported into this file when you're ready to replace the shim.
 */

const SCAPlatformAnalyzerImpl = require('./SCAPlatformAnalyzerImpl');
const EnhancedRef = require('./EnhancedSCAPlatformReference');

/**
 * EnhancedSCAPlatform wrapper that can delegate to either the full enhanced
 * reference implementation or the stable serverless analyzer implementation.
 * Control via env var USE_ENHANCED_ANALYZER='true'.
 */
class EnhancedSCAPlatform {
  /**
   * @param {string} projectPath
   */
  constructor(projectPath) {
    const useEnhanced = String(process.env.USE_ENHANCED_ANALYZER || '').toLowerCase() === 'true';
    if (useEnhanced) {
      this.delegate = new EnhancedRef(projectPath);
    } else {
      this.delegate = new SCAPlatformAnalyzerImpl(projectPath);
    }
  }

  /**
   * Run a comprehensive analysis by delegating to the selected implementation.
   * @return {Promise<object>}
   */
  async comprehensiveAnalysis() {
    return this.delegate.comprehensiveAnalysis();
  }
}

module.exports = EnhancedSCAPlatform;
