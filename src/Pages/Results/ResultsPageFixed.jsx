import React, { useState, useEffect } from "react";
import { useLocation } from 'react-router-dom';
import { collection, query, orderBy, limit, doc, getDoc, getDocs, deleteDoc, where, onSnapshot } from "firebase/firestore";
import { auth, db } from "../../firebase";
import { onAuthStateChanged } from "firebase/auth";
import Sidebar from "../../Components/SideBar/Sidebar";
import Footer from "../../Components/Footer/FooterNew";
import ChartsPanel from "../../Components/ResultsCharts/ChartsPanel";
import "./ResultsPage.css";

const ResultsPageFixed = () => {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedResult, setSelectedResult] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [resultToDelete, setResultToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [showJsonRaw, setShowJsonRaw] = useState(false);

  const location = useLocation();
  const desiredProjectId = location?.state?.projectId || null;

  useEffect(() => {
    let unsubscribeSnapshot = null;
    let unsubscribeAuth = null;

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

          // If no results were returned for the user, try to recover by looking up uploads the user owns
          if (resultsData.length === 0 && user && user.uid) {
            try {
              const uploadsQ = query(collection(db, 'uploads'), where('uid', '==', user.uid), orderBy('createdAt', 'desc'), limit(20));
              const uploadsSnap = await getDocs(uploadsQ);
              for (const upSnap of uploadsSnap.docs) {
                const uploadId = upSnap.id;
                try {
                  const resultDoc = await getDoc(doc(db, 'results', uploadId));
                  if (resultDoc.exists()) {
                    const rd = { id: resultDoc.id, ...resultDoc.data() };
                    rd.projectName = upSnap.data().originalName || rd.projectName || 'Project Analysis';
                    resultsData.push(rd);
                  }
                } catch (e) {
                  // ignore per-upload fetch errors
                }
              }
            } catch (e) {
              console.warn('Fallback fetch of uploads failed:', e);
            }
          }

          setResults(resultsData);
          if (desiredProjectId) {
            let matched = resultsData.find(r => r.uploadId === desiredProjectId || r.id === desiredProjectId) || null;
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
    unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      attachListener(user);
    });

    // If we were navigated to with a specific projectId, try a fast-path fetch of that result
    // so the UI can show it immediately while the realtime listener settles.
    (async () => {
      if (!desiredProjectId) return;
      try {
        const quickDoc = await getDoc(doc(db, 'results', desiredProjectId));
        if (quickDoc.exists()) {
          const quickData = { id: quickDoc.id, ...quickDoc.data() };
          // Try to populate projectName from uploads if available
          try {
            const uploadDoc = await getDoc(doc(db, 'uploads', desiredProjectId));
            if (uploadDoc.exists()) {
              quickData.projectName = uploadDoc.data().originalName || quickData.projectName || 'Project Analysis';
            }
          } catch (e) {
            // ignore
          }

          setResults(prev => {
            // avoid duplicates
            const exists = prev.find(r => r.id === quickData.id);
            return exists ? prev : [quickData, ...prev];
          });
          setSelectedResult(quickData);
        }
      } catch (e) {
        // ignore quick fetch errors
      }
    })();

    return () => {
      try { if (unsubscribeSnapshot) unsubscribeSnapshot(); } catch(e) {}
      try { if (unsubscribeAuth) unsubscribeAuth(); } catch(e) {}
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
    link.download = `${(result.projectName || 'project').replace(/\s+/g, '_')}_analysis.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

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
            {/* Project selector: lists all available projects and shows count */}
            <div style={{ width: '100%', marginTop: 12 }}>
              <label htmlFor="results-select" className="results-select-label">Select Project to show result ({results.length})</label>
              <select
                id="results-select"
                value={selectedResult?.id || ''}
                onChange={(e) => {
                  const sel = results.find(r => r.id === e.target.value);
                  setSelectedResult(sel || null);
                  try {
                    // scroll charts into view for better UX
                    const el = document.getElementById('charts-panel');
                    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  } catch (err) {}
                }}
                style={{ width: '100%', padding: '10px', borderRadius: 6, border: '1px solid #e2e8f0' }}
              >
                <option value="">-- Choose a project --</option>
                {results.map((result) => (
                  <option key={result.id} value={result.id}>
                    {result.projectName}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {results.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📊</div>
              <h2>No Analysis Results</h2>
              <p>Upload and analyze a project to see results here.</p>
            </div>
          ) : (
            <div className="results-layout">
              {/* Result Details - full-width charts area */}
              {selectedResult && (
                <div className="result-details full-width">
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
                    <div id="charts-panel" className="json-view-section charts-area">
                      <ChartsPanel analysis={(selectedResult && (selectedResult.data || selectedResult)) || {}} />
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

export default ResultsPageFixed;
