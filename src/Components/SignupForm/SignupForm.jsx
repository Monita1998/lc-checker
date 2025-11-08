import React, { useState } from "react";
import "./SignupForm.css";
import loginImage from "../Assets/boy-looking-at-screen.png";
import googleLogo from "../Assets/google-color.svg";
import { IoIosEye, IoIosEyeOff } from "react-icons/io";
import { auth, db } from "../../firebase"; 
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";

const SignupForm = () => {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    // Validate passwords match
    if (formData.password !== formData.confirmPassword) {
      toast.error("Passwords do not match!");
      setLoading(false);
      return;
    }

    // Validate password length
    if (formData.password.length < 6) {
      toast.error("Password must be at least 6 characters long!");
      setLoading(false);
      return;
    }

    try {
      // Create user in Firebase Auth
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        formData.email,
        formData.password
      );
      const user = userCredential.user;

      // Update user profile with display name
      await updateProfile(user, {
        displayName: formData.name
      });

      // Create user document in Firestore
      await setDoc(doc(db, "users", user.uid), {
        uid: user.uid,
        fullName: formData.name,
        email: formData.email,
        createdAt: serverTimestamp(),
        lastActiveAt: serverTimestamp(),
        isActive: true,
        uploads: [] // Initially empty
      });

      toast.success("Account created successfully! Redirecting...");
      
      // Reset form
      setFormData({
        name: "",
        email: "",
        password: "",
        confirmPassword: "",
      });

      // Redirect to home page after short delay
      setTimeout(() => {
        navigate("/home");
      }, 2000);

    } catch (err) {
      console.error("Signup error:", err);
      
      // Handle specific Firebase errors
      if (err.code === 'auth/email-already-in-use') {
        toast.error("This email is already registered. Please use a different email.");
      } else if (err.code === 'auth/invalid-email') {
        toast.error("Please enter a valid email address.");
      } else if (err.code === 'auth/weak-password') {
        toast.error("Password is too weak. Please use a stronger password.");
      } else if (err.code === 'auth/network-request-failed') {
        toast.error("Network error. Please check your internet connection.");
      } else {
        toast.error(err.message || "An error occurred during signup. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="signup-wrapper">
      <div className="signup-image">
        <img src={loginImage} alt="Signup Illustration" />
      </div>

      <div className="signup-container">
        <h2>Create Account</h2>
        <p className="signup-subtitle">Join us today! Please fill in your details.</p>

        <form onSubmit={handleSubmit} className="signup-form">
          <div className="form-group">
            <label>Full Name</label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="Enter your name"
              required
              disabled={loading}
            />
          </div>

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
                minLength="6"
              />
              <span
                className="eye-icon"
                onClick={() => !loading && setShowPassword(!showPassword)}
              >
                {showPassword ? <IoIosEyeOff /> : <IoIosEye />}
              </span>
            </div>
          </div>

          <div className="form-group password-group">
            <label>Confirm Password</label>
            <div className="password-wrapper">
              <input
                type={showConfirmPassword ? "text" : "password"}
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                placeholder="Confirm your password"
                required
                disabled={loading}
                minLength="6"
              />
              <span
                className="eye-icon"
                onClick={() => !loading && setShowConfirmPassword(!showConfirmPassword)}
              >
                {showConfirmPassword ? <IoIosEyeOff /> : <IoIosEye />}
              </span>
            </div>
          </div>

          <button 
            type="submit" 
            className="signup-button"
            disabled={loading}
          >
            {loading ? "Creating Account..." : "Sign Up"}
          </button>
        </form>

        <p className="login-link">
          Already have an account? <a href="/login">Login</a>
        </p>
      </div>
    </div>
  );
};

export default SignupForm;