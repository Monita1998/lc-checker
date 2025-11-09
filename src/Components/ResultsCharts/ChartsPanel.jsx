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
  const { charts } = transformResultToCharts(analysis || {});

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
      <div className="chart-card">
        <h3 className="chart-title">License Distribution</h3>
        {gs.licenseDistribution && gs.licenseDistribution.data.labels.length > 0 ? (
          <div style={{ height: 220 }}>
            <Pie data={gs.licenseDistribution.data} options={gs.licenseDistribution.options} />
          </div>
        ) : <div className="legend">No license distribution data available</div>}
      </div>

      <div className="chart-card">
        <h3 className="chart-title">License Risk Profile</h3>
        {gs.licenseRiskProfile && gs.licenseRiskProfile.data.labels.length > 0 ? (
          <div style={{ height: 220 }}>
            <Doughnut data={gs.licenseRiskProfile.data} options={gs.licenseRiskProfile.options} />
          </div>
        ) : <div className="legend">No license risk profile available</div>}
      </div>

      {/* license quality card moved to the end (rendered later) */}

      <div className="chart-card">
        <h3 className="chart-title">Risk Distribution</h3>
        {gs.riskDistribution && gs.riskDistribution.data.labels.length > 0 ? (
          <div style={{ height: 220 }}>
            <Pie data={gs.riskDistribution.data} options={gs.riskDistribution.options} />
          </div>
        ) : <div className="legend">No risk distribution data available</div>}
      </div>

      <div className="chart-card">
        <h3 className="chart-title">Vulnerabilities by Severity</h3>
        {gs.vulnerabilitiesBySeverity && gs.vulnerabilitiesBySeverity.data.labels.length > 0 ? (
          <div style={{ height: 220 }}>
            <Bar data={gs.vulnerabilitiesBySeverity.data} options={gs.vulnerabilitiesBySeverity.options} />
          </div>
        ) : <div className="legend">No vulnerability data available</div>}
      </div>

      <div className="chart-card">
        <h3 className="chart-title">Overall Risk Score</h3>
        {gs.overallRiskScore && gs.overallRiskScore.value != null ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 220 }}>
            {/* Simple doughnut-as-gauge fallback */}
            <Doughnut
              data={{
                labels: ['Score', 'Remainder'],
                datasets: [{ data: [gs.overallRiskScore.value, Math.max(0, 100 - gs.overallRiskScore.value)], backgroundColor: ['#e15759', '#e9ecef'] }]
              }}
              options={{ cutout: '70%', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }}
            />
            <div style={{ position: 'absolute', textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: '600' }}>{gs.overallRiskScore.value}</div>
              <div style={{ fontSize: 12, color: '#666' }}>Overall Risk</div>
            </div>
          </div>
        ) : (
          <div className="legend">No overall risk score available</div>
        )}
      </div>
      
      {/* License Quality Score moved to the end */}
      <div className="chart-card">
        <h3 className="chart-title">License Quality Score</h3>
        {gs.licenseQualityScore && gs.licenseQualityScore.data.labels.length > 0 ? (
          <div className="quality-list" style={{ paddingTop: 6 }}>
            {gs.licenseQualityScore.data.labels.map((label, idx) => (
              <div className="quality-item" key={label}>
                <div className="quality-label">{label}</div>
                <div className="quality-score">{gs.licenseQualityScore.data.datasets?.[0]?.data?.[idx] ?? 0}</div>
              </div>
            ))}
          </div>
        ) : <div className="legend">No quality metrics available</div>}
      </div>
    </div>
    </div>
  );
};

export default ChartsPanel;
