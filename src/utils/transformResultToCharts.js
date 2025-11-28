/**
 * transformResultToCharts.js
 *
 * Converts the analysis JSON we produce into two shapes:
 * 1) Chart.js-friendly objects used by the existing `ChartsPanel.jsx`.
 * 2) Lightweight JSON payloads (title/type/data) you described for custom UI use.
 *
 * The transformer is defensive and supports both the older key names and the
 * newer structure (the analyzer sometimes nests results under `data`).
 */

const DEFAULT_COLORS = [
  '#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f', '#edc949', '#b07aa1', '#ff9da7', '#9c755f', '#bab0ac'
];

function safeGetRoot(analysis) {
  if (!analysis) return {};
  return analysis.data || analysis;
}

function getNumber(v) {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function buildChartJsPie(labels, values, colors) {
  return {
    type: 'pie',
    data: { labels, datasets: [{ data: values, backgroundColor: colors || DEFAULT_COLORS.slice(0, labels.length) }] },
    options: { responsive: true, maintainAspectRatio: false }
  };
}

function buildChartJsDoughnut(labels, values, colors) {
  return {
    type: 'doughnut',
    data: { labels, datasets: [{ data: values, backgroundColor: colors || DEFAULT_COLORS.slice(0, labels.length) }] },
    options: { responsive: true, maintainAspectRatio: false }
  };
}

function buildChartJsBar(labels, values, colors) {
  return {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Count', data: values, backgroundColor: colors || DEFAULT_COLORS.slice(0, labels.length) }] },
    options: { responsive: true, maintainAspectRatio: false }
  };
}

function toCustomPayload(title, type, payloadData) {
  return { title, type, data: payloadData };
}

module.exports = function transformResultToCharts(analysis) {
  const root = safeGetRoot(analysis);
  const charts = {};
  const custom = [];

  // --- Vulnerability Severity Distribution ---
  // Prefer executiveSummary.severityBreakdown or securityOverview.severityBreakdown
  const sevBreak = root.executiveSummary?.severityBreakdown || root.securityOverview?.severityBreakdown || {};
  // normalize to CRITICAL,HIGH,MEDIUM,LOW order (uppercase)
  const vulnOrder = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
  const vulnLabels = vulnOrder.filter(k => Object.prototype.hasOwnProperty.call(sevBreak, k));
  const vulnValues = vulnLabels.map(k => getNumber(sevBreak[k]));
  charts.vulnerabilitiesBySeverity = buildChartJsBar(vulnLabels, vulnValues);
  custom.push(toCustomPayload('Security Vulnerabilities by Severity', 'doughnut', {
    labels: vulnLabels,
    values: vulnValues,
    colors: ['#dc2626', '#ea580c', '#d97706', '#16a34a']
  }));

  // --- License Risk Distribution ---
  const riskCounts = root.licenseAnalytics?.riskDistribution?.counts || root.licenseAnalytics?.riskDistribution || {};
  const riskOrder = ['PERMISSIVE', 'UNKNOWN', 'STRONG_COPYLEFT', 'WEAK_COPYLEFT', 'PROPRIETARY'];
  const riskLabels = riskOrder.filter(k => Object.prototype.hasOwnProperty.call(riskCounts, k));
  const riskValues = riskLabels.map(k => getNumber(riskCounts[k]));
  // percentages if available
  const riskPercentagesObj = root.licenseAnalytics?.riskDistribution?.percentages;
  const totalPkgs = getNumber(root.licenseAnalytics?.totalPackages || root.totalPackages || root.sbom?.metadata?.enrichmentStats?.packagesAdded || 1);
  const riskPercentages = riskLabels.map(l => (riskPercentagesObj && riskPercentagesObj[l] != null) ? getNumber(riskPercentagesObj[l]) : Math.round((getNumber(riskCounts[l]) / Math.max(1, totalPkgs)) * 100));
  charts.licenseRiskProfile = buildChartJsDoughnut(riskLabels, riskValues);
  custom.push(toCustomPayload('License Risk Categories', 'pie', { labels: riskLabels, values: riskValues, percentages: riskPercentages }));

  // --- Top 5 Licenses ---
  const topLic = Array.isArray(root.licenseAnalytics?.topLicenses) ? root.licenseAnalytics.topLicenses.slice(0, 5) : [];
  const topLabels = topLic.map(x => x.license || x.name || 'Unknown');
  const topValues = topLic.map(x => getNumber(x.count || x.value || x.packages || 0));
  const topPercentages = topLic.map(x => getNumber(x.percentage || 0));
  charts.licenseDistribution = buildChartJsPie(topLabels, topValues);
  custom.push(toCustomPayload('Top 5 Licenses Used', 'bar', { labels: topLabels, values: topValues, percentages: topPercentages }));

  // --- Outdated Packages by Update Type ---
  const outdated = Array.isArray(root.outdatedDependencies?.packages) ? root.outdatedDependencies.packages : [];
  const countsByType = { MAJOR: 0, MINOR: 0, PATCH: 0 };
  outdated.forEach(p => {
    const t = (p.updateType || '').toUpperCase();
    if (t === 'MAJOR') countsByType.MAJOR += 1;
    else if (t === 'MINOR') countsByType.MINOR += 1;
    else if (t === 'PATCH') countsByType.PATCH += 1;
  });
  const outdatedLabels = ['Breaking (MAJOR)', 'Safe (MINOR)', 'Security (PATCH)'];
  const outdatedValues = [countsByType.MAJOR, countsByType.MINOR, countsByType.PATCH];
  charts.outdatedBreakdown = buildChartJsPie(outdatedLabels, outdatedValues, ['#ef4444', '#f59e0b', '#10b981']);
  custom.push(toCustomPayload('Outdated Packages Breakdown', 'pie', { labels: outdatedLabels, values: outdatedValues, colors: ['#ef4444', '#f59e0b', '#10b981'] }));

  // --- Supply Chain Risk Overview ---
  const scr = root.supplyChainRisk || {};
  const scrLabels = ['No Repository', 'Unmaintained', 'Single Maintainer', 'Low Popularity', 'Abandoned'];
  const scrValues = [getNumber(scr.noRepositoryPackages?.count), getNumber(scr.unmaintainedPackages?.count), getNumber(scr.singleMaintainerRisk?.count), getNumber(scr.lowPopularityPackages?.count), getNumber(scr.abandonedPackages?.count)];
  const scrRiskLevels = [
    scr.noRepositoryPackages?.riskLevel || 'MEDIUM',
    scr.unmaintainedPackages?.riskLevel || 'MEDIUM',
    scr.singleMaintainerRisk?.riskLevel || 'LOW',
    scr.lowPopularityPackages?.riskLevel || 'LOW',
    scr.abandonedPackages?.riskLevel || 'LOW'
  ];
  charts.supplyChainOverview = buildChartJsBar(scrLabels, scrValues);
  custom.push(toCustomPayload('Supply Chain Risk Factors', 'bar', { labels: scrLabels, values: scrValues, riskLevels: scrRiskLevels }));

  // --- Overall metrics ---
  const overallMetrics = {
    totalPackages: getNumber(root.researchInsights?.packagesAnalyzed || root.sbom?.metadata?.enrichmentStats?.packagesAdded || root.licenseAnalytics?.totalPackages || root.totalPackages),
    totalVulnerabilities: getNumber(root.executiveSummary?.totalVulnerabilities || root.securityOverview?.vulnerabilities || root.executiveSummary?.vulnerabilities),
    outdatedPackages: getNumber(root.outdatedDependencies?.totalOutdated || outdated.length),
    licenseQualityScore: getNumber(root.licenseAnalytics?.licenseQualityScore || root.licenseAnalytics?.licenseQuality || root.licenseQualityScore),
    overallRiskScore: getNumber(root.executiveSummary?.overallRiskScore || root.supplyChainRisk?.overallRiskScore || root.overallRiskScore)
  };

  // Mirror some of the older chart keys for backward compatibility
  charts.riskDistribution = charts.licenseRiskProfile;
  charts.licenseQualityScore = charts.licenseDistribution;
  charts.overallRiskScore = { type: 'gauge', value: overallMetrics.overallRiskScore };

  return { charts, customCharts: custom, overallMetrics };
};
