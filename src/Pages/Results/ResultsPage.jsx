import React, { useState, useEffect } from "react";
import { useLocation } from 'react-router-dom';
import { collection, query, orderBy, limit, doc, getDoc, deleteDoc, where, onSnapshot } from "firebase/firestore";
import { auth, db } from "../../firebase";
import { onAuthStateChanged } from "firebase/auth";
import Sidebar from "../../Components/SideBar/Sidebar";
import Footer from "../../Components/Footer/FooterNew";
import "./ResultsPage.css";

const ResultsPage = () => {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedResult, setSelectedResult] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [resultToDelete, setResultToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [showJsonRaw, setShowJsonRaw] = useState(false);
  // raw data toggle removed — JSON view always visible
  const location = useLocation();
  const desiredProjectId = location?.state?.projectId || null;

  // fetchResultsWithProjectNames is implemented inside the useEffect below

  useEffect(() => {
    // Create and manage a snapshot listener which re-attaches when auth state changes
    let unsubscribeSnapshot = null;

    const attachListener = (user) => {
      if (unsubscribeSnapshot) {
        try { unsubscribeSnapshot(); } catch (e) { /* ignore */ }
        unsubscribeSnapshot = null;
      }

      let resultsQuery;
      if (user && user.uid) {
        resultsQuery = query(
          collection(db, "results"),
          where("uid", "==", user.uid),
          orderBy("analyzedAt", "desc")
        );
      } else {
        resultsQuery = query(
          collection(db, "results"),
          orderBy("analyzedAt", "desc"),
          limit(10)
        );
      }

      unsubscribeSnapshot = onSnapshot(resultsQuery, async (snapshot) => {
        try {
          const resultsData = [];
          for (const docSnap of snapshot.docs) {
            const resultData = { id: docSnap.id, ...docSnap.data() };
            if (resultData.uploadId) {
              try {
                const uploadDoc = await getDoc(doc(db, "uploads", resultData.uploadId));
                if (uploadDoc.exists()) {
                  resultData.projectName = uploadDoc.data().originalName || "Unknown Project";
                }
              } catch (e) {
                // ignore upload fetch errors
              }
            }
            if (!resultData.projectName) {
              resultData.projectName = resultData.metadata?.projectName || resultData.originalName || "Project Analysis";
            }
            resultsData.push(resultData);
          }

          setResults(resultsData);
          if (desiredProjectId) {
            let matched = resultsData.find(r => r.uploadId === desiredProjectId) || null;
            setSelectedResult(matched || resultsData[0] || null);
          } else {
            setSelectedResult(resultsData[0] || null);
          }
        } catch (err) {
          console.error('Error handling snapshot:', err);
        } finally {
          setLoading(false);
        }
      }, (err) => {
        console.error('Realtime results listener error:', err);
        setLoading(false);
      });
    };

    // Attach initial listener and also re-attach on auth changes
    attachListener(auth.currentUser);
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      attachListener(user);
    });

    return () => {
      try { if (unsubscribeSnapshot) unsubscribeSnapshot(); } catch(e) {}
      try { unsubscribeAuth(); } catch(e) {}
    };
  }, [desiredProjectId]);

  const formatDate = (timestamp) => {
    if (!timestamp) return "Unknown date";
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString() + " " + date.toLocaleTimeString();
  };

  const downloadResults = (result) => {
    const dataStr = JSON.stringify(result, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${result.projectName.replace(/\s+/g, '_')}_analysis.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // copy/download raw helpers removed — actions not needed in JSON view

  // delete helper removed — deletion handled via modal triggered from detail actions

  const confirmDelete = async () => {
    if (!resultToDelete) return;
    
    setDeleting(true);
    try {
      // Delete from Firestore
      await deleteDoc(doc(db, "results", resultToDelete.id));
      
      // Update local state
      const updatedResults = results.filter(r => r.id !== resultToDelete.id);
      setResults(updatedResults);
      
      // Update selected result if needed
      if (selectedResult && selectedResult.id === resultToDelete.id) {
        setSelectedResult(updatedResults[0] || null);
      }
      
      setShowDeleteConfirm(false);
      setResultToDelete(null);
      
    } catch (error) {
      console.error("Error deleting result:", error);
      alert("Failed to delete result. Please try again.");
    } finally {
      setDeleting(false);
    }
  };

  const cancelDelete = () => {
    setShowDeleteConfirm(false);
    setResultToDelete(null);
  };

  if (loading) {
    return (
      <div className="results-container">
        <aside className="sidebar">
          <Sidebar />
        </aside>
        <main className="main-content">
          <div className="results-content">
            <div className="loading-state">
              <div className="spinner"></div>
              <p>Loading analysis results...</p>
            </div>
          </div>
          <Footer />
        </main>
      </div>
    );
  }

  return (
    <div className="results-container">
      <aside className="sidebar">
        <Sidebar />
      </aside>

      <main className="main-content">
        <div className="results-content">
          <div className="page-header">
            <h1>Analysis Results</h1>
            <p>View license compliance analysis for your uploaded projects</p>
          </div>

          {results.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📊</div>
              <h2>No Analysis Results</h2>
              <p>Upload and analyze a project to see results here.</p>
            </div>
          ) : (
            <div className="results-layout">
              {/* Results List - Similar to Projects sidebar */}
              {/* Compact dropdown select (defaults to first item) */}
              <div className="results-sidebar">
                <div className="results-list-dropdown">
                  <label htmlFor="results-select" className="results-select-label">Select project to show result ({results.length})</label>
                  <select
                    id="results-select"
                    value={selectedResult?.id || ''}
                    onChange={(e) => {
                      const sel = results.find(r => r.id === e.target.value);
                      setSelectedResult(sel || null);
                    }}
                  >
                    {results.map((result) => (
                      <option key={result.id} value={result.id}>
                          {result.projectName}
                        </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Result Details - Similar to Project details */}
              {selectedResult && (
                <div className="result-details">
                  <div className="detail-header">
                      <div className="project-title">
                        <h2>{selectedResult.projectName}</h2>
                        <div className="analysis-meta">
                          <span className="analysis-type">
                            {selectedResult.metadata?.analysisType || "License Analysis"}
                          </span>
                          <span className="analysis-date">
                            Analyzed: {formatDate(selectedResult.analyzedAt)}
                          </span>
                        </div>
                      </div>

                      {/* Right-side: only the small download icon (bold) */}
                      <div className="detail-actions-right">
                            <span className="json-label">Result</span>
                            <button
                              className="small-download-btn"
                              title="Toggle JSON / Charts"
                              onClick={() => setShowJsonRaw(!showJsonRaw)}
                            >
                              {showJsonRaw ? 'Charts' : 'JSON'}
                            </button>
                            <button
                              className="small-download-btn"
                              title="Download JSON"
                              onClick={() => downloadResults(selectedResult)}
                            >
                              ⤓
                            </button>
                      </div>
                    </div>

                  {/* Render JSON or Charts view */}
                  {showJsonRaw ? (
                    <div className="json-view-section">
                      <div className="json-view-content">
                        <pre>{JSON.stringify(selectedResult, null, 2)}</pre>
                      </div>
                    </div>
                  ) : (
                    <div className="json-view-section">
                      <div className="charts-grid">
                        {/* License compliance summary bars */}
                        <div className="chart-card">
                          <h3 className="chart-title">License Compliance</h3>
                          {(() => {
                            const selData = selectedResult.data || selectedResult;
                            const summary = selData?.licenseCompliance?.summary || {};
                            const total = summary.totalPackages || (selData?.sbom?.packages || []).length || 0;
                            const violations = summary.violations || 0;
                            const warnings = summary.warnings || 0;
                            const compliant = summary.compliantPackages != null ? summary.compliantPackages : Math.max(0, total - violations - warnings);
                            const pct = (n) => (total ? Math.round((n / total) * 100) : 0);

                            return (
                              <div>
                                <div className="legend">Total packages: {total}</div>
                                <div className="stat-row"><strong>Compliant</strong><span>{compliant} ({pct(compliant)}%)</span></div>
                                <div className="bar-bg"><div className="bar-compliant" style={{width: `${pct(compliant)}%`}}/></div>
                                <div className="stat-row"><strong>Warnings</strong><span>{warnings} ({pct(warnings)}%)</span></div>
                                <div className="bar-bg"><div className="bar-warning" style={{width: `${pct(warnings)}%`}}/></div>
                                <div className="stat-row"><strong>Violations</strong><span>{violations} ({pct(violations)}%)</span></div>
                                <div className="bar-bg"><div className="bar-violations" style={{width: `${pct(violations)}%`}}/></div>
                              </div>
                            );
                          })()}
                        </div>

                        {/* Top licenses */}
                        <div className="chart-card">
                          <h3 className="chart-title">Top Licenses</h3>
                          {(() => {
                            const selData = selectedResult.data || selectedResult;
                            const pkgs = selData?.sbom?.packages || [];
                            const counts = {};
                            pkgs.forEach(p => {
                              const lic = (p.licenseDeclared || p.licenseConcluded || 'NOASSERTION').toString();
                              counts[lic] = (counts[lic] || 0) + 1;
                            });
                            const entries = Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,6);
                            const total = pkgs.length || 0;

                            if (entries.length === 0) return <div className="legend">No package license data available</div>;

                            return (
                              <div>
                                {entries.map(([lic, cnt]) => {
                                  const w = total ? Math.round((cnt/total)*100) : 0;
                                  return (
                                    <div key={lic} className="license-row">
                                      <div className="license-label">{lic}</div>
                                      <div className="bar-bg small"><div className="bar-compliant" style={{width: `${w}%`}}/></div>
                                      <div className="license-count">{cnt}</div>
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Delete Confirmation Modal */}
          {showDeleteConfirm && (
            <div className="modal-overlay">
              <div className="delete-modal">
                <div className="modal-header">
                  <h3>Delete Analysis Result</h3>
                </div>
                <div className="modal-content">
                  <p>Are you sure you want to delete the analysis for <strong>"{resultToDelete?.projectName}"</strong>?</p>
                  <p className="warning-text">This action cannot be undone.</p>
                </div>
                <div className="modal-actions">
                  <button 
                    className="cancel-btn"
                    onClick={cancelDelete}
                    disabled={deleting}
                  >
                    Cancel
                  </button>
                  <button 
                    className="confirm-delete-btn"
                    onClick={confirmDelete}
                    disabled={deleting}
                  >
                    {deleting ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
        <Footer />
      </main>
    </div>
  );
};

export default ResultsPage;