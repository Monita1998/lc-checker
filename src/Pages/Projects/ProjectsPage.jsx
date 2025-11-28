import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { collection, query, where, onSnapshot, orderBy, deleteDoc, doc, getDocs } from "firebase/firestore";
import { auth, db, storage } from "../../firebase";
import { ref as storageRef, deleteObject } from 'firebase/storage';
import Sidebar from "../../Components/SideBar/Sidebar";
import Footer from "../../Components/Footer/FooterNew";
import { toast } from "react-toastify";
import "./ProjectsPage.css";

const ProjectsPage = () => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);
  const [notifiedFailureId, setNotifiedFailureId] = useState(null);

  useEffect(() => {
    const user = auth.currentUser;
    
    if (!user) {
      navigate("/login");
      return;
    }

    const q = query(
      collection(db, "uploads"),
      where("uid", "==", user.uid),
      orderBy("uploadedAt", "desc")
    );

    const unsubscribe = onSnapshot(q, 
      (querySnapshot) => {
        console.log("✅ Projects loaded:", querySnapshot.size);
        
        const projectsData = [];
        querySnapshot.forEach((doc) => {
          projectsData.push({ id: doc.id, ...doc.data() });
        });

        setProjects(projectsData);
        // auto-select first project when available
        setSelectedProject(projectsData[0] || null);
        setLoading(false);
      },
      (error) => {
        console.error("❌ Firestore error:", error);
        toast.error("Error loading projects");
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [navigate]);

  const handleAddProject = () => {
    navigate("/home");
  };

  const handleDeleteProject = async (project) => {
    if (!window.confirm(`Are you sure you want to delete "${project.originalName}"? This action cannot be undone.`)) {
      return;
    }

    setDeletingId(project.id);

    try {
      // Delete any analysis results associated with this uploadId
      try {
        const resultsQ = query(
          collection(db, "results"),
          where("uploadId", "==", project.id)
        );
        const resultsSnap = await getDocs(resultsQ);
        if (!resultsSnap.empty) {
          const deletes = resultsSnap.docs.map(d => deleteDoc(doc(db, "results", d.id)));
          await Promise.all(deletes);
          console.log(`✅ Deleted ${resultsSnap.size} result(s) for upload ${project.id}`);
        }
      } catch (innerErr) {
        console.warn("⚠️ Failed to delete associated results:", innerErr);
        // continue to delete the upload document and storage objects anyway
      }

      // Attempt to delete the uploaded file in Cloud Storage (if storagePath is present)
      try {
        const storagePath = project.storagePath || project.downloadURL || project.path || project.filePath;
        if (storagePath) {
          // If storagePath is a gs:// URL, convert to a path
          let objectPath = storagePath;
          if (objectPath.startsWith('gs://')) {
            // gs://bucket-name/path/to/object
            const parts = objectPath.replace('gs://', '').split('/');
            parts.shift(); // remove bucket
            objectPath = parts.join('/');
          }

          // If it's a full https URL we cannot reliably convert to object path; skip in that case
          if (!objectPath.startsWith('http')) {
            try {
              await deleteObject(storageRef(storage, objectPath));
              console.log('✅ Deleted uploaded file from storage:', objectPath);
            } catch (sErr) {
              console.warn('⚠️ Failed to delete uploaded storage object:', sErr);
            }
          }
        }
      } catch (sErrOuter) {
        console.warn('⚠️ Storage deletion step failed:', sErrOuter);
      }

      // Attempt to delete the report file in reports/ if present
      try {
        const reportPath = `reports/${project.id}-sca-report.json`;
        try {
          await deleteObject(storageRef(storage, reportPath));
          console.log('✅ Deleted report file from storage:', reportPath);
        } catch (rErr) {
          // not fatal
          console.warn('⚠️ Report deletion failed or report does not exist:', rErr);
        }
      } catch (rErrOuter) {
        console.warn('⚠️ Report deletion step failed:', rErrOuter);
      }

      // Delete the upload document
      await deleteDoc(doc(db, "uploads", project.id));
      console.log("✅ Firestore upload document deleted:", project.id);

      if (selectedProject && selectedProject.id === project.id) {
        setSelectedProject(null);
      }

      toast.success(`Project "${project.originalName}" and its results were deleted successfully`);
      
    } catch (error) {
      console.error("❌ Error deleting project:", error);
      toast.error(`Failed to delete project: ${error.message}`);
    } finally {
      setDeletingId(null);
    }
  };

  const handleDownloadResults = async (project) => {
    setDownloadingId(project.id);
    try {
      // Find the analysis results for this project
      const resultsQuery = query(
        collection(db, "results"),
        where("uploadId", "==", project.id)
      );
      
      const resultsSnapshot = await getDocs(resultsQuery);
      
      if (resultsSnapshot.empty) {
        toast.error("No analysis results found for this project");
        return;
      }

      // Get the first result (should be only one per project)
      const resultDoc = resultsSnapshot.docs[0];
      const resultData = resultDoc.data();

      // Create and download JSON file
      const dataStr = JSON.stringify(resultData, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      
      const url = URL.createObjectURL(dataBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${project.originalName.replace(/\s+/g, '_')}_analysis_results.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      toast.success(`Analysis results downloaded for ${project.originalName}`);
      
    } catch (error) {
      console.error("❌ Download error:", error);
      toast.error(`Failed to download results: ${error.message}`);
    } finally {
      setDownloadingId(null);
    }
  };

  const handleViewResults = (project) => {
    // Navigate to results page and pass the project ID
    navigate('/results', { 
      state: { 
        projectId: project.id,
        projectName: project.originalName 
      } 
    });
  };

  const formatFileSize = (bytes) => {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return 'Unknown date';
    try {
      const date = timestamp.toDate();
      return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
    } catch (error) {
      return 'Invalid date';
    }
  };

  const getStatusBadge = (status, errorMessage = '') => {
    const statusConfig = {
      'not_scanned': { class: 'status-not-scanned', text: 'Not Scanned' },
      'scanning': { class: 'status-scanning', text: 'Scanning...' },
      'scanned': { class: 'status-completed', text: 'Scanned' },
  'failed': { class: 'status-failed', text: 'Failed' },
  'invalid_zip': { class: 'status-failed', text: 'Invalid Zip' },
      'error': { class: 'status-failed', text: 'Error' },
      'uploading': { class: 'status-uploading', text: 'Uploading' },
      'completed': { class: 'status-completed', text: 'Completed' },
      'pending_analysis': { class: 'status-scanning', text: 'Processing' }
    };
    
    const config = statusConfig[status] || { class: 'status-unknown', text: status || 'Unknown' };
    
    return (
      <div className="status-container">
        <span className={`status-badge ${config.class}`}>{config.text}</span>
        {status === 'failed' && errorMessage && (
          <div className="error-tooltip">
            <span className="error-icon">⚠️</span>
            <div className="error-message">
              {errorMessage}
            </div>
          </div>
        )}
      </div>
    );
  };

  // Human-friendly status description for the selected project
  const getStatusDescription = (status, errorMessage = '') => {
    switch (status) {
      case 'not_scanned':
        return "Project uploaded but not yet scanned for license compliance.";
      case 'invalid_zip':
        return `Uploaded zip contains unexpected files. Only node_modules, package.json and package-lock.json are allowed.`;
      case 'scanning':
        return "Project is currently being scanned for licenses...";
      case 'scanned':
        return "License scan completed. View results for details.";
      case 'failed':
        return `Scan failed: ${errorMessage || 'Unknown error occurred'}`;
      case 'error':
        return `Error: ${errorMessage || 'An unexpected error occurred'}`;
      case 'uploading':
        return "File is currently being uploaded...";
      case 'completed':
        return "Upload completed successfully.";
      case 'pending_analysis':
        return "Project is queued for license analysis.";
      default:
        return "Status unknown.";
    }
  };

  // Notify user when selected project has failed due to invalid zip / other errors
  useEffect(() => {
    if (!selectedProject) return;
    if ((selectedProject.status === 'failed' || selectedProject.status === 'invalid_zip') && selectedProject.errorMessage) {
      if (selectedProject.id !== notifiedFailureId) {
        toast.error(selectedProject.errorMessage, { autoClose: 8000 });
        setNotifiedFailureId(selectedProject.id);
      }
    }
  }, [selectedProject, notifiedFailureId]);

  

  if (loading) {
    return (
      <div className="project-container">
        <aside className="sidebar">
          <Sidebar />
        </aside>
        <main className="main-content">
          <div className="projects-content">
            <div className="loading-spinner">Loading projects...</div>
          </div>
          <Footer />
        </main>
      </div>
    );
  }

  return (
    <div className="project-container">
      {/* Sidebar */}
      <aside className="sidebar">
        <Sidebar />
      </aside>

      {/* Main content */}
      <main className="main-content">
        <div className="projects-content">
          {projects.length === 0 ? (
            <div className="empty-state">
              <h2>No projects found</h2>
              <p>We couldn't find any uploaded projects in your account.</p>
              <button className="add-project-btn" onClick={handleAddProject}>
                Add Your First Project
              </button>
            </div>
          ) : (
            <div className="projects-layout">
              <div className="projects-header">
                <h2>Your Projects ({projects.length})</h2>
                <button className="add-project-btn" onClick={handleAddProject}>
                  Add New Project
                </button>
              </div>
              
              <div className="projects-grid">
                <div className="projects-list-fullwidth">
                  <label htmlFor="project-select">Select project</label>
                  <select
                    id="project-select"
                    value={selectedProject ? selectedProject.id : ''}
                    onChange={(e) => {
                      const proj = projects.find((p) => p.id === e.target.value);
                      setSelectedProject(proj || null);
                    }}
                    style={{ width: '100%', padding: '10px', margin: '10px 0', borderRadius: '6px' }}
                  >
                    <option value="">-- Choose a project --</option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.originalName || 'Unnamed Project'}
                      </option>
                    ))}
                  </select>

                  <div className="project-details-panel fullwidth">
                    {selectedProject ? (
                      <div className="details-content">
                        <h3 className="project-details-heading">
                          Project Details
                          <span className="project-heading-badge">
                            {getStatusBadge(selectedProject.status, selectedProject.errorMessage)}
                          </span>
                        </h3>
                          <div className="details-grid two-col">
                            <div className="col col-left">
                              <div className="detail-item">
                                <label>File Name:</label>
                                <span>{selectedProject.originalName || 'Unnamed Project'}</span>
                              </div>
                              <div className="detail-item status-description">
                                <label>Uploaded At:</label>
                                <span>{formatDate(selectedProject.uploadedAt)}</span>
                              </div>

                              <div className="detail-item">
                                <label>File Size:</label>
                                <span>{formatFileSize(selectedProject.size)}</span>
                              </div>

                              <div className="detail-item">
                                <label>File Type:</label>
                                <span>{selectedProject.mimetype || selectedProject.mimeType || 'ZIP Archive'}</span>
                              </div>

                              {/* Inline status + badge and primary actions here */}
                              <div className="detail-item status-inline">
                                <label>Status:</label>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <span className="status-desc-inline">{getStatusDescription(selectedProject.status, selectedProject.errorMessage)}</span>
                                </div>
                              </div>

                              <div className="action-row">
                                <div className="action-left">
                                  {selectedProject.status === 'scanned' ? (
                                    <button 
                                      className="download-btn"
                                      onClick={() => handleDownloadResults(selectedProject)}
                                      disabled={downloadingId === selectedProject.id}
                                    >
                                      {downloadingId === selectedProject.id ? 'Downloading' : 'Download the result'}
                                    </button>
                                  ) : (
                                    // No manual "Start" button: scanning is automatic. Show nothing here for unscanned projects.
                                    null
                                  )}
                                </div>

                                <div className="action-center">
                                  {selectedProject.status === 'scanned' && (
                                    <button 
                                      className="analyze-btn"
                                      onClick={() => handleViewResults(selectedProject)}
                                    >
                                      View the result
                                    </button>
                                  )}
                                </div>

                                <div className="action-right">
                                  <button 
                                    className="delete-btn-large"
                                    onClick={() => handleDeleteProject(selectedProject)}
                                    disabled={deletingId === selectedProject.id}
                                  >
                                    {deletingId === selectedProject.id ? 'Deleting' : 'Delete the project'}
                                  </button>
                                </div>
                              </div>
                            </div>

                            {/* right column removed; details now appear inline above */}
                          </div>
                      </div>
                    ) : (
                      <div className="no-selection">
                        <p>Select a project to view details and manage</p>
                      </div>
                    )}
                  </div>
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

export default ProjectsPage;