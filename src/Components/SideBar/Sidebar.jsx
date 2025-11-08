import React, { useState } from "react";
import { FaHome, FaProjectDiagram, FaChartBar, FaSignOutAlt } from "react-icons/fa";
import { SiReact } from "react-icons/si";
import { useNavigate, useLocation } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "../../firebase";
import { toast } from "react-toastify";
import "./Sidebar.css";

const Sidebar = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const getActivePage = () => {
    if (location.pathname === "/projects") return "Projects";
    if (location.pathname === "/results") return "Results";
    return "Home";
  };

  const [active, setActive] = useState(getActivePage);

  const handleActive = (page, path) => {
    setActive(page);
    navigate(path);
  };

  // 🔐 Firebase logout
  const handleLogout = async () => {
    try {
      await signOut(auth);
      // Clear any local storage
      localStorage.removeItem("token");
      sessionStorage.clear();
      
      toast.success("Logged out successfully");
      navigate("/login");
    } catch (error) {
      console.error("Logout error:", error);
      toast.error("Failed to logout");
    }
  };

  return (
    <div className="sidebar-container">
      <div className="sidebar-logo">
        <SiReact className="logo-icon" />
        <h2>License Checker</h2>
      </div>

      <nav className="sidebar-nav">
        <button className={`nav-btn ${active === "Home" ? "active" : ""}`} onClick={() => handleActive("Home", "/home")}>
          <FaHome className="nav-icon" /> Home
        </button>
        <button className={`nav-btn ${active === "Projects" ? "active" : ""}`} onClick={() => handleActive("Projects", "/projects")}>
          <FaProjectDiagram className="nav-icon" /> Projects
        </button>
        <button className={`nav-btn ${active === "Results" ? "active" : ""}`} onClick={() => handleActive("Results", "/results")}>
          <FaChartBar className="nav-icon" /> Results
        </button>
      </nav>

      <div className="sidebar-footer">
        <button className="logout-btn" onClick={handleLogout}>
          <FaSignOutAlt className="nav-icon" /> Logout
        </button>
      </div>
    </div>
  );
};

export default Sidebar;