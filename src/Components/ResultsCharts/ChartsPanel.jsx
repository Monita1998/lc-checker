import React, { useRef } from 'react';
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
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement);

const ChartsPanel = ({ analysis }) => {
  const chartsPanelRef = useRef(null);
  const { charts, customCharts, overallMetrics } = transformResultToCharts(analysis || {});

  const gs = charts || {};

  // raw root analysis object for tables/details
  const root = (analysis && (analysis.data || analysis)) || {};
  const outdatedList = Array.isArray(root.outdatedDependencies?.packages) ? root.outdatedDependencies.packages : [];
  const outdatedRecs = Array.isArray(root.outdatedDependencies?.recommendations) ? root.outdatedDependencies.recommendations : [];
  const supply = root.supplyChainRisk || {};
  const noRepoList = Array.isArray(supply.noRepositoryPackages?.packages) ? supply.noRepositoryPackages.packages : [];
  const unmaintainedList = Array.isArray(supply.unmaintainedPackages?.packages) ? supply.unmaintainedPackages.packages : [];
  const supplyRecs = Array.isArray(supply.recommendations) ? supply.recommendations : [];
  const executiveSummary = root.executiveSummary || {};
  
  // Extract detailed vulnerabilities from securityOverview
  const detailedVulns = Array.isArray(root.securityOverview?.detailedVulnerabilities) 
    ? root.securityOverview.detailedVulnerabilities 
    : [];
  
  // Find specific custom charts by title
  const licenseRiskChart = customCharts?.find(c => c.title === 'License Risk Categories');
  const vulnSeverityChart = customCharts?.find(c => c.title === 'Vulnerability Severity Distribution');
  const outdatedBreakdownChart = customCharts?.find(c => c.title === 'Outdated Packages Breakdown');
  const scrChart = customCharts?.find(c => c.title === 'Supply Chain Risk Factors');

  const handleDownloadPDF = async () => {
    if (!chartsPanelRef.current) return;

    try {
      const element = chartsPanelRef.current;
      
      // Find all scrollable elements and temporarily remove height restrictions
      const scrollableElements = element.querySelectorAll('[style*="overflow"]');
      const originalStyles = [];
      
      scrollableElements.forEach((el, index) => {
        originalStyles[index] = {
          maxHeight: el.style.maxHeight,
          overflow: el.style.overflow
        };
        el.style.maxHeight = 'none';
        el.style.overflow = 'visible';
      });

      // Wait a bit for the DOM to update
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Capture the element as canvas
      const canvas = await html2canvas(element, {
        scale: 2, // Higher quality
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        windowHeight: element.scrollHeight,
        windowWidth: element.scrollWidth
      });

      // Restore original styles
      scrollableElements.forEach((el, index) => {
        if (originalStyles[index]) {
          el.style.maxHeight = originalStyles[index].maxHeight;
          el.style.overflow = originalStyles[index].overflow;
        }
      });

      // Calculate PDF dimensions
      const imgWidth = 210; // A4 width in mm
      const pageHeight = 297; // A4 height in mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;

      // Create PDF
      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgData = canvas.toDataURL('image/png');

      // Add first page
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      // Add additional pages if content is longer than one page
      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      // Download the PDF
      const timestamp = new Date().toISOString().split('T')[0];
      pdf.save(`analysis-report-${timestamp}.pdf`);
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Failed to generate PDF. Please try again.');
    }
  };

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
      {/* PDF Download Button */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'flex-end', 
        marginBottom: '16px',
        padding: '0 8px'
      }}>
        <button
          onClick={handleDownloadPDF}
          style={{
            padding: '10px 20px',
            backgroundColor: '#3b82f6',
            color: '#ffffff',
            border: 'none',
            borderRadius: '6px',
            fontSize: '14px',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            transition: 'background-color 0.2s'
          }}
          onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#2563eb'}
          onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#3b82f6'}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Download PDF Report
        </button>
      </div>

      <div ref={chartsPanelRef}>
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
      {/* 1. Overall Metrics (shown first) */}
      <div className="chart-card" style={{ minHeight: '250px', maxHeight: '420px' }}>
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
            {executiveSummary.securityStatus != null && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <div>Security Status</div>
                <div><strong>{executiveSummary.securityStatus}</strong></div>
              </div>
            )}
            {root.licenseCompatibility?.licenseQualityScore != null && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <div>License Quality Score</div>
                <div><strong>{root.licenseCompatibility.licenseQualityScore}%</strong></div>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <div>Overall Risk Score</div>
              <div><strong>{overallMetrics.overallRiskScore ?? '-'}%</strong></div>
            </div>
            {supply.riskLevel != null && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <div>Supply Chain Risk Level</div>
                <div><strong>{supply.riskLevel}</strong></div>
              </div>
            )}
          </div>
        ) : <div className="legend">No overall metrics available</div>}
      </div>

      {/* 2. Supply Chain Risk Factors (move to top row next to Overall Metrics) */}
      {scrChart && scrChart.data?.values?.some(v => v > 0) ? (
        <div className="chart-card" style={{ minHeight: '250px', maxHeight: '420px' }}>
          <h3 className="chart-title">Supply Chain Risk Factors</h3>
          <div style={{ height: 210, position: 'relative', padding: '8px 0' }}>
            <Bar 
              data={{ 
                labels: scrChart.data.labels, 
                datasets: [{ 
                  label: 'Count',
                  data: scrChart.data.values, 
                  backgroundColor: scrChart.data.riskLevels?.map(risk => {
                    return risk === 'HIGH' ? '#ef4444' : risk === 'MEDIUM' ? '#f59e0b' : '#10b981';
                  }) || '#4e79a7'
                }] 
              }} 
              options={{ 
                responsive: true, 
                maintainAspectRatio: true,
                indexAxis: 'y',
                scales: {
                  x: { beginAtZero: true }
                },
                plugins: {
                  legend: { display: false },
                  tooltip: {
                    callbacks: {
                      label: (context) => {
                        const riskLevel = scrChart.data.riskLevels?.[context.dataIndex] || 'UNKNOWN';
                        return `${context.parsed.x} packages (Risk: ${riskLevel})`;
                      }
                    }
                  }
                }
              }} 
            />
          </div>
        </div>
      ) : (
        <div className="chart-card" style={{ minHeight: '250px', maxHeight: '420px' }}>
          <h3 className="chart-title">Supply Chain Risk Factors</h3>
          <div style={{ height: 210, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
            <p>No supply chain risk data available</p>
          </div>
        </div>
      )}

      {/* 3. Supply Chain Risk Details (moved before license charts) */}
      {(noRepoList.length > 0 || unmaintainedList.length > 0) ? (
        <div className="chart-card supplychain-card" style={{ minHeight: 'fit-content', gridColumn: (noRepoList.length + unmaintainedList.length) > 5 ? '1 / -1' : 'auto' }}>
          <h3 className="chart-title">Supply Chain Risk Details</h3>
          {noRepoList.length > 0 && (
            <>
              <h4 style={{ marginTop: 12, marginBottom: 8, fontSize: '0.95rem', fontWeight: 600 }}>No Repository Packages ({noRepoList.length})</h4>
              <div style={{ maxHeight: 200, overflow: 'auto' }}>
                <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', padding: '8px', backgroundColor: '#f8fafc', borderBottom: '2px solid #e2e8f0', fontWeight: 600, color: '#475569' }}>Package</th>
                      <th style={{ textAlign: 'left', padding: '8px', backgroundColor: '#f8fafc', borderBottom: '2px solid #e2e8f0', fontWeight: 600, color: '#475569' }}>Version</th>
                      <th style={{ textAlign: 'left', padding: '8px', backgroundColor: '#f8fafc', borderBottom: '2px solid #e2e8f0', fontWeight: 600, color: '#475569' }}>Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {noRepoList.map((p, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '8px', color: '#1e293b', fontWeight: 500 }}>{p.package || p.name || ''}</td>
                        <td style={{ padding: '8px', color: '#334155', fontSize: '12px', fontFamily: 'Monaco, monospace' }}>{p.version || ''}</td>
                        <td style={{ padding: '8px', color: '#64748b', fontSize: '12px' }}>{p.reason || ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {unmaintainedList.length > 0 && (
            <>
              <h4 style={{ marginTop: 12, marginBottom: 8, fontSize: '0.95rem', fontWeight: 600 }}>Unmaintained Packages ({unmaintainedList.length})</h4>
              <div style={{ maxHeight: 200, overflow: 'auto' }}>
                <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', padding: '8px', backgroundColor: '#f8fafc', borderBottom: '2px solid #e2e8f0', fontWeight: 600, color: '#475569' }}>Package</th>
                      <th style={{ textAlign: 'left', padding: '8px', backgroundColor: '#f8fafc', borderBottom: '2px solid #e2e8f0', fontWeight: 600, color: '#475569' }}>Version</th>
                      <th style={{ textAlign: 'left', padding: '8px', backgroundColor: '#f8fafc', borderBottom: '2px solid #e2e8f0', fontWeight: 600, color: '#475569' }}>Risk</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unmaintainedList.map((p, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '8px', color: '#1e293b', fontWeight: 500 }}>{p.package || p.name || ''}</td>
                        <td style={{ padding: '8px', color: '#334155', fontSize: '12px', fontFamily: 'Monaco, monospace' }}>{p.version || ''}</td>
                        <td style={{ padding: '8px' }}>
                          <span style={{
                            padding: '2px 6px',
                            borderRadius: '3px',
                            fontSize: '11px',
                            fontWeight: 600,
                            backgroundColor: (p.riskLevel || 'MEDIUM') === 'HIGH' ? '#fff7ed' : '#fffbeb',
                            color: (p.riskLevel || 'MEDIUM') === 'HIGH' ? '#ea580c' : '#d97706'
                          }}>
                            {p.riskLevel || 'MEDIUM'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {supplyRecs.length > 0 && (
            <>
              <h4 style={{ marginTop: 16, marginBottom: 8, fontSize: '0.95rem', fontWeight: 600 }}>Recommendations</h4>
              <ul style={{ marginTop: 6, paddingLeft: 24, listStylePosition: 'outside' }}>
                {supplyRecs.map((r, i) => (
                  <li key={i} style={{ marginBottom: 8, lineHeight: 1.6 }}>
                    <span style={{
                      padding: '2px 6px',
                      borderRadius: '3px',
                      fontSize: '11px',
                      fontWeight: 600,
                      marginRight: 8,
                      backgroundColor: r.priority === 'HIGH' ? '#fff7ed' : r.priority === 'MEDIUM' ? '#fffbeb' : '#f0fdf4',
                      color: r.priority === 'HIGH' ? '#ea580c' : r.priority === 'MEDIUM' ? '#d97706' : '#16a34a'
                    }}>
                      {r.priority}
                    </span>
                    {r.details || r.action || ''}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      ) : (
        <div className="chart-card" style={{ minHeight: 'fit-content', gridColumn: '1 / -1' }}>
          <h3 className="chart-title">Supply Chain Risk Details</h3>
          <div style={{ padding: '40px 20px', textAlign: 'center', color: '#94a3b8' }}>
            <p>No supply chain risk details available</p>
          </div>
        </div>
      )}

      {/* 4. License Distribution */}
      {gs.licenseDistribution && gs.licenseDistribution.data.labels.length > 0 ? (
        <div className="chart-card" style={{ minHeight: '360px', maxHeight: '420px' }}>
          <h3 className="chart-title">Top 5 Licenses Used</h3>
          <div style={{ height: 320, position: 'relative', padding: '8px 0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Pie 
              data={gs.licenseDistribution.data} 
              options={{ 
                responsive: true, 
                maintainAspectRatio: true,
                plugins: {
                  legend: {
                    position: 'top',
                    align: 'center',
                    labels: {
                      padding: 12,
                      font: { size: 12 },
                      boxWidth: 14
                    }
                  }
                }
              }} 
            />
          </div>
        </div>
      ) : (
        <div className="chart-card" style={{ minHeight: '360px', maxHeight: '420px' }}>
          <h3 className="chart-title">Top 5 Licenses Used</h3>
          <div style={{ height: 320, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
            <p>No license data available</p>
          </div>
        </div>
      )}

      {/* 5. License Risk Distribution */}
      {licenseRiskChart && licenseRiskChart.data?.labels?.length > 0 ? (
        <div className="chart-card" style={{ minHeight: '360px', maxHeight: '420px' }}>
          <h3 className="chart-title">License Risk Distribution</h3>
          <div style={{ height: 320, position: 'relative', padding: '8px 0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Pie 
              data={{ 
                labels: licenseRiskChart.data.labels.map(l => {
                  // Format labels to be more readable
                  return l.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                }), 
                datasets: [{ 
                  data: licenseRiskChart.data.values, 
                  backgroundColor: licenseRiskChart.data.labels.map(l => {
                    const riskColorMap = {
                      PERMISSIVE: '#16a34a',
                      UNKNOWN: '#6b7280',
                      STRONG_COPYLEFT: '#dc2626',
                      WEAK_COPYLEFT: '#f97316',
                      PROPRIETARY: '#6f42c1'
                    };
                    return riskColorMap[l] || '#4e79a7';
                  })
                }] 
              }} 
              options={{ 
                responsive: true, 
                maintainAspectRatio: true,
                plugins: {
                  legend: {
                    position: 'top',
                    align: 'center',
                    labels: {
                      padding: 12,
                      font: { size: 12 },
                      boxWidth: 14
                    }
                  },
                  tooltip: {
                    callbacks: {
                      label: (context) => {
                        const percentage = licenseRiskChart.data.percentages?.[context.dataIndex];
                        return `${context.label}: ${context.parsed} packages${percentage ? ` (${percentage}%)` : ''}`;
                      }
                    }
                  }
                }
              }} 
            />
          </div>
        </div>
      ) : (
        <div className="chart-card" style={{ minHeight: '360px', maxHeight: '420px' }}>
          <h3 className="chart-title">License Risk Distribution</h3>
          <div style={{ height: 320, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
            <p>No license risk data available</p>
          </div>
        </div>
      )}

      {/* 6. Outdated Dependencies Details (moved just after License Risk Distribution) */}
      {(outdatedList.length > 0 || outdatedRecs.length > 0) ? (
        <div className="chart-card" style={{ minHeight: 'fit-content', maxHeight: 'none', gridColumn: '1 / -1' }}>
          <h3 className="chart-title">Outdated Dependencies Details</h3>
          
          {/* Outdated Packages Table */}
          {outdatedList.length > 0 && (
            <>
              <h4 style={{ marginTop: 16, marginBottom: 8, fontSize: '0.95rem', fontWeight: 600 }}>Outdated Packages ({outdatedList.length})</h4>
              <div style={{ maxHeight: 280, overflow: 'auto', marginTop: 8 }}>
                <table className="outdated-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', padding: '8px', backgroundColor: '#f8fafc', borderBottom: '2px solid #e2e8f0', fontWeight: 600, color: '#475569' }}>Package</th>
                      <th style={{ textAlign: 'left', padding: '8px', backgroundColor: '#f8fafc', borderBottom: '2px solid #e2e8f0', fontWeight: 600, color: '#475569' }}>Current</th>
                      <th style={{ textAlign: 'left', padding: '8px', backgroundColor: '#f8fafc', borderBottom: '2px solid #e2e8f0', fontWeight: 600, color: '#475569' }}>Wanted</th>
                      <th style={{ textAlign: 'left', padding: '8px', backgroundColor: '#f8fafc', borderBottom: '2px solid #e2e8f0', fontWeight: 600, color: '#475569' }}>Latest</th>
                      <th style={{ textAlign: 'left', padding: '8px', backgroundColor: '#f8fafc', borderBottom: '2px solid #e2e8f0', fontWeight: 600, color: '#475569' }}>Type</th>
                      <th style={{ textAlign: 'left', padding: '8px', backgroundColor: '#f8fafc', borderBottom: '2px solid #e2e8f0', fontWeight: 600, color: '#475569' }}>Breaking</th>
                    </tr>
                  </thead>
                  <tbody>
                    {outdatedList.map((p, idx) => (
                      <tr key={p.package || idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '8px', color: '#1e293b', fontWeight: 500 }}>{p.package}</td>
                        <td style={{ padding: '8px', color: '#334155', fontSize: '12px', fontFamily: 'Monaco, monospace' }}>{p.current}</td>
                        <td style={{ padding: '8px', color: '#334155', fontSize: '12px', fontFamily: 'Monaco, monospace' }}>{p.wanted}</td>
                        <td style={{ padding: '8px', color: '#334155', fontSize: '12px', fontFamily: 'Monaco, monospace' }}>{p.latest}</td>
                        <td style={{ padding: '8px' }}>
                          <span style={{
                            padding: '2px 6px',
                            borderRadius: '3px',
                            fontSize: '11px',
                            fontWeight: 600,
                            backgroundColor: p.updateType === 'MAJOR' ? '#fef2f2' : p.updateType === 'MINOR' ? '#fff7ed' : '#f0fdf4',
                            color: p.updateType === 'MAJOR' ? '#dc2626' : p.updateType === 'MINOR' ? '#ea580c' : '#16a34a'
                          }}>
                            {p.updateType}
                          </span>
                        </td>
                        <td style={{ padding: '8px', color: p.breaking ? '#dc2626' : '#16a34a', fontWeight: 600 }}>{p.breaking ? 'Yes' : 'No'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* Recommendations */}
          {outdatedRecs.length > 0 && (
            <>
              <h4 style={{ marginTop: 16, marginBottom: 8, fontSize: '0.95rem', fontWeight: 600 }}>Recommendations</h4>
              <ul style={{ marginTop: 6, paddingLeft: 24, listStylePosition: 'outside' }}>
                {outdatedRecs.map((r, i) => (
                  <li key={i} style={{ marginBottom: 8, lineHeight: 1.6 }}>
                    <span style={{
                      padding: '2px 6px',
                      borderRadius: '3px',
                      fontSize: '11px',
                      fontWeight: 600,
                      marginRight: 8,
                      backgroundColor: r.priority === 'CRITICAL' ? '#fef2f2' : r.priority === 'HIGH' ? '#fff7ed' : '#fffbeb',
                      color: r.priority === 'CRITICAL' ? '#dc2626' : r.priority === 'HIGH' ? '#ea580c' : '#d97706'
                    }}>
                      {r.priority}
                    </span>
                    {r.details || r.action || ''}
                    {r.command && <code style={{ marginLeft: 8, padding: '2px 6px', backgroundColor: '#f1f5f9', borderRadius: '3px', fontSize: '12px' }}>{r.command}</code>}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      ) : (
        <div className="chart-card" style={{ minHeight: 'fit-content', maxHeight: 'none', gridColumn: '1 / -1' }}>
          <h3 className="chart-title">Outdated Dependencies Details</h3>
          <div style={{ padding: '40px 20px', textAlign: 'center', color: '#94a3b8' }}>
            <p>No outdated dependencies data available</p>
          </div>
        </div>
      )}

      {/* 7. Outdated Dependencies Chart (placed before Severity, styled similarly) */}
      {outdatedBreakdownChart && outdatedBreakdownChart.data?.labels?.length > 0 ? (
        <div className="chart-card" style={{ minHeight: '360px', maxHeight: '420px' }}>
          <h3 className="chart-title">Outdated Packages by Type</h3>
          <div style={{ height: 320, position: 'relative', padding: '8px 0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Pie 
              data={{ 
                labels: outdatedBreakdownChart.data.labels, 
                datasets: [{ 
                  data: outdatedBreakdownChart.data.values, 
                  backgroundColor: outdatedBreakdownChart.data.colors || undefined 
                }] 
              }} 
              options={{ 
                responsive: true, 
                maintainAspectRatio: true,
                plugins: {
                  legend: {
                    position: 'top',
                    align: 'center',
                    labels: {
                      padding: 12,
                      font: { size: 12 },
                      boxWidth: 14
                    }
                  },
                  tooltip: {
                    callbacks: {
                      label: (context) => {
                        return `${context.label}: ${context.parsed} packages`;
                      }
                    }
                  }
                }
              }} 
            />
          </div>
        </div>
      ) : (
        <div className="chart-card" style={{ minHeight: '360px', maxHeight: '420px' }}>
          <h3 className="chart-title">Outdated Packages by Type</h3>
          <div style={{ height: 320, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
            <p>No outdated packages data available</p>
          </div>
        </div>
      )}

      {/* 8. Vulnerability Severity Distribution */}
      {vulnSeverityChart && vulnSeverityChart.data?.labels?.length > 0 && vulnSeverityChart.data?.values?.some(v => v > 0) ? (
        <div className="chart-card" style={{ minHeight: '360px', maxHeight: '420px' }}>
          <h3 className="chart-title">Vulnerability Severity Distribution</h3>
          <div style={{ height: 320, position: 'relative', padding: '8px 0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Doughnut 
              data={{ 
                labels: vulnSeverityChart.data.labels, 
                datasets: [{ 
                  data: vulnSeverityChart.data.values, 
                  backgroundColor: vulnSeverityChart.data.labels.map(label => {
                    const severity = label.toUpperCase();
                    return severity === 'CRITICAL' ? '#b91c1c' : 
                           severity === 'HIGH' ? '#f97316' : 
                           severity === 'MEDIUM' || severity === 'MODERATE' ? '#eab308' : '#3b82f6';
                  })
                }] 
              }} 
              options={{ 
                responsive: true, 
                maintainAspectRatio: true,
                plugins: {
                  legend: {
                    position: 'top',
                    align: 'center',
                    labels: {
                      padding: 12,
                      font: { size: 12 },
                      boxWidth: 14
                    }
                  },
                  tooltip: {
                    callbacks: {
                      label: (context) => `${context.label}: ${context.parsed} vulnerabilities`
                    }
                  }
                }
              }} 
            />
          </div>
        </div>
      ) : (
        <div className="chart-card" style={{ minHeight: '360px', maxHeight: '420px' }}>
          <h3 className="chart-title">Vulnerability Severity Distribution</h3>
          <div style={{ height: 320, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
            <p>No vulnerability data available</p>
          </div>
        </div>
      )}

      {/* 9. (Supply Chain Risk Details moved earlier) */}

      {/* 10. Vulnerability Details (moved to end) */}
      {detailedVulns.length > 0 ? (
        <div className="chart-card" style={{ minHeight: 'fit-content', maxHeight: 'none', gridColumn: detailedVulns.length > 5 ? '1 / -1' : 'auto' }}>
          <h3 className="chart-title">Vulnerability Details</h3>
          <h4 style={{ marginTop: 12, marginBottom: 8, fontSize: '0.95rem', fontWeight: 600 }}>Detailed Vulnerabilities ({detailedVulns.length})</h4>
          <div style={{ maxHeight: 280, overflow: 'auto', marginTop: 8 }}>
            <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '8px', backgroundColor: '#f8fafc', borderBottom: '2px solid #e2e8f0', fontWeight: 600, color: '#475569' }}>Package</th>
                  <th style={{ textAlign: 'left', padding: '8px', backgroundColor: '#f8fafc', borderBottom: '2px solid #e2e8f0', fontWeight: 600, color: '#475569' }}>Severity</th>
                  <th style={{ textAlign: 'left', padding: '8px', backgroundColor: '#f8fafc', borderBottom: '2px solid #e2e8f0', fontWeight: 600, color: '#475569' }}>Title</th>
                </tr>
              </thead>
              <tbody>
                {detailedVulns.map((v, i) => {
                  const sev = (v.severity || 'UNKNOWN').toUpperCase();
                  const sevMapped = sev === 'MODERATE' ? 'MEDIUM' : sev;
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '8px', color: '#1e293b', fontWeight: 500 }}>{v.package || v.name || '-'}</td>
                      <td style={{ padding: '8px' }}>
                        <span style={{ 
                          padding: '3px 8px', 
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 600,
                          display: 'inline-block',
                          backgroundColor: sevMapped === 'CRITICAL' ? '#fee2e2' : 
                                         sevMapped === 'HIGH' ? '#ffedd5' : 
                                         sevMapped === 'MEDIUM' ? '#fef9c3' : '#dbeafe',
                          color: sevMapped === 'CRITICAL' ? '#b91c1c' : 
                                 sevMapped === 'HIGH' ? '#f97316' : 
                                 sevMapped === 'MEDIUM' ? '#eab308' : '#3b82f6'
                        }}>
                          {sevMapped}
                        </span>
                      </td>
                      <td style={{ padding: '8px', color: '#334155' }} title={v.title || v.description || '-'}>
                        {v.title || v.description || '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="chart-card" style={{ minHeight: 'fit-content', maxHeight: 'none', gridColumn: '1 / -1' }}>
          <h3 className="chart-title">Vulnerability Details</h3>
          <div style={{ padding: '40px 20px', textAlign: 'center', color: '#94a3b8' }}>
            <p>No vulnerability details available</p>
          </div>
        </div>
      )}

    </div>
    </div>
    </div>
  );
};

export default ChartsPanel;
