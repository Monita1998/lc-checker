import React, { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db } from '../../firebase';
import { useNavigate } from 'react-router-dom';

const HomeRedirect = () => {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        // Check if user has projects
        try {
          const q = query(collection(db, "uploads"), where("uid", "==", user.uid));
          const querySnapshot = await getDocs(q);
          
          if (querySnapshot.size > 0) {
            navigate("/projects");
          } else {
            navigate("/home");
          }
        } catch (error) {
          console.error("Error checking projects:", error);
          navigate("/home");
        }
      } else {
        navigate("/login");
      }
      setChecking(false);
    });

    return () => unsubscribe();
  }, [navigate]);

  if (checking) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        fontSize: '18px',
        color: '#333'
      }}>
        Loading...
      </div>
    );
  }

  return null;
};

export default HomeRedirect;