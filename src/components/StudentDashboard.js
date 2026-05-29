import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Webcam from 'react-webcam';
import { db } from '../firebase';
import { doc, getDoc, collection, query, where, getDocs, addDoc, Timestamp } from 'firebase/firestore';
import { getDistanceMeters, getCurrentPosition } from '../utils/geo';
import {
  addToOfflineQueue,
  getOfflineQueue,
  clearOfflineQueue,
  getOfflineQueueCount
} from '../utils/offlineSync';

// ─── Constants ────────────────────────────────────────────────────────────────
const ATTENDANCE_THRESHOLD_PCT = 75; // Warn below this %
const ASSUMED_TOTAL_LECTURES = 60;

// ─── Helper: request notification permission ──────────────────────────────────
async function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    await Notification.requestPermission();
  }
}

function sendNotification(title, body, icon = '/icon-192.png') {
  if ('Notification' in window && Notification.permission === 'granted') {
    try { new Notification(title, { body, icon }); } catch (_) {}
  }
}

// ─── Helper: face detection (face-api.js loaded via CDN as window.faceapi) ────
async function detectFace(videoElement) {
  if (typeof window.faceapi === 'undefined') return null;
  try {
    return await window.faceapi.detectSingleFace(
      videoElement,
      new window.faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 })
    );
  } catch (err) {
    console.warn('Face detection error:', err);
    return null;
  }
}

async function loadFaceModels() {
  if (typeof window.faceapi === 'undefined') return false;
  const MODEL_URL = '/models';
  try {
    await window.faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
    return true;
  } catch (err) {
    console.warn('Face model load error:', err);
    return false;
  }
}

// ─── StudentDashboard ─────────────────────────────────────────────────────────
function StudentDashboard({ user }) {
  const navigate = useNavigate();
  const { teacherId, division } = useParams();
  const webcamRef = useRef(null);

  const [attendanceMarked, setAttendanceMarked] = useState(false);
  const [studentLocation, setStudentLocation] = useState(null);
  const [teacherInfo, setTeacherInfo] = useState(null);
  const [lectureInfo, setLectureInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [attendanceHistory, setAttendanceHistory] = useState([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Feature state
  const [faceModelsLoaded, setFaceModelsLoaded] = useState(false);
  const [faceStatus, setFaceStatus] = useState('');       // face detection status text
  const [locationStatus, setLocationStatus] = useState(''); // location check status text
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [offlineQueueCount, setOfflineQueueCount] = useState(getOfflineQueueCount());

  const currentUser = user || JSON.parse(localStorage.getItem('user') || 'null');

  // ── Online/Offline listeners ────────────────────────────────────────────────
  useEffect(() => {
    const goOnline = () => {
      setIsOnline(true);
      syncOfflineQueue();
    };
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Bootstrap ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!currentUser) { navigate('/'); return; }

    requestNotificationPermission();
    getStudentLocation();
    loadFaceModels().then(loaded => {
      setFaceModelsLoaded(loaded);
      if (loaded) setFaceStatus('✅ Face detection ready');
      else setFaceStatus('⚠️ Face detection unavailable (CDN error)');
    });

    if (teacherId) fetchTeacherInfo();
    fetchAttendanceHistory();

    // Sync any offline queue on mount if online
    if (navigator.onLine) syncOfflineQueue();
  }, [currentUser, teacherId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Geolocation ─────────────────────────────────────────────────────────────
  const getStudentLocation = async () => {
    try {
      const pos = await getCurrentPosition();
      setStudentLocation(pos);
      setLocationStatus('📍 Location acquired');
    } catch {
      setLocationStatus('⚠️ Location unavailable');
      setErrorMessage('Location permission denied. Attendance may be restricted.');
    }
  };

  // ── Fetch Teacher Info ───────────────────────────────────────────────────────
  const fetchTeacherInfo = async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const teacherDoc = await getDoc(doc(db, 'teachers', teacherId));
      if (teacherDoc.exists()) {
        const data = teacherDoc.data();
        setTeacherInfo(data);
        if (!data.attendanceEnabled) {
          setErrorMessage('Attendance is currently disabled by the teacher.');
          setLoading(false);
          return;
        }
        if (data.currentLecture) setLectureInfo(data.currentLecture);
        else setErrorMessage('No active lecture session.');

        // Smart notification — active lecture reminder
        sendNotification(
          '📚 Active Lecture!',
          `${data.name} has started a ${data.subject} class. Mark your attendance now!`
        );
      } else {
        setErrorMessage('Teacher information not found. Please check the link.');
      }
    } catch (error) {
      setErrorMessage('Failed to load teacher details: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Fetch Attendance History ─────────────────────────────────────────────────
  const fetchAttendanceHistory = async () => {
    if (!currentUser?.prn) return;
    try {
      const q = query(collection(db, 'attendance'), where('studentPRN', '==', currentUser.prn));
      const querySnapshot = await getDocs(q);
      const history = [];
      querySnapshot.forEach((docSnap) => history.push({ id: docSnap.id, ...docSnap.data() }));
      const sorted = history.sort((a, b) => {
        const tA = a.timestamp?.toDate ? a.timestamp.toDate() : new Date(a.timestamp);
        const tB = b.timestamp?.toDate ? b.timestamp.toDate() : new Date(b.timestamp);
        return tB - tA;
      });
      setAttendanceHistory(sorted);

      // ── Smart notification: low attendance warning ──────────────────────────
      const pct = Math.round((sorted.length / ASSUMED_TOTAL_LECTURES) * 100);
      if (sorted.length > 0 && pct < ATTENDANCE_THRESHOLD_PCT) {
        sendNotification(
          '⚠️ Low Attendance Warning',
          `Your attendance is ${pct}% — below the required 75%. Please attend more classes!`
        );
      }
    } catch (error) {
      console.error('Error fetching attendance history:', error);
    }
  };

  // ── Sync Offline Queue ───────────────────────────────────────────────────────
  const syncOfflineQueue = useCallback(async () => {
    const queue = getOfflineQueue();
    if (queue.length === 0) return;
    let synced = 0;
    for (const record of queue) {
      try {
        const { _offlineId, ...data } = record; // strip our internal key
        if (data.timestamp && typeof data.timestamp === 'string') {
          data.timestamp = Timestamp.fromDate(new Date(data.timestamp));
        }
        await addDoc(collection(db, 'attendance'), data);
        synced++;
      } catch (err) {
        console.error('Failed to sync offline record:', err);
      }
    }
    if (synced > 0) {
      clearOfflineQueue();
      setOfflineQueueCount(0);
      setSuccessMessage(`✅ Synced ${synced} offline attendance record(s)!`);
      setTimeout(() => setSuccessMessage(''), 4000);
      fetchAttendanceHistory();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Mark Attendance ──────────────────────────────────────────────────────────
  const markAttendance = async () => {
    if (!currentUser || attendanceMarked || loading) return;

    if (!teacherId || !teacherInfo) {
      setErrorMessage('Please use the attendance link provided by your teacher.');
      return;
    }
    if (!teacherInfo.attendanceEnabled) {
      setErrorMessage('Attendance is currently disabled by the teacher.');
      return;
    }

    setLoading(true);
    setErrorMessage('');
    setSuccessMessage('');

    // ── STEP 1: Face Liveness Detection ─────────────────────────────────────
    if (faceModelsLoaded && webcamRef.current?.video) {
      setFaceStatus('🔍 Detecting face...');
      const detection = await detectFace(webcamRef.current.video);
      if (!detection) {
        setFaceStatus('❌ No face detected');
        setErrorMessage('🧠 Face not detected! Please look at the camera clearly.');
        setLoading(false);
        return;
      }
      setFaceStatus('✅ Face verified');
    }

    // ── STEP 2: Location / Anti-Spoof Check ─────────────────────────────────
    const teacherLoc = lectureInfo?.teacherLocation;
    if (teacherLoc && studentLocation) {
      const distance = getDistanceMeters(
        studentLocation.latitude, studentLocation.longitude,
        teacherLoc.latitude, teacherLoc.longitude
      );
      const radius = lectureInfo?.allowedRadiusMeters || 50;
      setLocationStatus(`📐 Distance: ${Math.round(distance)}m (limit: ${radius}m)`);
      if (distance > radius) {
        setErrorMessage(
          `🔐 Location mismatch! You are ${Math.round(distance)}m away (max allowed: ${radius}m). ` +
          `Please be in the classroom to mark attendance.`
        );
        setLoading(false);
        return;
      }
    } else if (teacherLoc && !studentLocation) {
      setErrorMessage('📍 Location required! Enable GPS and try again.');
      setLoading(false);
      return;
    }

    // ── STEP 3: Build Attendance Payload & Save ──────────────────────────────
    try {
      const now = new Date();
      const attendanceData = {
        studentId: currentUser.id || currentUser.prn || 'Unknown',
        studentName: currentUser.name || currentUser.fullName || 'Unknown',
        studentPRN: currentUser.prn || 'Unknown',
        department: currentUser.department || teacherInfo.department || 'Unknown',
        division: division || currentUser.division || 'Unknown',
        class: currentUser.class || 'Unknown',
        timestamp: Timestamp.fromDate(now),
        location: studentLocation || null,
        teacherId: teacherId,
        teacherName: teacherInfo.name,
        subject: teacherInfo.subject,
        lectureNumber: lectureInfo?.number || 'N/A',
        lectureDate: lectureInfo?.date || now.toISOString().split('T')[0],
        faceVerified: faceModelsLoaded,
        locationVerified: !!(teacherLoc && studentLocation)
      };

      if (!isOnline) {
        // ── OFFLINE: save to local queue ──────────────────────────────────
        addToOfflineQueue({ ...attendanceData, timestamp: now.toISOString() });
        setOfflineQueueCount(getOfflineQueueCount());
        setAttendanceMarked(true);
        setSuccessMessage('📶 You are offline. Attendance saved locally and will sync when online.');
      } else {
        // ── ONLINE: push to Firestore ─────────────────────────────────────
        await addDoc(collection(db, 'attendance'), attendanceData);
        setAttendanceMarked(true);
        setSuccessMessage('✅ Attendance marked successfully!');
        sendNotification('✅ Attendance Marked', `Your attendance for ${teacherInfo.subject} has been recorded.`);
        setTimeout(() => fetchAttendanceHistory(), 1000);
      }
    } catch (error) {
      setErrorMessage('Failed to mark attendance: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('user');
    navigate('/', { replace: true });
    window.location.reload();
  };

  const formatTimestamp = (ts) => {
    if (!ts) return 'N/A';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleString();
  };

  const attendancePct = attendanceHistory.length > 0
    ? Math.round((attendanceHistory.length / ASSUMED_TOTAL_LECTURES) * 100)
    : 0;

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="gradient-bg">
      <div className="container">
        <div className="dashboard-header">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
            <div>
              <h1>Welcome, {currentUser.name || currentUser.fullName}!</h1>
              <p>PRN: {currentUser.prn} | Class: {currentUser.class} | Division: {currentUser.division}</p>
            </div>
            <button onClick={handleLogout} className="btn btn-danger">Logout</button>
          </div>
        </div>

        {/* ── Security Status Bar ── */}
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '20px'
        }}>
          <div style={{ padding: '8px 14px', borderRadius: '20px', fontSize: '13px', fontWeight: '600',
            background: faceModelsLoaded ? '#e8f5e9' : '#fff3e0', color: faceModelsLoaded ? '#2e7d32' : '#e65100' }}>
            🧠 {faceStatus || 'Loading face models...'}
          </div>
          <div style={{ padding: '8px 14px', borderRadius: '20px', fontSize: '13px', fontWeight: '600',
            background: studentLocation ? '#e8f5e9' : '#fce4ec', color: studentLocation ? '#2e7d32' : '#b71c1c' }}>
            {locationStatus || '📍 Getting location...'}
          </div>
          <div style={{ padding: '8px 14px', borderRadius: '20px', fontSize: '13px', fontWeight: '600',
            background: isOnline ? '#e8f5e9' : '#fff3e0', color: isOnline ? '#2e7d32' : '#e65100' }}>
            {isOnline ? '🌐 Online' : `📶 Offline${offlineQueueCount > 0 ? ` (${offlineQueueCount} queued)` : ''}`}
          </div>
        </div>

        {errorMessage && <div className="alert alert-error">{errorMessage}</div>}
        {successMessage && <div className="alert alert-success">{successMessage}</div>}

        {/* ── Offline Queue Banner ── */}
        {offlineQueueCount > 0 && isOnline && (
          <div className="alert alert-info" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>📶 {offlineQueueCount} attendance record(s) pending sync.</span>
            <button className="btn" onClick={syncOfflineQueue} style={{ padding: '6px 14px', fontSize: '13px' }}>
              🔄 Sync Now
            </button>
          </div>
        )}

        {/* ── Lecture Info Card ── */}
        {teacherId && teacherInfo && (
          <div className="card" style={{ background: 'linear-gradient(135deg, #e0f7fa 0%, #b2ebf2 100%)', textAlign: 'center' }}>
            <h3>📚 Current Lecture Session</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', marginTop: '20px' }}>
              <div><strong>Teacher:</strong><p>{teacherInfo.name}</p></div>
              <div><strong>Subject:</strong><p>{teacherInfo.subject}</p></div>
              <div><strong>Lecture:</strong><p>{lectureInfo?.number || 'N/A'}</p></div>
              <div><strong>Date:</strong><p>{lectureInfo?.date || 'N/A'}</p></div>
              <div><strong>Division:</strong><p>{division || currentUser.division}</p></div>
              <div>
                <strong>Location Check:</strong>
                <p style={{ color: lectureInfo?.teacherLocation ? '#2e7d32' : '#757575', fontSize: '13px' }}>
                  {lectureInfo?.teacherLocation ? `✅ Active (±${lectureInfo.allowedRadiusMeters}m)` : 'Not enabled'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── Webcam + Mark Button ── */}
        <div style={{ textAlign: 'center', margin: '30px 0' }}>
          <div className="webcam-container" style={{ marginBottom: '20px' }}>
            <Webcam
              ref={webcamRef}
              audio={false}
              screenshotFormat="image/jpeg"
              width={320}
              height={240}
              videoConstraints={{ width: 320, height: 240, facingMode: 'user' }}
              style={{ borderRadius: '15px' }}
            />
          </div>

          <button
            className="attendance-btn"
            onClick={markAttendance}
            disabled={attendanceMarked || loading || !teacherId || !teacherInfo?.attendanceEnabled}
          >
            {loading ? 'Processing...' :
             attendanceMarked ? '✅\nMarked' :
             '📝\nMark\nAttendance'}
          </button>
          {!teacherId && (
            <p style={{ color: '#e65100', fontWeight: '600', marginTop: '15px' }}>
              ⚠️ Use the teacher's attendance link to mark attendance
            </p>
          )}
        </div>

        {/* ── Attendance Stats ── */}
        <div className="stats-grid">
          <div className="stat-card">
            <h3>Total Classes</h3>
            <div className="stat-value">{attendanceHistory.length}</div>
          </div>
          <div className="stat-card">
            <h3>This Month</h3>
            <div className="stat-value">
              {attendanceHistory.filter(a => {
                const d = a.timestamp?.toDate ? a.timestamp.toDate() : new Date(a.timestamp);
                return d.getMonth() === new Date().getMonth();
              }).length}
            </div>
          </div>
          <div className="stat-card">
            <h3>Attendance %</h3>
            <div className="stat-value" style={{ color: attendancePct < 75 ? '#c0392b' : '#27ae60' }}>
              {attendancePct}%
            </div>
          </div>
        </div>

        {/* ── Low Attendance Warning ── */}
        {attendancePct > 0 && attendancePct < ATTENDANCE_THRESHOLD_PCT && (
          <div style={{
            background: 'linear-gradient(135deg, #ff6b6b, #ee5a24)',
            color: '#fff', borderRadius: '15px', padding: '20px',
            textAlign: 'center', marginBottom: '20px', fontWeight: '600'
          }}>
            ⚠️ <strong>Low Attendance Alert!</strong> Your attendance is <strong>{attendancePct}%</strong>
            {' '}— below the required 75%. Please attend more classes!
          </div>
        )}

        {/* ── Attendance History ── */}
        <div className="card">
          <h3>📋 Recent Attendance History</h3>
          {attendanceHistory.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#666', padding: '20px' }}>
              No attendance records yet. Mark your first attendance!
            </p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Date &amp; Time</th>
                    <th>Subject</th>
                    <th>Teacher</th>
                    <th>Lecture</th>
                    <th>Security</th>
                  </tr>
                </thead>
                <tbody>
                  {attendanceHistory.slice(0, 10).map((record) => (
                    <tr key={record.id}>
                      <td>{formatTimestamp(record.timestamp)}</td>
                      <td>{record.subject}</td>
                      <td>{record.teacherName}</td>
                      <td>{record.lectureNumber} ({record.lectureDate})</td>
                      <td>
                        {record.faceVerified ? '🧠' : ''}
                        {record.locationVerified ? '📍' : ''}
                        {!record.faceVerified && !record.locationVerified ? '—' : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default StudentDashboard;