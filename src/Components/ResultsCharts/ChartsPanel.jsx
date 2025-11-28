import React from 'react';
import transformResultToCharts from '../../utils/transformResultToCharts';
import { Pie, Doughnut, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement
} from 'chart.js';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement);

const ChartsPanel = ({ analysis }) => {
  const { charts, customCharts, overallMetrics } = transformResultToCharts(analysis || {});

  // Neutral color used for several single-color charts
  const NEUTRAL_COLOR = '#4e79a7';

  const gs = charts || {};

  const hasAnyData = Object.values(gs).some(c => {
    if (!c) return false;
    if (c.type === 'gauge') return c.value != null;
    if (c.data && Array.isArray(c.data.datasets) && c.data.datasets.length > 0) {
      // check dataset sums to ensure there is meaningful data (not just zeroes)
      const ds = c.data.datasets[0].data || [];
      const sum = ds.reduce((s, v) => s + (Number(v) || 0), 0);
      return sum > 0;
    }
    return false;
  });

  return (
    <div>
      {!hasAnyData ? (
        <div className="chart-empty-state">
          <h4>No chartable data found for this result</h4>
          <p>The analysis JSON may be missing expected fields. Below is a compact preview of the analysis object passed to the charts transformer.</p>
          <details style={{ maxHeight: 260, overflow: 'auto', background: '#f7f7f7', padding: 8 }}>
            <summary>Show analysis JSON</summary>
            <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{JSON.stringify(analysis || {}, null, 2)}</pre>
          </details>
        </div>
      ) : null}

  <div id="charts-panel" className="charts-grid">
      {/* Overall Metrics (shown first) */}
      <div className="chart-card">
        <h3 className="chart-title">Overall Metrics</h3>
        {overallMetrics ? (
          <div style={{ padding: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <div>Total Packages</div>
              <div><strong>{overallMetrics.totalPackages ?? '-'}</strong></div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <div>Total Vulnerabilities</div>
              <div><strong>{overallMetrics.totalVulnerabilities ?? '-'}</strong></div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <div>Outdated Packages</div>
              <div><strong>{overallMetrics.outdatedPackages ?? '-'}</strong></div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <div>License Quality Score</div>
              <div><strong>{overallMetrics.licenseQualityScore ?? '-'}%</strong></div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div>Overall Risk Score</div>
              <div><strong>{overallMetrics.overallRiskScore ?? '-'}%</strong></div>
            </div>
          </div>
        ) : <div className="legend">No overall metrics available</div>}
      </div>

      {/* Custom charts (user-specified compact payloads) */}
      {Array.isArray(customCharts) && customCharts.length > 0 && (
        <>
          {customCharts
            .filter(c => c.title !== 'Top 5 Licenses Used')
            .map((c, i) => {
            const labels = c.data?.labels || [];
            const values = c.data?.values || [];
            // Provide sensible default colors for specific chart types
            let colors = c.data?.colors || undefined;
            if (!colors && c.title === 'License Risk Categories') {
              // Map known risk categories to distinct colors
              const riskColorMap = {
                PERMISSIVE: '#16a34a',       // green
                UNKNOWN: '#6b7280',          // gray
                STRONG_COPYLEFT: '#dc2626',  // red
                WEAK_COPYLEFT: '#f97316',    // orange
                PROPRIETARY: '#6f42c1'       // purple
              };
              colors = labels.map(l => riskColorMap[l] || '#4e79a7');
            }
            // If top-5 licenses chart and no colors specified, use a single neutral color for all bars/slices
            if (!colors && c.title === 'Top 5 Licenses Used') {
              const single = NEUTRAL_COLOR;
              colors = labels.map(() => single);
            }
            // Use single neutral color for Supply Chain Risk Factors when none provided
            if (!colors && c.title === 'Supply Chain Risk Factors') {
              const single = '#4e79a7';
              colors = labels.map(() => single);
            }
            return (
              <div className="chart-card" key={`custom-${i}`}>
                <h3 className="chart-title">{c.title}</h3>
                {c.type === 'pie' && labels.length > 0 ? (
                  <div style={{ height: 220 }}>
                    <Pie data={{ labels, datasets: [{ data: values, backgroundColor: colors || undefined }] }} options={{ responsive: true, maintainAspectRatio: false }} />
                  </div>
                ) : c.type === 'doughnut' && labels.length > 0 ? (
                  <div style={{ height: 220 }}>
                    <Doughnut data={{ labels, datasets: [{ data: values, backgroundColor: colors || undefined }] }} options={{ responsive: true, maintainAspectRatio: false }} />
                  </div>
                ) : c.type === 'bar' && labels.length > 0 ? (
                  <div style={{ height: 220 }}>
                    <Bar data={{ labels, datasets: [{ label: c.title || 'Count', data: values, backgroundColor: colors || undefined }] }} options={{ responsive: true, maintainAspectRatio: false }} />
                  </div>
                ) : (
                  <div className="legend">No data available</div>
                )}
              </div>
            );
          })}

        </>
      )}
      <div className="chart-card">
        <h3 className="chart-title">License Distribution</h3>
        {gs.licenseDistribution && gs.licenseDistribution.data.labels.length > 0 ? (
          <div style={{ height: 220 }}>
            <Pie data={gs.licenseDistribution.data} options={gs.licenseDistribution.options} />
          </div>
        ) : <div className="legend">No license distribution data available</div>}
      </div>

      {/* License Risk Profile removed per user request */}

      {/* license quality card moved to the end (rendered later) */}

      {/* Risk Distribution and Vulnerabilities by Severity charts removed per user request */}
    </div>
    </div>
  );
};

export default ChartsPanel;
