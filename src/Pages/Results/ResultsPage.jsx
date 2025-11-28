import React, { useState, useEffect } from "react";
import { useLocation } from 'react-router-dom';
import { collection, query, orderBy, limit, doc, getDoc, getDocs, deleteDoc, where, onSnapshot } from "firebase/firestore";
import { auth, db, storage } from "../../firebase";
import { ref as storageRef, getDownloadURL } from 'firebase/storage';
import { onAuthStateChanged } from "firebase/auth";
import Sidebar from "../../Components/SideBar/Sidebar";
import Footer from "../../Components/Footer/FooterNew";
import ChartsPanel from "../../Components/ResultsCharts/ChartsPanel";
import "./ResultsPage.css";

const ResultsPage = () => {
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
          // Build a map of results keyed by uploadId (or id)
          const resultsMap = new Map();
          for (const docSnap of snapshot.docs) {
            const resultData = { id: docSnap.id, ...docSnap.data() };
            const key = resultData.uploadId || resultData.id;
            // ensure we have a projectName (prefer upload originalName when available)
            resultsMap.set(key, { ...resultData, hasResult: true });
          }

          // Always fetch the user's uploads and merge them so the selector shows ALL projects
          if (user && user.uid) {
            try {
              const uploadsQ = query(collection(db, 'uploads'), where('uid', '==', user.uid), orderBy('uploadedAt', 'desc'), limit(200));
              const uploadsSnap = await getDocs(uploadsQ);
              for (const upSnap of uploadsSnap.docs) {
                const up = upSnap.data();
                const uploadId = upSnap.id;
                if (resultsMap.has(uploadId)) {
                  // augment existing result entry with upload fields for display
                  const existing = resultsMap.get(uploadId);
                  existing.projectName = up.originalName || existing.projectName || 'Unnamed Project';
                  existing.uploadedAt = existing.uploadedAt || up.uploadedAt || up.createdAt;
                  existing.size = existing.size || up.size;
                  existing.mimetype = existing.mimetype || up.mimetype || up.mimeType;
                  existing.status = existing.status || up.status;
                  existing.errorMessage = existing.errorMessage || up.errorMessage;
                  resultsMap.set(uploadId, existing);
                } else {
                  // create a placeholder entry for uploads without results
                  const placeholder = {
                    id: uploadId,
                    uploadId: uploadId,
                    projectName: up.originalName || 'Unnamed Project',
                    hasResult: false,
                    status: up.status || 'not_scanned',
                    errorMessage: up.errorMessage || '',
                    uploadedAt: up.uploadedAt || up.createdAt || null,
                    size: up.size || null,
                    mimetype: up.mimetype || up.mimeType || 'ZIP Archive'
                  };
                  resultsMap.set(uploadId, placeholder);
                }
              }
            } catch (e) {
              console.warn('Failed to load uploads for merging into results selector:', e);
            }
          }

          // Convert map to an ordered array (keep the order from the realtime snapshot first, then remaining uploads)
          const resultsData = Array.from(resultsMap.values()).sort((a, b) => {
            const ta = a.analyzedAt || a.uploadedAt || 0;
            const tb = b.analyzedAt || b.uploadedAt || 0;
            return (tb || 0) - (ta || 0);
          });

          setResults(resultsData);
          if (desiredProjectId) {
            const matched = resultsData.find(r => r.uploadId === desiredProjectId || r.id === desiredProjectId) || null;
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

  // If a selected result doesn't include embedded `data`, try to fetch the
  // full report JSON from Cloud Storage using the `reportPath` field that the
  // analyzer function uploads. This keeps Firestore small while still letting
  // the UI show full charts on demand.
  useEffect(() => {
    if (!selectedResult) return;
    if (selectedResult.data) return; // already have it
    if (!selectedResult.reportPath) return;

    let cancelled = false;
    (async () => {
      try {
        const url = await getDownloadURL(storageRef(storage, selectedResult.reportPath));
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`Fetch failed: ${resp.status}`);
        const json = await resp.json();
        if (cancelled) return;
        // attach the fetched data to selectedResult and results list
        setSelectedResult(prev => prev ? { ...prev, data: json } : prev);
        setResults(prev => prev.map(r => r.id === selectedResult.id ? { ...r, data: json } : r));
      } catch (err) {
        console.warn('Failed to load report from storage:', err);
      }
    })();

    return () => { cancelled = true; };
  }, [selectedResult]);

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
                            <label htmlFor="view-select" className="json-label">View</label>
                            <select
                              id="view-select"
                              value={showJsonRaw ? 'json' : 'charts'}
                              onChange={(e) => setShowJsonRaw(e.target.value === 'json')}
                              style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff' }}
                            >
                              <option value="charts">Charts</option>
                              <option value="json">JSON</option>
                            </select>
                            <button
                              className="small-download-btn"
                              title="Download JSON"
                              onClick={() => downloadResults(selectedResult)}
                            >
                              ⤓
                            </button>
                      </div>
                    </div>

                  {/* Render JSON or Charts view, or show a friendly message when no analysis exists */}
                  {selectedResult.hasResult === false ? (
                    <div className="empty-state">
                      <div className="empty-icon">ℹ️</div>
                      <h2>Project not analyzed</h2>
                      <p>
                        This project ({selectedResult.projectName}) has not been analyzed.
                        Current status: <strong>{selectedResult.status || 'not_scanned'}</strong>.
                      </p>
                      {selectedResult.errorMessage && (
                        <p className="error-text">Reason: {selectedResult.errorMessage}</p>
                      )}
                      <p>You can re-upload the project.</p>
                    </div>
                  ) : (
                    (showJsonRaw ? (
                      <div className="json-view-section">
                        <div className="json-view-content">
                          <pre>{JSON.stringify(selectedResult, null, 2)}</pre>
                        </div>
                      </div>
                    ) : (
                      <div id="charts-panel" className="json-view-section charts-area">
                        <ChartsPanel analysis={(selectedResult && (selectedResult.data || selectedResult)) || {}} />
                      </div>
                    ))
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