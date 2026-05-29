import React from 'react';
import { useNavigate } from 'react-router-dom';
import InstallPWA from './InstallPWA';

function RoleSelection() {
  const navigate = useNavigate();

  return (
    <div className="gradient-bg role-selection">
      <InstallPWA />
      
      <h1>🎓 AuthenTrack 2.0</h1>
      <h2 style={{ color: 'white', fontSize: '20px', marginBottom: '40px' }}>
        Select Your Role to Continue
      </h2>
      <div className="role-grid">
        {/* Student Card */}
        <div className="role-card" style={{ cursor: 'default' }}>
          <div style={{ fontSize: '64px', marginBottom: '20px' }}>👨‍🎓</div>
          <h3>Student</h3>
          <p>Mark attendance and view your records</p>
          <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <button 
              className="btn"
              onClick={() => navigate('/login', { state: { role: 'student' } })}
              style={{ width: '100%', fontSize: '16px', padding: '12px' }}
            >
              🔐 Login
            </button>
            <button 
              className="btn btn-success"
              onClick={() => navigate('/register', { state: { role: 'student' } })}
              style={{ width: '100%', fontSize: '16px', padding: '12px' }}
            >
              📝 Register
            </button>
          </div>
        </div>

        {/* Teacher Card */}
        <div className="role-card" style={{ cursor: 'default' }}>
          <div style={{ fontSize: '64px', marginBottom: '20px' }}>👨‍🏫</div>
          <h3>Teacher</h3>
          <p>Manage classes and track attendance</p>
          <div style={{ marginTop: '20px' }}>
            <button 
              className="btn"
              onClick={() => navigate('/login', { state: { role: 'teacher' } })}
              style={{ width: '100%', fontSize: '16px', padding: '12px' }}
            >
              🔐 Login
            </button>
          </div>
          <p style={{ 
            fontSize: '12px', 
            color: 'rgba(255, 255, 255, 0.7)', 
            marginTop: '15px', 
            fontStyle: 'italic',
            padding: '10px',
            background: 'rgba(0, 0, 0, 0.2)',
            borderRadius: '8px'
          }}>
            ℹ️ Teachers cannot self-register. Contact your HOD.
          </p>
        </div>

        {/* HOD Card */}
        <div className="role-card" style={{ cursor: 'default' }}>
          <div style={{ fontSize: '64px', marginBottom: '20px' }}>👨‍💼</div>
          <h3>HOD</h3>
          <p>Department administration and oversight</p>
          <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <button 
              className="btn"
              onClick={() => navigate('/login', { state: { role: 'hod' } })}
              style={{ width: '100%', fontSize: '16px', padding: '12px' }}
            >
              🔐 Login
            </button>
            <button 
              className="btn btn-success"
              onClick={() => navigate('/register', { state: { role: 'hod' } })}
              style={{ width: '100%', fontSize: '16px', padding: '12px' }}
            >
              📝 Register
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default RoleSelection;