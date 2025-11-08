import React from "react";
import "./Footer.css";

const Footer = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="footer-container">
      <p>
        © {currentYear} License Checker. All rights reserved.
      </p>
    </footer>
  );
};

export default Footer;
