import React, { useState } from "react";
import Sidebar from "../../Components/SideBar/Sidebar";
import Footer from "../../Components/Footer/FooterNew";
import Upload from "../../Components/Upload/upload"; // ensure correct path/case
import "./HomePage.css";

const HomePage = () => {
  const [activePage, setActivePage] = useState("Home");

  const renderContent = () => {
    switch (activePage) {
      case "Home":
        return (
          <div className="home-content">
            <h1>Welcome to License Checker</h1>
            <p>Upload your project files to begin license compliance checks.</p>
            <Upload />
          </div>
        );
      case "Projects":
      case "Results":
        return (
          <div className="content-section empty-state">
            <h2>No data added yet</h2>
            <p>Please upload a project and return to the Home Page.</p>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="home-container">
      {/* Sidebar 20% */}
      <aside className="sidebar">
        <Sidebar activePage={activePage} setActivePage={setActivePage} />
      </aside>

      {/* Main content 80% */}
      <main className="main-content">
        {renderContent()}
        <Footer />
      </main>
    </div>
  );
};

export default HomePage;
