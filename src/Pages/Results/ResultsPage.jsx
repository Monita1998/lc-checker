import React, { useState, useEffect } from "react";
import { useLocation } from 'react-router-dom';
import { collection, query, orderBy, limit, doc, getDoc, deleteDoc, where, onSnapshot } from "firebase/firestore";
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
  const lastSelectedId = (() => {
    try { return localStorage.getItem('lc:lastSelectedResultId'); } catch { return null; }
  })();

  // Cache key for storing results in localStorage
  const CACHE_KEY = 'lc:resultsCache';
  const CACHE_EXPIRY_KEY = 'lc:resultsCacheExpiry';
  const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  // Load cached results on mount for instant display
  useEffect(() => {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      const expiry = localStorage.getItem(CACHE_EXPIRY_KEY);
      
      if (cached && expiry) {
        const expiryTime = parseInt(expiry, 10);
        if (Date.now() < expiryTime) {
          const cachedResults = JSON.parse(cached);
          console.log('📦 Loaded cached results:', cachedResults.length);
          setResults(cachedResults);
          
          // Set initial selection from cache
          const initial = chooseInitialSelection(cachedResults);
          if (initial) {
            setSelectedResult(initial);
            setLoading(false); // Show cached data immediately
          }
        } else {
          console.log('⏱️ Cache expired, will fetch fresh data');
          localStorage.removeItem(CACHE_KEY);
          localStorage.removeItem(CACHE_EXPIRY_KEY);
        }
      }
    } catch (error) {
      console.warn('Failed to load cache:', error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save results to cache whenever they update
  const saveToCache = (resultsData) => {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(resultsData));
      localStorage.setItem(CACHE_EXPIRY_KEY, (Date.now() + CACHE_DURATION).toString());
      console.log('💾 Cached', resultsData.length, 'results');
    } catch (error) {
      console.warn('Failed to save cache:', error);
    }
  };

  // Helper to choose a sensible default selection mirroring Projects page behavior
  const chooseInitialSelection = (resultsData) => {
    if (!Array.isArray(resultsData) || resultsData.length === 0) return null;
    // Priority: navigation param -> last selected -> first with results -> first item
    if (desiredProjectId) {
      const byNav = resultsData.find(r => r.uploadId === desiredProjectId || r.id === desiredProjectId);
      if (byNav) return byNav;
    }
    if (lastSelectedId) {
      const byLast = resultsData.find(r => r.id === lastSelectedId || r.uploadId === lastSelectedId);
      if (byLast) return byLast;
    }
    const withResult = resultsData.find(r => r.hasResult);
    return withResult || resultsData[0];
  };

  useEffect(() => {
    let unsubscribeSnapshot = null;
    let unsubscribeUploads = null;
    let unsubscribeAuth = null;

    const attachListener = (user) => {
      if (unsubscribeSnapshot) {
        try { unsubscribeSnapshot(); } catch (e) { /* ignore */ }
        unsubscribeSnapshot = null;
      }
      if (unsubscribeUploads) {
        try { unsubscribeUploads(); } catch (e) { /* ignore */ }
        unsubscribeUploads = null;
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

      // Store results data in a ref-like pattern to share across listeners
      let currentResultsMap = new Map();

      unsubscribeSnapshot = onSnapshot(resultsQuery, async (snapshot) => {
        try {
          // Build a map of results keyed by uploadId (or id)
          currentResultsMap = new Map();
          for (const docSnap of snapshot.docs) {
            const resultData = { id: docSnap.id, ...docSnap.data() };
            const key = resultData.uploadId || resultData.id;
            currentResultsMap.set(key, { ...resultData, hasResult: true });
          }

          // Always fetch the user's uploads and merge them so the selector shows ALL projects
          if (user && user.uid) {
            try {
              const uploadsQ = query(
                collection(db, 'uploads'),
                where('uid', '==', user.uid),
                orderBy('uploadedAt', 'desc')
              );
              
              // Live sync uploads so dropdown matches Projects tab in real time
              unsubscribeUploads = onSnapshot(uploadsQ, (uploadsSnap) => {
                try {
                  // Create a fresh map from current results
                  const mergedMap = new Map(currentResultsMap);
                  
                  // Preserve existing data field from previous results state
                  setResults(prevResults => {
                    // Add/update with upload data
                    for (const upSnap of uploadsSnap.docs) {
                      const up = upSnap.data();
                      const uploadId = upSnap.id;
                      
                      // Find previous version to preserve loaded data
                      const prevItem = prevResults.find(r => r.id === uploadId || r.uploadId === uploadId);
                      
                      if (mergedMap.has(uploadId)) {
                        // Update existing result with upload metadata
                        const existing = mergedMap.get(uploadId);
                        mergedMap.set(uploadId, {
                          ...existing,
                          projectName: up.originalName || existing.projectName || 'Unnamed Project',
                          uploadedAt: existing.uploadedAt || up.uploadedAt || up.createdAt,
                          size: existing.size || up.size,
                          mimetype: existing.mimetype || up.mimetype || up.mimeType,
                          status: existing.status || up.status,
                          errorMessage: existing.errorMessage || up.errorMessage,
                          data: prevItem?.data || existing.data // Preserve loaded data
                        });
                      } else {
                        // Add upload without analysis result
                        mergedMap.set(uploadId, {
                          id: uploadId,
                          uploadId: uploadId,
                          projectName: up.originalName || 'Unnamed Project',
                          hasResult: false,
                          status: up.status || 'not_scanned',
                          errorMessage: up.errorMessage || '',
                          uploadedAt: up.uploadedAt || up.createdAt || null,
                          size: up.size || null,
                          mimetype: up.mimetype || up.mimeType || 'ZIP Archive',
                          data: prevItem?.data // Preserve loaded data if exists
                        });
                      }
                    }

                    // Sort by most recent first
                    const resultsData = Array.from(mergedMap.values()).sort((a, b) => {
                      const ta = a.analyzedAt || a.uploadedAt || 0;
                      const tb = b.analyzedAt || b.uploadedAt || 0;
                      return (tb?.seconds || tb || 0) - (ta?.seconds || ta || 0);
                    });

                    saveToCache(resultsData); // Cache the merged results
                    
                    // Update selection intelligently - preserve existing data if available
                    setSelectedResult(prevSel => {
                      if (!prevSel) return chooseInitialSelection(resultsData);
                      // Find the updated version of the current selection
                      const updated = resultsData.find(r => r.id === prevSel.id || r.uploadId === prevSel.uploadId);
                      if (updated) {
                        // Preserve the 'data' field if it was already loaded
                        return prevSel.data ? { ...updated, data: prevSel.data } : updated;
                      }
                      return chooseInitialSelection(resultsData);
                    });
                    
                    return resultsData;
                  });
                  
                  setLoading(false);
                } catch (mergeErr) {
                  console.warn('Failed merging uploads into results selector:', mergeErr);
                  setLoading(false);
                }
              }, (err) => {
                console.error('Realtime uploads listener error:', err);
                setLoading(false);
              });
            } catch (e) {
              console.warn('Failed to attach uploads listener:', e);
              setLoading(false);
            }
          } else {
            // No user logged in - just show results
            setResults(prevResults => {
              const resultsData = Array.from(currentResultsMap.values()).map(item => {
                // Preserve loaded data from previous state
                const prevItem = prevResults.find(r => r.id === item.id);
                return prevItem?.data ? { ...item, data: prevItem.data } : item;
              }).sort((a, b) => {
                const ta = a.analyzedAt || a.uploadedAt || 0;
                const tb = b.analyzedAt || b.uploadedAt || 0;
                return (tb?.seconds || tb || 0) - (ta?.seconds || ta || 0);
              });

              saveToCache(resultsData); // Cache results for non-logged-in users too
              
              // Update selection intelligently - preserve existing data if available
              setSelectedResult(prevSel => {
                if (!prevSel) return chooseInitialSelection(resultsData);
                const updated = resultsData.find(r => r.id === prevSel.id || r.uploadId === prevSel.uploadId);
                if (updated) {
                  return prevSel.data ? { ...updated, data: prevSel.data } : updated;
                }
                return chooseInitialSelection(resultsData);
              });
              
              return resultsData;
            });
            
            setLoading(false);
          }
        } catch (err) {
          console.error('Error handling snapshot:', err);
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
      try { if (unsubscribeUploads) unsubscribeUploads(); } catch(e) {}
      try { if (unsubscribeAuth) unsubscribeAuth(); } catch(e) {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desiredProjectId]);

  // If a selected result doesn't include embedded `data`, try to fetch the
  // full report JSON from Cloud Storage using the `reportPath` field that the
  // analyzer function uploads. This keeps Firestore small while still letting
  // the UI show full charts on demand.
  // Now with caching to avoid repeated downloads.
  useEffect(() => {
    if (!selectedResult) return;
    if (selectedResult.data) return; // already have it
    if (!selectedResult.reportPath) return;

    // Check cache first
    const reportCacheKey = `lc:report:${selectedResult.id}`;
    try {
      const cached = localStorage.getItem(reportCacheKey);
      if (cached) {
        const cachedData = JSON.parse(cached);
        console.log('📦 Loaded cached report for:', selectedResult.id);
        setSelectedResult(prev => prev ? { ...prev, data: cachedData } : prev);
        setResults(prev => prev.map(r => r.id === selectedResult.id ? { ...r, data: cachedData } : r));
        return;
      }
    } catch (err) {
      console.warn('Failed to load cached report:', err);
    }

    // Fetch from storage if not cached
    let cancelled = false;
    (async () => {
      try {
        const url = await getDownloadURL(storageRef(storage, selectedResult.reportPath));
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`Fetch failed: ${resp.status}`);
        const json = await resp.json();
        if (cancelled) return;
        
        // Cache the report data
        try {
          localStorage.setItem(reportCacheKey, JSON.stringify(json));
          console.log('💾 Cached report for:', selectedResult.id);
        } catch (cacheErr) {
          console.warn('Failed to cache report (might be too large):', cacheErr);
        }
        
        // attach the fetched data to selectedResult and results list
        setSelectedResult(prev => prev ? { ...prev, data: json } : prev);
        setResults(prev => prev.map(r => r.id === selectedResult.id ? { ...r, data: json } : r));
      } catch (err) {
        console.warn('Failed to load report from storage:', err);
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedResult?.id, selectedResult?.reportPath]);

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
      saveToCache(updatedResults); // Update cache after deletion
      
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
                  try { if (sel?.id) localStorage.setItem('lc:lastSelectedResultId', sel.id); } catch {}
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
                        <ChartsPanel analysis={(selectedResult && (selectedResult.data || selectedResult)) || {}} projectName={selectedResult?.projectName} />
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