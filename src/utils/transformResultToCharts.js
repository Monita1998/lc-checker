/**
 * transformResultToCharts.js
 *
 * Convert the canonical analysis JSON into chart-ready datasets.
 * This file implements the mapping you provided:
 *
 * Chart Title                Data Source                                           Type
 * License Distribution       licenseCompliance.summary.licenseDistribution          Pie
 * License Risk Profile      licenseCompliance.licenseUsage.riskProfile            Bar/Doughnut
 * License Quality Score     licenseCompliance.qualityMetrics                      Bar
 * Risk Distribution         licenseCompliance.riskDistribution.percentages        Pie
 * Vulnerabilities by Severity securityVulnerabilities.summary.bySeverity            Bar
 * Overall Risk Score        summary.summaryMetrics.overallRiskScore               Gauge
 *
 * The function returns an object with keys for each chart and a normalized
 * Chart.js-compatible shape: { type, data, options, meta }.
 */

const DEFAULT_COLORS = [
  '#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f', '#edc949', '#b07aa1', '#ff9da7', '#9c755f', '#bab0ac'
];

function getAtPath(obj, path) {
  if (!obj || !path) return undefined;
  return path.split('.').reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj);
}

function asLabelsAndData(map) {
  if (!map) return { labels: [], data: [] };
  if (Array.isArray(map)) {
    // array of values => labels as indices
    return { labels: map.map((_, i) => String(i)), data: map.map(x => Number(x) || 0) };
  }
  if (typeof map === 'object') {
    const labels = Object.keys(map);
    const data = labels.map(k => {
      const v = map[k];
      return (typeof v === 'number') ? v : Number(v) || 0;
    });
    return { labels, data };
  }
  return { labels: [String(map)], data: [Number(map) || 0] };
}

function buildPie(labels, data) {
  return {
    type: 'pie',
    data: {
      labels,
      datasets: [{ data, backgroundColor: DEFAULT_COLORS.slice(0, labels.length) }]
    },
    options: { responsive: true, maintainAspectRatio: false }
  };
}

function buildBar(labels, data) {
  return {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Count', data, backgroundColor: DEFAULT_COLORS.slice(0, labels.length) }] },
    options: { responsive: true, maintainAspectRatio: false }
  };
}

function buildDoughnut(labels, data) {
  return {
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: DEFAULT_COLORS.slice(0, labels.length) }] },
    options: { responsive: true, maintainAspectRatio: false }
  };
}

module.exports = function transformResultToCharts(analysis) {
  const charts = {};

  // 1) License Distribution (Pie) - expected object: {MIT:10, Apache-2.0:5}
  const licenseDist = getAtPath(analysis, 'licenseCompliance.summary.licenseDistribution') ||
    getAtPath(analysis, 'licenseCompliance.summary.licenseCounts');
  const l1 = asLabelsAndData(licenseDist);
  // filter out zero-value labels for pie charts so legend doesn't show zero entries
  const filteredLicense = l1.labels.reduce((acc, label, idx) => {
    if ((l1.data[idx] || 0) > 0) { acc.labels.push(label); acc.data.push(l1.data[idx]); }
    return acc;
  }, { labels: [], data: [] });
  charts.licenseDistribution = buildPie(filteredLicense.labels, filteredLicense.data);

  // 2) License Risk Profile (Bar/Doughnut)
  const riskProfile = getAtPath(analysis, 'licenseCompliance.licenseUsage.riskProfile') ||
    getAtPath(analysis, 'licenseCompliance.riskProfile');
  const rp = asLabelsAndData(riskProfile);
  // filter out zero entries for doughnut
  const filteredRp = rp.labels.reduce((acc, label, idx) => {
    if ((rp.data[idx] || 0) > 0) { acc.labels.push(label); acc.data.push(rp.data[idx]); }
    return acc;
  }, { labels: [], data: [] });
  charts.licenseRiskProfile = buildDoughnut(filteredRp.labels, filteredRp.data);

  // 3) License Quality Score (Bar) - qualityMetrics is an object of score categories
  const qualityMetrics = getAtPath(analysis, 'licenseCompliance.qualityMetrics') || {};
  const q = asLabelsAndData(qualityMetrics);
  // for quality score, if all zeros or no labels, return empty dataset to indicate no data
  const sumQ = (q.data || []).reduce((s, v) => s + (Number(v) || 0), 0);
  charts.licenseQualityScore = (sumQ > 0) ? buildBar(q.labels, q.data) : { type: 'bar', data: { labels: [], datasets: [] } };

  // 4) Risk Distribution (Pie)
  const riskDist = getAtPath(analysis, 'licenseCompliance.riskDistribution.percentages') ||
    getAtPath(analysis, 'licenseCompliance.riskDistribution') || {};
  const rd = asLabelsAndData(riskDist);
  const filteredRd = rd.labels.reduce((acc, label, idx) => {
    if ((rd.data[idx] || 0) > 0) { acc.labels.push(label); acc.data.push(rd.data[idx]); }
    return acc;
  }, { labels: [], data: [] });
  charts.riskDistribution = buildPie(filteredRd.labels, filteredRd.data);

  // 5) Vulnerabilities by Severity (Bar)
  const vulns = getAtPath(analysis, 'securityVulnerabilities.summary.bySeverity') ||
    getAtPath(analysis, 'securityVulnerabilities.bySeverity') || {};
  // normalize order: Critical, High, Medium, Low, Info
  const severityOrder = ['critical', 'high', 'medium', 'low', 'info'];
  let vulnLabels = Object.keys(vulns || {});
  let vulnData = [];
  if (vulnLabels.length === 0) {
    // try to detect an array-like summary
    const arr = getAtPath(analysis, 'securityVulnerabilities.summary') || [];
    if (Array.isArray(arr) && arr.length > 0) {
      vulnLabels = arr.map(x => x.severity || 'unknown');
      vulnData = arr.map(() => 1);
    }
  }
  if (vulnData.length === 0) {
    // build ordered data from object
    vulnLabels = severityOrder.filter(k => vulns[k] !== undefined);
    vulnData = vulnLabels.map(k => Number(vulns[k]) || 0);
    // fallback: take provided keys
    if (vulnLabels.length === 0) {
      const tmp = asLabelsAndData(vulns);
      vulnLabels = tmp.labels; vulnData = tmp.data;
    }
  }
  charts.vulnerabilitiesBySeverity = buildBar(vulnLabels, vulnData);

  // 6) Overall Risk Score (Gauge) - single numeric value
  const overall = getAtPath(analysis, 'summary.summaryMetrics.overallRiskScore') ||
    getAtPath(analysis, 'riskAssessment.overallRiskScore') ||
    getAtPath(analysis, 'summary.overallRiskScore') || null;
  charts.overallRiskScore = { type: 'gauge', value: overall != null ? Number(overall) : null, meta: { raw: overall } };

  return { charts };
};
