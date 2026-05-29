import React, { useState, useEffect } from "react";
import { auth, db } from "../firebase";
import { collection, query, where, getDocs, doc, updateDoc } from "firebase/firestore";
import { RecaptchaVerifier, signInWithPhoneNumber } from "firebase/auth";
import { useNavigate, useLocation } from "react-router-dom";
import { getDeviceId, bindDevice } from "../utils/deviceBinding";

// ─── OTP Modal Component ─────────────────────────────────────────────────────
function OTPModal({ onVerify, onCancel }) {
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [verifying, setVerifying] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!otp.trim()) { setError("Please enter the OTP."); return; }
    
    setVerifying(true);
    setError("");
    try {
      if (window.confirmationResult) {
        await window.confirmationResult.confirm(otp.trim());
        onVerify(); // Success
      } else {
        setError("OTP session expired. Please try logging in again.");
      }
    } catch (err) {
      console.error(err);
      setError("❌ Incorrect or expired OTP. Please try again.");
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
    }}>
      <div style={{
        background: '#fff', borderRadius: '20px', padding: '40px',
        maxWidth: '400px', width: '90%', textAlign: 'center',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
      }}>
        <div style={{ fontSize: '48px', marginBottom: '15px' }}>📲</div>
        <h3 style={{ margin: '0 0 10px', color: '#333' }}>New Device Detected</h3>
        <p style={{ color: '#666', fontSize: '14px', marginBottom: '20px' }}>
          A secure verification code has been sent via SMS to your registered phone number.
          Enter it below to authorize this device.
        </p>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            inputMode="numeric"
            maxLength="6"
            placeholder="Enter OTP"
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            style={{
              width: '100%', fontSize: '24px', letterSpacing: '8px',
              textAlign: 'center', padding: '12px', border: '2px solid #667eea',
              borderRadius: '10px', marginBottom: '15px', boxSizing: 'border-box'
            }}
            autoFocus
            disabled={verifying}
          />
          {error && <p style={{ color: '#c0392b', fontSize: '13px', marginBottom: '10px' }}>{error}</p>}
          <div style={{ display: 'flex', gap: '10px' }}>
            <button type="submit" disabled={verifying} style={{
              flex: 1, padding: '14px', background: 'linear-gradient(135deg, #667eea, #764ba2)',
              color: '#fff', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: '600'
            }}>
              {verifying ? 'Verifying...' : '✅ Verify Device'}
            </button>
            <button type="button" onClick={onCancel} disabled={verifying} style={{
              flex: 1, padding: '14px', background: '#f0f0f0',
              color: '#333', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: '600'
            }}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main Login Component ─────────────────────────────────────────────────────
function Login({ setUser }) {
  const navigate = useNavigate();
  const location = useLocation();
  const preSelectedRole = location.state?.role || "";

  const [role, setRole] = useState(preSelectedRole);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // OTP / Device binding state
  const [showOTP, setShowOTP] = useState(false);
  const [pendingUser, setPendingUser] = useState(null);
  const [pendingRole, setPendingRole] = useState(null);

  useEffect(() => {
    // Initialize Firebase Recaptcha
    if (!window.recaptchaVerifier) {
      window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
        'size': 'invisible',
        callback: () => {
          // reCAPTCHA solved
        }
      });
    }
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (!role || !name || !phone) {
      setError("Please fill in all fields.");
      setLoading(false);
      return;
    }

    try {
      let colRef = null;
      if (role === "hod") colRef = collection(db, "hods");
      else if (role === "teacher") colRef = collection(db, "teachers");
      else if (role === "student") colRef = collection(db, "students");
      else { setError("Please select a valid role."); setLoading(false); return; }

      const q = query(colRef, where("name", "==", name.trim()), where("phone", "==", phone.trim()));
      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        setError("Login failed. Please check your name and phone number.");
        setLoading(false);
        return;
      }

      const userDoc = snapshot.docs[0];
      const userData = { ...userDoc.data(), id: userDoc.id, role };

      // ── Device Binding Check ──────────────────────────────────────────
      const currentDeviceId = getDeviceId();
      const storedDeviceId = userData.deviceId;

      if (!storedDeviceId) {
        // First login on any device — bind this device automatically
        await updateDoc(doc(db, role === 'hod' ? 'hods' : role === 'teacher' ? 'teachers' : 'students', userDoc.id), {
          deviceId: currentDeviceId
        });
        userData.deviceId = currentDeviceId;
        completeLogin(userData, role);
      } else if (storedDeviceId === currentDeviceId) {
        // Same device — allow in
        completeLogin(userData, role);
      } else {
        // Different device — require real SMS OTP verification
        try {
          const appVerifier = window.recaptchaVerifier;
          const phoneNumber = "+91" + phone.trim(); // Assume India (+91)
          
          setLoading(true); // show loading while SMS sends
          const confirmationResult = await signInWithPhoneNumber(auth, phoneNumber, appVerifier);
          window.confirmationResult = confirmationResult;
          
          setPendingUser(userData);
          setPendingRole(role);
          setLoading(false);
          setShowOTP(true);
        } catch (smsError) {
          console.error("SMS Error:", smsError);
          // Surface the specific error code to the user for debugging
          const errorCode = smsError.code || "unknown-error";
          setError(`Failed to send SMS OTP: ${errorCode}. Please ensure your domain is authorized in Firebase.`);
          setLoading(false);
          
          // Reset recaptcha on error so user can't get stuck
          if (window.recaptchaVerifier) {
            window.recaptchaVerifier.render().then(widgetId => {
              window.grecaptcha.reset(widgetId);
            });
          }
        }
      }
    } catch (err) {
      console.error("Login error:", err);
      setError("Login failed. Please try again later.");
      setLoading(false);
    }
  };

  const completeLogin = (userData, userRole) => {
    setLoading(false);
    setUser(userData);

    const from = location.state?.from;
    if (from && userRole === "student") {
      navigate(from, { replace: true });
    } else if (userRole === "hod") {
      navigate("/hod-dashboard", { replace: true });
    } else if (userRole === "teacher") {
      navigate("/teacher-dashboard", { replace: true });
    } else {
      navigate("/student-dashboard", { replace: true });
    }
  };

  const handleOTPVerified = async () => {
    // Bind the new device in Firestore
    const newDeviceId = getDeviceId();
    bindDevice(newDeviceId);
    try {
      const colName = pendingRole === 'hod' ? 'hods' : pendingRole === 'teacher' ? 'teachers' : 'students';
      await updateDoc(doc(db, colName, pendingUser.id), { deviceId: newDeviceId });
      pendingUser.deviceId = newDeviceId;
    } catch (err) {
      console.error('Device binding update error:', err);
    }
    setShowOTP(false);
    completeLogin(pendingUser, pendingRole);
  };

  const handleOTPCancel = () => {
    setShowOTP(false);
    setPendingUser(null);
    setPendingRole(null);
    window.confirmationResult = null;
  };

  const handleRegisterClick = () => {
    navigate('/register', { state: { role: role || 'student' } });
  };

  return (
    <>
      <div id="recaptcha-container"></div>
      {showOTP && <OTPModal onVerify={handleOTPVerified} onCancel={handleOTPCancel} />}

      <div className="gradient-bg" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', padding: '20px' }}>
        <div className="container" style={{ maxWidth: '500px' }}>
          <h2>🔐 Login {role && `as ${role.charAt(0).toUpperCase() + role.slice(1)}`}</h2>
          <form onSubmit={handleLogin}>
            <div className="form-group">
              <label>Select Role *</label>
              <select value={role} onChange={(e) => setRole(e.target.value)} required>
                <option value="">-- Select Role --</option>
                <option value="student">Student</option>
                <option value="teacher">Teacher</option>
                <option value="hod">Head of Department (HOD)</option>
              </select>
            </div>

            <div className="form-group">
              <label>Full Name *</label>
              <input
                type="text"
                placeholder="Enter your full name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label>Phone Number (Password) *</label>
              <input
                type="tel"
                placeholder="Enter your phone number"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                maxLength="10"
              />
            </div>

            <button type="submit" disabled={loading} style={{ width: '100%' }}>
              {loading ? 'Logging in...' : '🔐 Login'}
            </button>

            {error && (
              <div className="alert alert-error" style={{ marginTop: '15px' }}>
                {error}
              </div>
            )}
          </form>

          {/* Device security badge */}
          <div style={{
            marginTop: '15px', padding: '10px 15px', background: '#e8f5e9',
            borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#2e7d32'
          }}>
            <span>🔒</span>
            <span><strong>Device Binding Active</strong> — only your registered device can log in.</span>
          </div>

          {(role === 'student' || role === 'hod') && (
            <div style={{ textAlign: 'center', marginTop: '20px', padding: '15px', background: '#f0f0f0', borderRadius: '10px' }}>
              <p style={{ color: '#666', marginBottom: '10px' }}>Don't have an account?</p>
              <button onClick={handleRegisterClick} className="btn btn-success" style={{ width: '100%' }}>
                📝 Register as {role === 'student' ? 'Student' : 'HOD'}
              </button>
            </div>
          )}

          {role === 'teacher' && (
            <div className="alert alert-info" style={{ marginTop: '20px' }}>
              <strong>Note:</strong> Teachers cannot self-register. Please contact your HOD to create your account.
            </div>
          )}

          <div style={{ textAlign: 'center', marginTop: '20px' }}>
            <button
              onClick={() => navigate('/')}
              style={{ background: 'transparent', color: '#667eea', textDecoration: 'underline', border: 'none', cursor: 'pointer', fontSize: '15px' }}
            >
              ← Back to Role Selection
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export default Login;