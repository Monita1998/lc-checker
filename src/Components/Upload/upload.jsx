import React, { useState, useRef } from "react";
import { FaCloudUploadAlt, FaSpinner } from "react-icons/fa";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { collection, addDoc, updateDoc, doc, serverTimestamp } from "firebase/firestore";
import { auth, storage, db } from "../../firebase";
import { toast } from "react-toastify";
import { useNavigate } from "react-router-dom";
import "./upload.css";

const Upload = () => {
  const navigate = useNavigate();
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const handleFiles = async (selectedFiles) => {
    const newFiles = Array.from(selectedFiles);

    // Filter only ZIP files
    const zipFiles = newFiles.filter(file =>
      file.type === 'application/zip' || file.name.toLowerCase().endsWith('.zip')
    );

    if (zipFiles.length !== newFiles.length) {
      toast.warning("Only ZIP files are supported. Other file types were ignored.");
    }

    if (zipFiles.length > 0) {
      await uploadFilesToFirebase(zipFiles);
    }
  };

  const uploadFilesToFirebase = async (filesToUpload) => {
    const user = auth.currentUser;

    if (!user) {
      toast.error("Please log in to upload files");
      return;
    }

    setUploading(true);

    try {
      // Upload files one by one
      for (const file of filesToUpload) {
        await uploadSingleFile(file);
      }
      
      toast.success("All files uploaded successfully! Redirecting...");
      navigate("/projects");
      
    } catch (error) {
      console.error("Upload process error:", error);
      toast.error("Some files failed to upload");
      navigate("/projects"); // Still redirect
    } finally {
      setUploading(false);
    }
  };

  const uploadSingleFile = async (file) => {
    let documentId = null;
    
    try {
      const user = auth.currentUser;
      const timestamp = Date.now();
      const uniqueFilename = `${user.uid}/${timestamp}_${file.name}`;
      
      // Create Firestore document first
      const uploadDocRef = await addDoc(collection(db, "uploads"), {
        uid: user.uid,
        filename: uniqueFilename,
        originalName: file.name,
        size: file.size,
        mimetype: file.type,
        status: 'uploading', // Start with uploading status
        uploadedAt: serverTimestamp(),
        storagePath: `uploads/${uniqueFilename}`,
        createdAt: serverTimestamp()
      });

      documentId = uploadDocRef.id;
      console.log(`Firestore document created: ${documentId}`);

      // Upload to Storage
      const storageRef = ref(storage, `uploads/${uniqueFilename}`);
      console.log(`Starting upload for: ${file.name}`);
      
      const snapshot = await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(snapshot.ref);

      // ✅ FIX: Update status to 'not_scanned' after successful upload
      await updateDoc(doc(db, "uploads", documentId), {
        status: 'not_scanned',
        downloadURL: downloadURL,
        updatedAt: serverTimestamp()
      });

      console.log(`✅ Upload completed and status updated for: ${file.name}`);
      toast.success(`${file.name} uploaded successfully!`);

    } catch (error) {
      console.error(`❌ Upload failed for ${file.name}:`, error);
      
      // Update status to failed if document was created
      if (documentId) {
        try {
          await updateDoc(doc(db, "uploads", documentId), {
            status: 'upload_failed',
            errorMessage: error.message,
            updatedAt: serverTimestamp()
          });
        } catch (updateError) {
          console.error("Failed to update failed status:", updateError);
        }
      }
      
      throw error; // Re-throw to stop the process
    }
  };

  const handleBrowseClick = (e) => {
    e.stopPropagation();
    fileInputRef.current.click();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    handleFiles(e.dataTransfer.files);
  };

  const handleDragOver = (e) => e.preventDefault();
  
  const handleUploadAreaClick = (e) => {
    if (e.target === e.currentTarget) fileInputRef.current.click();
  };
  
  const handleFileInputChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
      e.target.value = '';
    }
  };

  return (
    <div className="upload-section">
      <div className="upload-box">
        <div className="upload-header">
          <h3>Project Upload</h3>
          <p>Upload your project files (ZIP only) to analyze dependencies and check license compliance.</p>
          <p>Export a ZIP with only node_modules, package.json, and package-lock.json.</p>
          <p><b>Do not include any project source code.</b></p>
        </div>

        <div
          className="upload-area"
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onClick={handleUploadAreaClick}
        >
          <div className="upload-icon">
            {uploading ? <FaSpinner className="spinner" size={40} /> : <FaCloudUploadAlt size={40} color="#58a6ff" />}
          </div>
          <p className="upload-text">{uploading ? "Uploading files..." : "Drop your ZIP files here"}</p>
          <span className="upload-subtext">
            {uploading ? "Please wait while we upload your files..." : "or click below to browse and select files"}
          </span>
          <div className="upload-button-wrapper">
            <button className="browse-btn" onClick={handleBrowseClick} disabled={uploading} type="button">
              {uploading ? "Uploading..." : "Browse Files"}
            </button>
            <input
              type="file"
              multiple
              accept=".zip,application/zip"
              ref={fileInputRef}
              style={{ display: "none" }}
              onChange={handleFileInputChange}
              disabled={uploading}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Upload;