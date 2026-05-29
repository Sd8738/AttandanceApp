import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import { collection, query, where, getDocs, doc, updateDoc, deleteDoc, getDoc } from 'firebase/firestore';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { getCurrentPosition } from '../utils/geo';
import * as XLSX from 'xlsx';

function TeacherDashboard({ user }) {
  const navigate = useNavigate();
  const currentUser = user || JSON.parse(localStorage.getItem('user') || 'null');

  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [filteredRecords, setFilteredRecords] = useState([]);
  const [divisions, setDivisions] = useState([]);
  const [classes, setClasses] = useState([]);
  const [attendanceEnabled, setAttendanceEnabled] = useState(false);
  const [currentLecture, setCurrentLecture] = useState(null);
  
  // Filters
  const [searchStudent, setSearchStudent] = useState('');
  const [filterDivision, setFilterDivision] = useState('');
  const [filterClass, setFilterClass] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [filterLecture, setFilterLecture] = useState('');
  
  // Lecture form
  const [showLectureForm, setShowLectureForm] = useState(false);
  const [lectureNumber, setLectureNumber] = useState('');
  const [lectureDate, setLectureDate] = useState(new Date().toISOString().split('T')[0]);
  
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [analyticsData, setAnalyticsData] = useState([]);
  const [exportingExcel, setExportingExcel] = useState(false);

  // Advanced Export States
  const [exportClass, setExportClass] = useState('');
  const [exportDivision, setExportDivision] = useState('');
  const [exportRangeType, setExportRangeType] = useState('semester');
  const [exportStartDate, setExportStartDate] = useState('');
  const [exportEndDate, setExportEndDate] = useState('');

  // Location Verification Settings
  const [enableLocationCheck, setEnableLocationCheck] = useState(true);
  const [allowedRadius, setAllowedRadius] = useState(100);

  useEffect(() => {
    if (!currentUser) {
      navigate('/');
      return;
    }
    fetchTeacherData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  useEffect(() => {
    applyFilters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attendanceRecords, searchStudent, filterDivision, filterClass, filterDate, filterLecture]);

  const fetchTeacherData = async () => {
    setLoading(true);
    setErrorMessage('');
    
    try {
      if (!currentUser.id) {
        throw new Error('Teacher ID not found');
      }

      const teacherDoc = await getDoc(doc(db, 'teachers', currentUser.id));
      if (teacherDoc.exists()) {
        const data = teacherDoc.data();
        setDivisions(data.assignedDivisions || []);
        setClasses(data.assignedClasses || []);
        setAttendanceEnabled(data.attendanceEnabled || false);
        setCurrentLecture(data.currentLecture || null);
      }

      const q = query(
        collection(db, 'attendance'),
        where('teacherId', '==', currentUser.id)
      );
      const querySnapshot = await getDocs(q);
      const records = [];
      querySnapshot.forEach((docSnap) => {
        records.push({ id: docSnap.id, ...docSnap.data() });
      });
      
      setAttendanceRecords(records);
      generateAnalytics(records);
    } catch (error) {
      console.error('Error fetching teacher data:', error);
      setErrorMessage('Failed to load data: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...attendanceRecords];

    if (searchStudent) {
      filtered = filtered.filter(r => 
        r.studentName.toLowerCase().includes(searchStudent.toLowerCase()) ||
        r.studentPRN.toLowerCase().includes(searchStudent.toLowerCase())
      );
    }

    if (filterDivision) {
      filtered = filtered.filter(r => r.division === filterDivision);
    }

    if (filterClass) {
      filtered = filtered.filter(r => r.class === filterClass);
    }

    if (filterDate) {
      filtered = filtered.filter(r => r.lectureDate === filterDate);
    }

    if (filterLecture) {
      filtered = filtered.filter(r => 
        r.lectureNumber.toLowerCase().includes(filterLecture.toLowerCase())
      );
    }

    setFilteredRecords(filtered);
  };

  const generateAnalytics = (records) => {
    const dateGroups = {};
    records.forEach(record => {
      const timestamp = record.timestamp?.toDate ? record.timestamp.toDate() : new Date(record.timestamp);
      const date = timestamp.toLocaleDateString();
      if (!dateGroups[date]) {
        dateGroups[date] = 0;
      }
      dateGroups[date]++;
    });

    const analytics = Object.keys(dateGroups)
      .map(date => ({
        date,
        students: dateGroups[date]
      }))
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .slice(-7);

    setAnalyticsData(analytics);
  };

  const handleToggleAttendance = () => {
    if (attendanceEnabled) {
      disableAttendance();
    } else {
      setShowLectureForm(true);
    }
  };

  const enableAttendance = async () => {
    if (!lectureNumber || !lectureDate) {
      setErrorMessage('Please enter lecture number and date.');
      return;
    }

    try {
      // 📍 Capture teacher's real-time location for anti-spoof distance check if enabled
      let teacherLocation = null;
      if (enableLocationCheck) {
        try {
          teacherLocation = await getCurrentPosition();
          setSuccessMessage('📍 Location captured. Enabling attendance...');
        } catch (locErr) {
          console.warn('Could not capture teacher location:', locErr.message);
          setSuccessMessage('⚠️ Location unavailable — students won\'t be distance-verified.');
        }
      }

      const lectureData = {
        number: lectureNumber,
        date: lectureDate,
        teacherLocation: teacherLocation || null,
        allowedRadiusMeters: enableLocationCheck ? allowedRadius : 999999
      };

      await updateDoc(doc(db, 'teachers', currentUser.id), {
        attendanceEnabled: true,
        currentLecture: lectureData
      });
      
      setAttendanceEnabled(true);
      setCurrentLecture(lectureData);
      setShowLectureForm(false);
      setLectureNumber('');
      setLectureDate(new Date().toISOString().split('T')[0]);
      setSuccessMessage('✅ Attendance enabled' + (teacherLocation ? ` with location security (radius: ${allowedRadius}m)!` : ' (no distance check)'));
      setTimeout(() => setSuccessMessage(''), 4000);
    } catch (error) {
      console.error('Error enabling attendance:', error);
      setErrorMessage('Failed to enable attendance: ' + error.message);
    }
  };

  const disableAttendance = async () => {
    try {
      await updateDoc(doc(db, 'teachers', currentUser.id), {
        attendanceEnabled: false,
        currentLecture: null
      });
      
      setAttendanceEnabled(false);
      setCurrentLecture(null);
      setSuccessMessage('Attendance disabled successfully!');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (error) {
      console.error('Error disabling attendance:', error);
      setErrorMessage('Failed to disable attendance: ' + error.message);
    }
  };

  const removeAttendance = async (attendanceId) => {
    if (!window.confirm('Are you sure you want to remove this attendance record?')) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'attendance', attendanceId));
      setSuccessMessage('Attendance removed successfully!');
      fetchTeacherData();
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (error) {
      console.error('Error removing attendance:', error);
      setErrorMessage('Failed to remove attendance: ' + error.message);
    }
  };

  const viewStudentProgress = (studentPRN) => {
    const studentRecords = attendanceRecords.filter(r => r.studentPRN === studentPRN);
    if (studentRecords.length === 0) return;

    setSelectedStudent({
      prn: studentPRN,
      name: studentRecords[0].studentName,
      records: studentRecords,
      total: studentRecords.length,
      percentage: Math.round((studentRecords.length / 60) * 100)
    });
  };

  const getAttendanceLink = (division) => {
    let origin = window.location.origin;
    if (origin.startsWith('http://') && !origin.includes('localhost') && !origin.includes('127.0.0.1')) {
      origin = origin.replace('http://', 'https://');
    }
    return `${origin}/attendance/${currentUser.id}/${division}`;
  };

  const copyLink = (division) => {
    const link = getAttendanceLink(division);
    navigator.clipboard.writeText(link);
    setSuccessMessage(`Link copied for Division ${division}!`);
    setTimeout(() => setSuccessMessage(''), 3000);
  };

  const handleLogout = () => {
    localStorage.removeItem('user');
    navigate('/', { replace: true });
    window.location.reload();
  };

  const clearFilters = () => {
    setSearchStudent('');
    setFilterDivision('');
    setFilterClass('');
    setFilterDate('');
    setFilterLecture('');
  };

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return 'N/A';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleString();
  };

  // 📊 EXCEL EXPORT FUNCTION
  const exportToExcel = () => {
    setExportingExcel(true);
    
    try {
      // Prepare data for Excel
      const excelData = filteredRecords.map((record, index) => ({
        'Sr. No.': index + 1,
        'Student Name': record.studentName,
        'PRN': record.studentPRN,
        'Class': record.class,
        'Division': record.division,
        'Subject': record.subject,
        'Lecture Number': record.lectureNumber,
        'Lecture Date': record.lectureDate,
        'Marked At': formatTimestamp(record.timestamp),
        'Teacher': record.teacherName,
        'Location': record.location ? `${record.location.latitude.toFixed(4)}, ${record.location.longitude.toFixed(4)}` : 'N/A'
      }));

      // Create workbook and worksheet
      const worksheet = XLSX.utils.json_to_sheet(excelData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Attendance');

      // Set column widths
      const columnWidths = [
        { wch: 8 },  // Sr. No.
        { wch: 25 }, // Student Name
        { wch: 15 }, // PRN
        { wch: 10 }, // Class
        { wch: 10 }, // Division
        { wch: 20 }, // Subject
        { wch: 15 }, // Lecture Number
        { wch: 15 }, // Lecture Date
        { wch: 20 }, // Marked At
        { wch: 20 }, // Teacher
        { wch: 25 }  // Location
      ];
      worksheet['!cols'] = columnWidths;

      // Generate filename with current date and teacher name
      const today = new Date().toISOString().split('T')[0];
      const filename = `Attendance_${currentUser.name.replace(/\s+/g, '_')}_${today}.xlsx`;

      // Download
      XLSX.writeFile(workbook, filename);

      setSuccessMessage(`✅ Excel file downloaded: ${filename}`);
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (error) {
      console.error('Error exporting to Excel:', error);
      setErrorMessage('Failed to export to Excel: ' + error.message);
    } finally {
      setExportingExcel(false);
    }
  };

  // Export filtered or all records
  const exportCurrentView = () => {
    if (filteredRecords.length === 0) {
      setErrorMessage('No records to export. Please adjust filters or add attendance records.');
      setTimeout(() => setErrorMessage(''), 3000);
      return;
    }
    exportToExcel();
  };

  // 📊 ADVANCED STRUCTURED EXCEL EXPORT (Entire Semester or Custom Date Range)
  const exportStructuredExcel = async () => {
    if (!exportClass || !exportDivision) {
      setErrorMessage('⚠️ Please select both Class and Division to export.');
      setTimeout(() => setErrorMessage(''), 4000);
      return;
    }

    if (exportRangeType === 'custom' && (!exportStartDate || !exportEndDate)) {
      setErrorMessage('⚠️ Please select both Start Date and End Date for custom date range.');
      setTimeout(() => setErrorMessage(''), 4000);
      return;
    }

    setExportingExcel(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      // 1. Fetch students for the selected class and division
      const studentConstraints = [
        where('class', '==', exportClass),
        where('division', '==', exportDivision)
      ];
      if (currentUser && currentUser.department) {
        studentConstraints.push(where('department', '==', currentUser.department));
      }
      const q = query(collection(db, 'students'), ...studentConstraints);
      const snapshot = await getDocs(q);
      const classStudents = [];
      snapshot.forEach(docSnap => {
        classStudents.push({ id: docSnap.id, ...docSnap.data() });
      });

      if (classStudents.length === 0) {
        throw new Error(`No students found registered in Class ${exportClass}, Division ${exportDivision}.`);
      }

      // Sort students alphabetically by name to assign sequential serial/roll numbers
      classStudents.sort((a, b) => a.name.localeCompare(b.name));

      // 2. Filter attendance records for this class & division & teacher & date range
      let records = attendanceRecords.filter(r => 
        r.class === exportClass && 
        r.division === exportDivision
      );

      if (exportRangeType === 'custom') {
        records = records.filter(r => r.lectureDate >= exportStartDate && r.lectureDate <= exportEndDate);
      }

      // 3. Identify all unique lectures
      const lectureMap = {};
      records.forEach(r => {
        const key = `${r.lectureDate}_${r.lectureNumber || 'N/A'}`;
        if (!lectureMap[key]) {
          lectureMap[key] = {
            date: r.lectureDate,
            number: r.lectureNumber || 'N/A',
            key: key
          };
        }
      });

      // Sort lectures chronologically
      const sortedLectures = Object.values(lectureMap).sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return a.number.localeCompare(b.number);
      });

      // 4. Construct Excel Rows
      const excelRows = classStudents.map((student, idx) => {
        // Roll No (1-based index) | PRN No. | Student Name
        const row = {
          'Roll No.': idx + 1,
          'PRN No.': student.prn,
          'Student Name': student.name
        };

        let attendedCount = 0;

        sortedLectures.forEach(lecture => {
          // Check if this student was present for this lecture
          const wasPresent = records.some(r => 
            r.studentPRN === student.prn && 
            `${r.lectureDate}_${r.lectureNumber || 'N/A'}` === lecture.key
          );

          // Header format: e.g. "04/05/26 (Lecture 1)"
          const colHeader = `${lecture.date} (${lecture.number})`;
          row[colHeader] = wasPresent ? 'P' : 'A';
          if (wasPresent) attendedCount++;
        });

        // Add summary columns
        row['Lectures Attended'] = attendedCount;
        row['Attendance %'] = sortedLectures.length > 0 
          ? `${Math.round((attendedCount / sortedLectures.length) * 100)}%` 
          : '0%';

        return row;
      });

      // Create Workbook and Worksheet
      const worksheet = XLSX.utils.json_to_sheet(excelRows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Attendance Report');

      // Autofit column widths
      const columnWidths = [
        { wch: 10 }, // Roll No.
        { wch: 18 }, // PRN No.
        { wch: 25 }  // Student Name
      ];
      sortedLectures.forEach(() => {
        columnWidths.push({ wch: 18 });
      });
      columnWidths.push({ wch: 18 }); // Lectures Attended
      columnWidths.push({ wch: 15 }); // Attendance %
      worksheet['!cols'] = columnWidths;

      // File Name creation
      const rangeStr = exportRangeType === 'custom' ? `${exportStartDate}_to_${exportEndDate}` : 'Semester';
      const filename = `Attendance_Report_${exportClass}_Div_${exportDivision}_${rangeStr}.xlsx`;

      // Write and download
      XLSX.writeFile(workbook, filename);

      setSuccessMessage(`✅ Advanced Excel report downloaded: ${filename}`);
      setTimeout(() => setSuccessMessage(''), 5000);
    } catch (error) {
      console.error('Error generating advanced Excel:', error);
      setErrorMessage('Failed to generate report: ' + error.message);
      setTimeout(() => setErrorMessage(''), 5000);
    } finally {
      setExportingExcel(false);
    }
  };

  if (loading) {
    return (
      <div className="gradient-bg">
        <div className="loading">Loading...</div>
      </div>
    );
  }

  return (
    <div className="gradient-bg">
      <div className="container">
        <div className="dashboard-header">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
            <div>
              <h1>Teacher Dashboard</h1>
              <p>{currentUser.name} | {currentUser.subject} | {currentUser.department}</p>
            </div>
            <button onClick={handleLogout} className="btn btn-danger">Logout</button>
          </div>
        </div>

        {errorMessage && <div className="alert alert-error">{errorMessage}</div>}
        {successMessage && <div className="alert alert-success">{successMessage}</div>}

        <div className="stats-grid">
          <div className="stat-card">
            <h3>Total Records</h3>
            <div className="stat-value">{attendanceRecords.length}</div>
          </div>
          <div className="stat-card">
            <h3>Today's Attendance</h3>
            <div className="stat-value">
              {attendanceRecords.filter(r => {
                const date = r.timestamp?.toDate ? r.timestamp.toDate() : new Date(r.timestamp);
                return date.toDateString() === new Date().toDateString();
              }).length}
            </div>
          </div>
          <div className="stat-card">
            <h3>Status</h3>
            <div className="stat-value" style={{ fontSize: '20px' }}>
              {attendanceEnabled ? '✅ Active' : '❌ Inactive'}
            </div>
          </div>
          <div className="stat-card">
            <h3>Filtered Records</h3>
            <div className="stat-value">{filteredRecords.length}</div>
          </div>
        </div>

        <div className="card">
          <h3>📡 Attendance Control</h3>
          <div style={{ marginTop: '20px' }}>
            <button 
              onClick={handleToggleAttendance}
              className={attendanceEnabled ? 'btn btn-danger' : 'btn btn-success'}
              style={{ fontSize: '16px', padding: '15px 30px' }}
            >
              {attendanceEnabled ? '🔴 Disable Attendance' : '🟢 Enable Attendance'}
            </button>
          </div>

          {currentLecture && attendanceEnabled && (
            <div style={{ marginTop: '20px', padding: '15px', background: '#e8f5e9', borderRadius: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                <div>
                  <strong>Current Lecture:</strong> {currentLecture.number} on {currentLecture.date}
                </div>
                <div style={{ fontSize: '13px', color: currentLecture.teacherLocation ? '#2e7d32' : '#b71c1c' }}>
                  {currentLecture.teacherLocation
                    ? `📍 Location Locked (±${currentLecture.allowedRadiusMeters}m radius)`
                    : '⚠️ Location Not Set — No distance check'}
                </div>
              </div>
            </div>
          )}

          {showLectureForm && (
            <div className="card" style={{ marginTop: '20px', background: '#f5f5f5' }}>
              <h4>Set Lecture Details</h4>
              <div className="form-group">
                <label>Lecture Number:</label>
                <input
                  type="text"
                  value={lectureNumber}
                  onChange={(e) => setLectureNumber(e.target.value)}
                  placeholder="e.g., Lecture 5"
                />
              </div>
              <div className="form-group">
                <label>Lecture Date:</label>
                <input
                  type="date"
                  value={lectureDate}
                  onChange={(e) => setLectureDate(e.target.value)}
                />
              </div>

              <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '10px', marginTop: '10px' }}>
                <input
                  type="checkbox"
                  id="enableLocationCheck"
                  checked={enableLocationCheck}
                  onChange={(e) => setEnableLocationCheck(e.target.checked)}
                  style={{ width: 'auto', cursor: 'pointer' }}
                />
                <label htmlFor="enableLocationCheck" style={{ cursor: 'pointer', margin: 0, fontWeight: '600' }}>
                  Enable GPS Location Security (Anti-Spoof Check)
                </label>
              </div>

              {enableLocationCheck && (
                <div className="form-group" style={{ marginTop: '10px' }}>
                  <label>Allowed Student Distance Radius (accuracy margin):</label>
                  <select
                    value={allowedRadius}
                    onChange={(e) => setAllowedRadius(Number(e.target.value))}
                  >
                    <option value={50}>50 meters (Strict - Classroom only)</option>
                    <option value={100}>100 meters (Standard - Recommended)</option>
                    <option value={200}>200 meters (Relaxed - Campus area)</option>
                    <option value={500}>500 meters (Wide Area)</option>
                  </select>
                </div>
              )}

              <div style={{ display: 'flex', gap: '10px', marginTop: '15px' }}>
                <button onClick={enableAttendance} className="btn btn-success">
                  Confirm & Enable
                </button>
                <button onClick={() => setShowLectureForm(false)} className="btn btn-danger">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {divisions.length > 0 && (
            <div style={{ marginTop: '30px' }}>
              <h4>📎 Division Attendance Links</h4>
              {divisions.map(division => (
                <div key={division} className="link-display">
                  <span style={{ fontWeight: '600' }}>Division {division}:</span>
                  <span className="link-text">{getAttendanceLink(division)}</span>
                  <button onClick={() => copyLink(division)} className="btn">
                    📋 Copy Link
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card" style={{ background: '#f0f4ff', borderLeft: '5px solid #667eea' }}>
          <h3>📥 Advanced Attendance Sheet Export</h3>
          <p style={{ color: '#666', fontSize: '14px', marginBottom: '20px' }}>
            Generate a structured grid-style attendance sheet (Roll No, PRN, Student Name, Dates, Total Lectures, Attendance %) for a specific class and division.
          </p>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
            <div className="form-group">
              <label>Select Class *</label>
              <select value={exportClass} onChange={(e) => setExportClass(e.target.value)}>
                <option value="">-- Select Class --</option>
                {classes.map(cls => <option key={cls} value={cls}>{cls}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label>Select Division *</label>
              <select value={exportDivision} onChange={(e) => setExportDivision(e.target.value)}>
                <option value="">-- Select Division --</option>
                {divisions.map(div => <option key={div} value={div}>Division {div}</option>)}
              </select>
            </div>

            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label>Export Range</label>
              <div style={{ display: 'flex', gap: '20px', marginTop: '10px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input 
                    type="radio" 
                    name="exportRangeType" 
                    value="semester" 
                    checked={exportRangeType === 'semester'} 
                    onChange={() => setExportRangeType('semester')}
                    style={{ width: 'auto' }}
                  />
                  <span>Entire Semester</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input 
                    type="radio" 
                    name="exportRangeType" 
                    value="custom" 
                    checked={exportRangeType === 'custom'} 
                    onChange={() => setExportRangeType('custom')}
                    style={{ width: 'auto' }}
                  />
                  <span>Custom Date Range</span>
                </label>
              </div>
            </div>

            {exportRangeType === 'custom' && (
              <>
                <div className="form-group">
                  <label>Start Date *</label>
                  <input 
                    type="date" 
                    value={exportStartDate} 
                    onChange={(e) => setExportStartDate(e.target.value)} 
                  />
                </div>
                <div className="form-group">
                  <label>End Date *</label>
                  <input 
                    type="date" 
                    value={exportEndDate} 
                    onChange={(e) => setExportEndDate(e.target.value)} 
                  />
                </div>
              </>
            )}
          </div>

          <button 
            onClick={exportStructuredExcel}
            className="btn btn-success"
            style={{ marginTop: '20px', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}
            disabled={exportingExcel}
          >
            <span>📥</span>
            <span>{exportingExcel ? 'Generating Report...' : 'Generate & Download Excel Sheet'}</span>
          </button>
        </div>

        <div className="card">
          <h3>📊 Attendance Analytics (Last 7 Days)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={analyticsData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="students" stroke="#667eea" strokeWidth={3} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
            <h3 style={{ margin: 0 }}>🔍 Filter Attendance Records</h3>
            <button 
              onClick={exportCurrentView}
              className="btn btn-success"
              disabled={exportingExcel || filteredRecords.length === 0}
              style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <span>📥</span>
              <span>{exportingExcel ? 'Exporting...' : 'Export to Excel'}</span>
            </button>
          </div>
          
          <div className="filters">
            <input
              type="text"
              placeholder="Search student name or PRN..."
              value={searchStudent}
              onChange={(e) => setSearchStudent(e.target.value)}
            />
            <select value={filterDivision} onChange={(e) => setFilterDivision(e.target.value)}>
              <option value="">All Divisions</option>
              {divisions.map(div => <option key={div} value={div}>Division {div}</option>)}
            </select>
            <select value={filterClass} onChange={(e) => setFilterClass(e.target.value)}>
              <option value="">All Classes</option>
              {classes.map(cls => <option key={cls} value={cls}>{cls}</option>)}
            </select>
            <input
              type="date"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
            />
            <input
              type="text"
              placeholder="Filter by lecture..."
              value={filterLecture}
              onChange={(e) => setFilterLecture(e.target.value)}
            />
            <button onClick={clearFilters} className="btn btn-warning">Clear Filters</button>
          </div>
          
          <p style={{ marginTop: '10px', color: '#666', fontSize: '14px' }}>
            Showing {filteredRecords.length} of {attendanceRecords.length} records
            {(searchStudent || filterDivision || filterClass || filterDate || filterLecture) && 
              <span style={{ color: '#667eea', marginLeft: '5px' }}>(Filtered)</span>
            }
          </p>
        </div>

        <div className="card">
          <h3>📋 Attendance Records ({filteredRecords.length})</h3>
          {filteredRecords.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#666', padding: '20px' }}>
              No records match the current filters.
            </p>
          ) : (
            <div className="attendance-list">
              {filteredRecords.map((record) => (
                <div key={record.id} className="attendance-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '15px' }}>
                    <div>
                      <h4>{record.studentName}</h4>
                      <p><strong>PRN:</strong> {record.studentPRN}</p>
                      <p><strong>Class:</strong> {record.class} | <strong>Division:</strong> {record.division}</p>
                      <p><strong>Lecture:</strong> {record.lectureNumber} on {record.lectureDate}</p>
                      <p><strong>Time:</strong> {formatTimestamp(record.timestamp)}</p>
                      {record.location && (
                        <p style={{ fontSize: '12px', color: '#666' }}>
                          📍 {record.location.latitude.toFixed(4)}, {record.location.longitude.toFixed(4)}
                        </p>
                      )}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <button 
                        onClick={() => viewStudentProgress(record.studentPRN)}
                        className="btn"
                      >
                        📈 View Progress
                      </button>
                      <button 
                        onClick={() => removeAttendance(record.id)}
                        className="btn btn-danger"
                      >
                        🗑️ Remove
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {selectedStudent && (
          <div className="card" style={{ background: '#e3f2fd' }}>
            <h3>📊 Student Progress: {selectedStudent.name}</h3>
            <p><strong>PRN:</strong> {selectedStudent.prn}</p>
            <div className="stats-grid" style={{ marginTop: '20px' }}>
              <div className="stat-card">
                <h3>Total Classes</h3>
                <div className="stat-value">{selectedStudent.total}</div>
              </div>
              <div className="stat-card">
                <h3>Attendance %</h3>
                <div className="stat-value">{selectedStudent.percentage}%</div>
              </div>
            </div>
            <div style={{ marginTop: '20px', maxHeight: '300px', overflowY: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Date & Time</th>
                    <th>Lecture</th>
                    <th>Subject</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedStudent.records.map(rec => (
                    <tr key={rec.id}>
                      <td>{formatTimestamp(rec.timestamp)}</td>
                      <td>{rec.lectureNumber} ({rec.lectureDate})</td>
                      <td>{rec.subject}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button onClick={() => setSelectedStudent(null)} className="btn" style={{ marginTop: '15px' }}>
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default TeacherDashboard;