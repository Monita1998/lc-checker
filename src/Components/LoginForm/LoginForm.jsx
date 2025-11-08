import React, { useState } from "react";
import "./LoginForm.css";
import loginImage from "../Assets/boy-looking-at-screen.png";
import googleLogo from "../Assets/google-color.svg";
import { IoIosEye, IoIosEyeOff } from "react-icons/io";
import { auth, db } from "../../firebase"; 
import { signInWithEmailAndPassword, sendPasswordResetEmail } from "firebase/auth";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";

const LoginForm = () => {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    rememberMe: false
  });

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData({
      ...formData,
      [name]: type === "checkbox" ? checked : value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const userCredential = await signInWithEmailAndPassword(
        auth,
        formData.email,
        formData.password
      );
      
      const user = userCredential.user;

      // Update last active timestamp in Firestore
      try {
        await updateDoc(doc(db, "users", user.uid), {
          lastActiveAt: serverTimestamp(),
          isActive: true
        });
      } catch (firestoreError) {
        console.log("Firestore update skipped - user document might not exist yet");
      }

      toast.success("Login successful! Redirecting...");
      
      // Reset form
      setFormData({
        email: "",
        password: "",
        rememberMe: formData.rememberMe // Keep remember me preference
      });

      // Redirect to home page after short delay
      setTimeout(() => {
        navigate("/home");
      }, 1500);

    } catch (err) {
      console.error("Login error:", err);
      
      // Handle specific Firebase errors with user-friendly messages
      if (err.code === 'auth/invalid-email') {
        toast.error("Please enter a valid email address.");
      } else if (err.code === 'auth/user-disabled') {
        toast.error("This account has been disabled. Please contact support.");
      } else if (err.code === 'auth/user-not-found') {
        toast.error("No account found with this email. Please sign up first.");
      } else if (err.code === 'auth/wrong-password') {
        toast.error("Incorrect password. Please try again.");
      } else if (err.code === 'auth/too-many-requests') {
        toast.error("Too many failed attempts. Please try again later.");
      } else if (err.code === 'auth/network-request-failed') {
        toast.error("Network error. Please check your internet connection.");
      } else if (err.code === 'auth/invalid-credential') {
        toast.error("Invalid credentials. Please check your email and password.");
      } else {
        toast.error(err.message || "An error occurred during login. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!formData.email) {
      toast.warning("Please enter your email address to reset your password.");
      return;
    }

    try {
      await sendPasswordResetEmail(auth, formData.email);
      toast.success(`Password reset email sent to ${formData.email}! Check your inbox.`);
    } catch (err) {
      console.error("Password reset error:", err);
      
      if (err.code === 'auth/user-not-found') {
        toast.error("No account found with this email address.");
      } else if (err.code === 'auth/invalid-email') {
        toast.error("Please enter a valid email address.");
      } else if (err.code === 'auth/too-many-requests') {
        toast.error("Too many reset attempts. Please try again later.");
      } else {
        toast.error(err.message || "Failed to send reset email. Please try again.");
      }
    }
  };

  const handleGoogleLogin = () => {
    toast.info("Google login coming soon!");
    // Implement Google authentication here when ready
  };

  return (
    <div className="login-wrapper">
      <div className="login-image">
        <img src={loginImage} alt="Login Illustration" />
      </div>

      <div className="login-container">
        <h2>Login</h2>
        <p className="login-subtitle">Welcome back! Please enter your details.</p>

        <form onSubmit={handleSubmit} className="login-form">
          {/* Google Login Button */}
          <button 
            type="button" 
            className="google-login"
            onClick={handleGoogleLogin}
            disabled={loading}
          >
            <img src={googleLogo} alt="Google" className="google-icon" />
            Login with Google
          </button>
          
          <div className="divider">OR</div>

          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="Enter your email"
              required
              disabled={loading}
            />
          </div>

          <div className="form-group password-group">
            <label>Password</label>
            <div className="password-wrapper">
              <input
                type={showPassword ? "text" : "password"}
                name="password"
                value={formData.password}
                onChange={handleChange}
                placeholder="Enter your password"
                required
                disabled={loading}
              />
              <span
                className="eye-icon"
                onClick={() => !loading && setShowPassword(!showPassword)}
              >
                {showPassword ? <IoIosEyeOff /> : <IoIosEye />}
              </span>
            </div>
          </div>

          <div className="form-options">
            <label className="remember-me">
              <input
                type="checkbox"
                name="rememberMe"
                checked={formData.rememberMe}
                onChange={handleChange}
                disabled={loading}
              />
              Remember Me
            </label>
            <span 
              className="forgot-password" 
              onClick={handleForgotPassword}
              style={{ cursor: 'pointer' }}
            >
              Forgot Password?
            </span>
          </div>

          <button 
            type="submit" 
            className="login-button"
            disabled={loading}
          >
            {loading ? "Logging in..." : "Login"}
          </button>
        </form>

        <p className="signup-link">
          Don't have an account? <a href="/signup">Sign up</a>
        </p>
      </div>
    </div>
  );
};

export default LoginForm;