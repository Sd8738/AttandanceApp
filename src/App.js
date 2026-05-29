import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Login from './components/Login';
import Registration from './components/Registration';
import RoleSelection from './components/RoleSelection';
import StudentDashboard from './components/StudentDashboard';
import TeacherDashboard from './components/TeacherDashboard';
import HODDashboard from './components/HODDashboard';

// Protected Route Component
function ProtectedRoute({ children, allowedRole, user }) {
  const [isLoading, setIsLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(user);
  const location = useLocation();

  useEffect(() => {
    // Check localStorage if user is not in state
    if (!currentUser) {
      const savedUser = localStorage.getItem('user');
      if (savedUser) {
        try {
          const parsedUser = JSON.parse(savedUser);
          setCurrentUser(parsedUser);
        } catch (error) {
          console.error('Error parsing saved user:', error);
          localStorage.removeItem('user');
        }
      }
    }
    setIsLoading(false);
  }, [currentUser]);

  if (isLoading) {
    return (
      <div className="gradient-bg" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="loading">Loading...</div>
      </div>
    );
  }

  if (!currentUser) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  if (allowedRole && currentUser.role !== allowedRole) {
    return <Navigate to="/" replace />;
  }

  return children;
}

function App() {
  const [user, setUser] = useState(null);
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    // Load user from localStorage on app start
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      try {
        const parsedUser = JSON.parse(savedUser);
        setUser(parsedUser);
      } catch (error) {
        console.error('Error loading user from localStorage:', error);
        localStorage.removeItem('user');
      }
    }
    setIsInitializing(false);
  }, []);

  // Update user state when localStorage changes (e.g., from login)
  const handleSetUser = (userData) => {
    setUser(userData);
    if (userData) {
      localStorage.setItem('user', JSON.stringify(userData));
    } else {
      localStorage.removeItem('user');
    }
  };

  if (isInitializing) {
    return (
      <div className="gradient-bg" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="loading">Initializing...</div>
      </div>
    );
  }

  return (
    <Router>
      <Routes>
        <Route path="/" element={<RoleSelection />} />
        <Route path="/login" element={<Login setUser={handleSetUser} />} />
        <Route path="/register" element={<Registration />} />
        
        {/* Student Routes */}
        <Route 
          path="/student-dashboard" 
          element={
            <ProtectedRoute allowedRole="student" user={user}>
              <StudentDashboard user={user} />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/attendance/:teacherId/:division" 
          element={
            <ProtectedRoute allowedRole="student" user={user}>
              <StudentDashboard user={user} />
            </ProtectedRoute>
          } 
        />
        
        {/* Teacher Routes */}
        <Route 
          path="/teacher-dashboard" 
          element={
            <ProtectedRoute allowedRole="teacher" user={user}>
              <TeacherDashboard user={user} />
            </ProtectedRoute>
          } 
        />
        
        {/* HOD Routes */}
        <Route 
          path="/hod-dashboard" 
          element={
            <ProtectedRoute allowedRole="hod" user={user}>
              <HODDashboard user={user} />
            </ProtectedRoute>
          } 
        />
        
        {/* Catch all - redirect to home */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;