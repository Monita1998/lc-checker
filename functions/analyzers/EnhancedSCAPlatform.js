/* eslint-disable linebreak-style */
/* EnhancedSCAPlatform shim
 * Delegates to the existing serverless-friendly SCAPlatformAnalyzer implementation.
 * The full enhanced analyzer lives in `EnhancedSCAPlatformReference.js` and can be
 * ported into this file when you're ready to replace the shim.
 */

const SCAPlatformAnalyzerImpl = require('./SCAPlatformAnalyzerImpl');
const EnhancedRef = require('./EnhancedSCAPlatformReference');

console.log('[analyzers] loaded: EnhancedSCAPlatform.js');
console.log('🎯 analyzer loaded: analyzers/EnhancedSCAPlatform.js');

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
      console.log(
        'EnhancedSCAPlatform: USE_ENHANCED_ANALYZER=true -> using EnhancedSCAPlatformReference',
      );
      this.delegate = new EnhancedRef(projectPath);
      this._delegateName = 'EnhancedSCAPlatformReference';
    } else {
      console.log(
        'EnhancedSCAPlatform: using SCAPlatformAnalyzerImpl (serverless-friendly)',
      );
      this.delegate = new SCAPlatformAnalyzerImpl(projectPath);
      this._delegateName = 'SCAPlatformAnalyzerImpl';
    }
  }

  /**
   * Run a comprehensive analysis by delegating to the selected implementation.
   * @return {Promise<object>}
   */
  async comprehensiveAnalysis() {
    console.log(`EnhancedSCAPlatform: delegating comprehensiveAnalysis to ${this._delegateName}`);
    const res = await this.delegate.comprehensiveAnalysis();
    console.log(`EnhancedSCAPlatform: delegate ${this._delegateName} completed`);
    return res;
  }
}

module.exports = EnhancedSCAPlatform;
