import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc, query, where } from 'firebase/firestore';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

function HODDashboard({ user }) {
  const navigate = useNavigate();
  const currentUser = user || JSON.parse(localStorage.getItem('user') || 'null');

  const [activeTab, setActiveTab] = useState('teachers'); // teachers, students, departments, performance
  const [teachers, setTeachers] = useState([]);
  const [students, setStudents] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [classes, setClasses] = useState([]);
  const [divisions, setDivisions] = useState([]);
  const [teacherPerformance, setTeacherPerformance] = useState([]);
  
  const [newTeacher, setNewTeacher] = useState({
    name: '',
    phone: '',
    email: '',
    subject: '',
    assignedClasses: [],
    assignedDivisions: []
  });

  const [newDepartment, setNewDepartment] = useState('');
  const [newClass, setNewClass] = useState('');
  const [newDivision, setNewDivision] = useState('');
  
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [searchStudent, setSearchStudent] = useState('');

  useEffect(() => {
    if (!currentUser) {
      navigate('/');
      return;
    }
    fetchHODData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  const fetchHODData = async () => {
    setLoading(true);
    try {
      // Fetch teachers
      const teachersQuery = query(
        collection(db, 'teachers'),
        where('department', '==', currentUser.department)
      );
      const teachersSnapshot = await getDocs(teachersQuery);
      const teachersList = [];
      teachersSnapshot.forEach(doc => {
        teachersList.push({ id: doc.id, ...doc.data() });
      });
      setTeachers(teachersList);

      // Fetch students
      const studentsQuery = query(
        collection(db, 'students'),
        where('department', '==', currentUser.department)
      );
      const studentsSnapshot = await getDocs(studentsQuery);
      const studentsList = [];
      studentsSnapshot.forEach(doc => {
        studentsList.push({ id: doc.id, ...doc.data() });
      });
      setStudents(studentsList);

      // Fetch all departments
      const deptSnapshot = await getDocs(collection(db, 'departments'));
      const deptList = [];
      deptSnapshot.forEach(doc => {
        deptList.push({ id: doc.id, ...doc.data() });
      });
      setDepartments(deptList);

      // Get current department's classes and divisions
      const currentDept = deptList.find(d => d.name === currentUser.department);
      if (currentDept) {
        setClasses(currentDept.classes || []);
        setDivisions(currentDept.divisions || []);
      }

      // Fetch teacher performance data
      await fetchTeacherPerformance(teachersList);

    } catch (error) {
      console.error('Error fetching HOD data:', error);
      setErrorMessage('Failed to load data: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchTeacherPerformance = async (teachersList) => {
    try {
      const performanceData = [];

      for (const teacher of teachersList) {
        // Fetch attendance records for each teacher
        const attendanceQuery = query(
          collection(db, 'attendance'),
          where('teacherId', '==', teacher.id)
        );
        const attendanceSnapshot = await getDocs(attendanceQuery);
        
        const totalRecords = attendanceSnapshot.size;
        const uniqueStudents = new Set();
        const lecturesDates = new Set();
        
        attendanceSnapshot.forEach(doc => {
          const data = doc.data();
          uniqueStudents.add(data.studentPRN);
          if (data.lectureDate) {
            lecturesDates.add(data.lectureDate);
          }
        });

        // Calculate this month's records
        const thisMonth = new Date().getMonth();
        const thisYear = new Date().getFullYear();
        let monthlyRecords = 0;

        attendanceSnapshot.forEach(doc => {
          const data = doc.data();
          const timestamp = data.timestamp?.toDate ? data.timestamp.toDate() : new Date(data.timestamp);
          if (timestamp.getMonth() === thisMonth && timestamp.getFullYear() === thisYear) {
            monthlyRecords++;
          }
        });

        performanceData.push({
          id: teacher.id,
          name: teacher.name,
          subject: teacher.subject,
          totalRecords: totalRecords,
          uniqueStudents: uniqueStudents.size,
          lecturesConducted: lecturesDates.size,
          monthlyRecords: monthlyRecords,
          assignedClasses: teacher.assignedClasses?.join(', ') || 'None',
          assignedDivisions: teacher.assignedDivisions?.join(', ') || 'None',
          attendanceEnabled: teacher.attendanceEnabled ? 'Active' : 'Inactive'
        });
      }

      // Sort by total records (descending)
      performanceData.sort((a, b) => b.totalRecords - a.totalRecords);
      setTeacherPerformance(performanceData);

    } catch (error) {
      console.error('Error fetching teacher performance:', error);
    }
  };

  const handleAddTeacher = async (e) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (!newTeacher.name || !newTeacher.phone || !newTeacher.subject) {
      setErrorMessage('Please fill in all required fields.');
      return;
    }

    if (newTeacher.assignedClasses.length === 0 || newTeacher.assignedDivisions.length === 0) {
      setErrorMessage('Please assign at least one class and one division.');
      return;
    }

    try {
      await addDoc(collection(db, 'teachers'), {
        name: newTeacher.name,
        phone: newTeacher.phone,
        email: newTeacher.email || '',
        subject: newTeacher.subject,
        department: currentUser.department,
        assignedClasses: newTeacher.assignedClasses,
        assignedDivisions: newTeacher.assignedDivisions,
        attendanceEnabled: false,
        currentLecture: null,
        addedBy: currentUser.id,
        addedAt: new Date().toISOString()
      });

      setSuccessMessage(`✅ Teacher ${newTeacher.name} added successfully!`);
      setNewTeacher({
        name: '',
        phone: '',
        email: '',
        subject: '',
        assignedClasses: [],
        assignedDivisions: []
      });
      fetchHODData();
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (error) {
      console.error('Error adding teacher:', error);
      setErrorMessage('Failed to add teacher: ' + error.message);
    }
  };

  const handleDeleteTeacher = async (teacherId) => {
    if (!window.confirm('Are you sure you want to delete this teacher?')) return;

    try {
      await deleteDoc(doc(db, 'teachers', teacherId));
      setSuccessMessage('Teacher deleted successfully!');
      fetchHODData();
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (error) {
      console.error('Error deleting teacher:', error);
      setErrorMessage('Failed to delete teacher: ' + error.message);
    }
  };

  const handleDeleteStudent = async (studentId, studentName) => {
    if (!window.confirm(`Are you sure you want to remove student ${studentName}? This action cannot be undone.`)) return;

    try {
      await deleteDoc(doc(db, 'students', studentId));
      setSuccessMessage(`Student ${studentName} removed successfully!`);
      fetchHODData();
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (error) {
      console.error('Error deleting student:', error);
      setErrorMessage('Failed to remove student: ' + error.message);
    }
  };

  const handleAddDepartment = async (e) => {
    e.preventDefault();
    if (!newDepartment.trim()) return;

    try {
      const existing = departments.find(d => d.name.toLowerCase() === newDepartment.trim().toLowerCase());
      if (existing) {
        setErrorMessage('This department already exists!');
        return;
      }

      await addDoc(collection(db, 'departments'), {
        name: newDepartment.trim(),
        classes: ['SE', 'TE', 'BE'],
        divisions: ['A', 'B', 'C'],
        createdAt: new Date().toISOString(),
        createdBy: currentUser.id
      });

      setSuccessMessage(`Department "${newDepartment}" added successfully!`);
      setNewDepartment('');
      fetchHODData();
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (error) {
      console.error('Error adding department:', error);
      setErrorMessage('Failed to add department: ' + error.message);
    }
  };

  const handleAddClass = async (e) => {
    e.preventDefault();
    if (!newClass.trim()) return;

    try {
      const deptQuery = query(
        collection(db, 'departments'),
        where('name', '==', currentUser.department)
      );
      const deptSnapshot = await getDocs(deptQuery);

      if (deptSnapshot.empty) {
        await addDoc(collection(db, 'departments'), {
          name: currentUser.department,
          classes: [newClass.trim()],
          divisions: divisions
        });
      } else {
        const deptDoc = deptSnapshot.docs[0];
        const currentClasses = deptDoc.data().classes || [];
        if (currentClasses.includes(newClass.trim())) {
          setErrorMessage('This class already exists!');
          return;
        }
        await updateDoc(doc(db, 'departments', deptDoc.id), {
          classes: [...currentClasses, newClass.trim()]
        });
      }

      setClasses([...classes, newClass.trim()]);
      setNewClass('');
      setSuccessMessage(`Class ${newClass} added successfully!`);
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (error) {
      console.error('Error adding class:', error);
      setErrorMessage('Failed to add class: ' + error.message);
    }
  };

  const handleAddDivision = async (e) => {
    e.preventDefault();
    if (!newDivision.trim()) return;

    try {
      const deptQuery = query(
        collection(db, 'departments'),
        where('name', '==', currentUser.department)
      );
      const deptSnapshot = await getDocs(deptQuery);

      if (deptSnapshot.empty) {
        await addDoc(collection(db, 'departments'), {
          name: currentUser.department,
          classes: classes,
          divisions: [newDivision.trim()]
        });
      } else {
        const deptDoc = deptSnapshot.docs[0];
        const currentDivisions = deptDoc.data().divisions || [];
        if (currentDivisions.includes(newDivision.trim())) {
          setErrorMessage('This division already exists!');
          return;
        }
        await updateDoc(doc(db, 'departments', deptDoc.id), {
          divisions: [...currentDivisions, newDivision.trim()]
        });
      }

      setDivisions([...divisions, newDivision.trim()]);
      setNewDivision('');
      setSuccessMessage(`Division ${newDivision} added successfully!`);
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (error) {
      console.error('Error adding division:', error);
      setErrorMessage('Failed to add division: ' + error.message);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('user');
    navigate('/', { replace: true });
    window.location.reload();
  };

  const toggleClassSelection = (className) => {
    setNewTeacher(prev => ({
      ...prev,
      assignedClasses: prev.assignedClasses.includes(className)
        ? prev.assignedClasses.filter(c => c !== className)
        : [...prev.assignedClasses, className]
    }));
  };

  const toggleDivisionSelection = (divisionName) => {
    setNewTeacher(prev => ({
      ...prev,
      assignedDivisions: prev.assignedDivisions.includes(divisionName)
        ? prev.assignedDivisions.filter(d => d !== divisionName)
        : [...prev.assignedDivisions, divisionName]
    }));
  };

  const filteredStudents = students.filter(student =>
    searchStudent === '' ||
    student.name.toLowerCase().includes(searchStudent.toLowerCase()) ||
    student.prn.toLowerCase().includes(searchStudent.toLowerCase()) ||
    student.email.toLowerCase().includes(searchStudent.toLowerCase())
  );

  const getStudentRollNo = (student) => {
    const classDivStudents = students
      .filter(s => s.class === student.class && s.division === student.division)
      .sort((a, b) => a.name.localeCompare(b.name));
    const idx = classDivStudents.findIndex(s => s.id === student.id);
    return idx !== -1 ? idx + 1 : '-';
  };

  // Prepare chart data for teacher performance
  const chartData = teacherPerformance.slice(0, 10).map(t => ({
    name: t.name.split(' ')[0], // First name only for chart
    'Total Records': t.totalRecords,
    'This Month': t.monthlyRecords
  }));

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
              <h1>HOD Dashboard</h1>
              <p>{currentUser.name} | {currentUser.department} Department</p>
            </div>
            <button onClick={handleLogout} className="btn btn-danger">Logout</button>
          </div>
        </div>

        {errorMessage && <div className="alert alert-error">{errorMessage}</div>}
        {successMessage && <div className="alert alert-success">{successMessage}</div>}

        <div className="stats-grid">
          <div className="stat-card">
            <h3>Teachers</h3>
            <div className="stat-value">{teachers.length}</div>
          </div>
          <div className="stat-card">
            <h3>Students</h3>
            <div className="stat-value">{students.length}</div>
          </div>
          <div className="stat-card">
            <h3>Classes</h3>
            <div className="stat-value">{classes.length}</div>
          </div>
          <div className="stat-card">
            <h3>Divisions</h3>
            <div className="stat-value">{divisions.length}</div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '10px', marginTop: '30px', marginBottom: '20px', flexWrap: 'wrap' }}>
          <button
            onClick={() => setActiveTab('teachers')}
            className={activeTab === 'teachers' ? 'btn btn-success' : 'btn'}
          >
            👨‍🏫 Teachers
          </button>
          <button
            onClick={() => setActiveTab('students')}
            className={activeTab === 'students' ? 'btn btn-success' : 'btn'}
          >
            👨‍🎓 Students
          </button>
          <button
            onClick={() => setActiveTab('departments')}
            className={activeTab === 'departments' ? 'btn btn-success' : 'btn'}
          >
            🏛️ Departments
          </button>
          <button
            onClick={() => setActiveTab('performance')}
            className={activeTab === 'performance' ? 'btn btn-success' : 'btn'}
          >
            📊 Teacher Performance
          </button>
        </div>

        {/* Teacher Performance Tab */}
        {activeTab === 'performance' && (
          <>
            <div className="card">
              <h3>📊 Teacher Performance Analytics</h3>
              <p style={{ color: '#666', marginBottom: '20px' }}>
                Overview of teacher activities and attendance records
              </p>
              
              {teacherPerformance.length > 0 && (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="Total Records" fill="#667eea" />
                    <Bar dataKey="This Month" fill="#11998e" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="card">
              <h3>📋 Detailed Teacher Performance</h3>
              {teacherPerformance.length === 0 ? (
                <p style={{ textAlign: 'center', color: '#666', padding: '20px' }}>
                  No performance data available yet.
                </p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Rank</th>
                        <th>Teacher Name</th>
                        <th>Subject</th>
                        <th>Total Records</th>
                        <th>Unique Students</th>
                        <th>Lectures Conducted</th>
                        <th>This Month</th>
                        <th>Classes</th>
                        <th>Divisions</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {teacherPerformance.map((teacher, index) => (
                        <tr key={teacher.id}>
                          <td>
                            <strong>
                              {index === 0 && '🥇'}
                              {index === 1 && '🥈'}
                              {index === 2 && '🥉'}
                              {index > 2 && `#${index + 1}`}
                            </strong>
                          </td>
                          <td><strong>{teacher.name}</strong></td>
                          <td>{teacher.subject}</td>
                          <td>{teacher.totalRecords}</td>
                          <td>{teacher.uniqueStudents}</td>
                          <td>{teacher.lecturesConducted}</td>
                          <td>{teacher.monthlyRecords}</td>
                          <td>{teacher.assignedClasses}</td>
                          <td>{teacher.assignedDivisions}</td>
                          <td>
                            <span style={{
                              padding: '4px 8px',
                              borderRadius: '5px',
                              fontSize: '12px',
                              fontWeight: '600',
                              background: teacher.attendanceEnabled === 'Active' ? '#e8f5e9' : '#ffebee',
                              color: teacher.attendanceEnabled === 'Active' ? '#2e7d32' : '#c62828'
                            }}>
                              {teacher.attendanceEnabled}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {/* Teachers Tab */}
        {activeTab === 'teachers' && (
          <>
            <div className="card">
              <h3>👨‍🏫 Add New Teacher</h3>
              <form onSubmit={handleAddTeacher}>
                <div className="form-group">
                  <label>Full Name *</label>
                  <input
                    type="text"
                    placeholder="Teacher's full name"
                    value={newTeacher.name}
                    onChange={(e) => setNewTeacher({ ...newTeacher, name: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Phone Number (used as password) *</label>
                  <input
                    type="tel"
                    placeholder="Teacher's phone number"
                    value={newTeacher.phone}
                    onChange={(e) => setNewTeacher({ ...newTeacher, phone: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Email (optional)</label>
                  <input
                    type="email"
                    placeholder="Teacher's email"
                    value={newTeacher.email}
                    onChange={(e) => setNewTeacher({ ...newTeacher, email: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label>Subject *</label>
                  <input
                    type="text"
                    placeholder="Subject taught"
                    value={newTeacher.subject}
                    onChange={(e) => setNewTeacher({ ...newTeacher, subject: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Assign Classes *</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '10px' }}>
                    {classes.map(cls => (
                      <label key={cls} style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={newTeacher.assignedClasses.includes(cls)}
                          onChange={() => toggleClassSelection(cls)}
                        />
                        <span>{cls}</span>
                      </label>
                    ))}
                  </div>
                  {classes.length === 0 && <p style={{ color: '#666', fontSize: '14px' }}>Please add classes first</p>}
                </div>

                <div className="form-group">
                  <label>Assign Divisions *</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '10px' }}>
                    {divisions.map(div => (
                      <label key={div} style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={newTeacher.assignedDivisions.includes(div)}
                          onChange={() => toggleDivisionSelection(div)}
                        />
                        <span>{div}</span>
                      </label>
                    ))}
                  </div>
                  {divisions.length === 0 && <p style={{ color: '#666', fontSize: '14px' }}>Please add divisions first</p>}
                </div>

                <button type="submit" className="btn btn-success" style={{ marginTop: '15px' }}>
                  ➕ Add Teacher
                </button>
              </form>
            </div>

            <div className="card">
              <h3>📋 Teachers List ({teachers.length})</h3>
              {teachers.length === 0 ? (
                <p style={{ textAlign: 'center', color: '#666', padding: '20px' }}>
                  No teachers added yet. Add your first teacher above!
                </p>
              ) : (
                <div className="teacher-list">
                  {teachers.map(teacher => (
                    <div key={teacher.id} className="teacher-card">
                      <h4>{teacher.name}</h4>
                      <p><strong>Subject:</strong> {teacher.subject}</p>
                      <p><strong>Phone:</strong> {teacher.phone}</p>
                      {teacher.email && <p><strong>Email:</strong> {teacher.email}</p>}
                      <p><strong>Classes:</strong> {teacher.assignedClasses?.join(', ') || 'None'}</p>
                      <p><strong>Divisions:</strong> {teacher.assignedDivisions?.join(', ') || 'None'}</p>
                      <p style={{ fontSize: '12px', color: '#999' }}>
                        Added: {new Date(teacher.addedAt).toLocaleDateString()}
                      </p>
                      <button 
                        onClick={() => handleDeleteTeacher(teacher.id)}
                        className="btn btn-danger"
                        style={{ marginTop: '10px', width: '100%' }}
                      >
                        🗑️ Delete Teacher
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* Students Tab */}
        {activeTab === 'students' && (
          <div className="card">
            <h3>👨‍🎓 Students Management ({students.length})</h3>
            
            <div style={{ marginBottom: '20px' }}>
              <input
                type="text"
                placeholder="🔍 Search by name, PRN, or email..."
                value={searchStudent}
                onChange={(e) => setSearchStudent(e.target.value)}
                style={{ width: '100%' }}
              />
            </div>

            {filteredStudents.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#666', padding: '20px' }}>
                {searchStudent ? 'No students found matching your search.' : 'No students registered yet.'}
              </p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Roll No</th>
                      <th>Name</th>
                      <th>PRN</th>
                      <th>Class</th>
                      <th>Division</th>
                      <th>Email</th>
                      <th>Phone</th>
                      <th>Registered</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStudents.map(student => (
                      <tr key={student.id}>
                        <td>{getStudentRollNo(student)}</td>
                        <td>{student.name}</td>
                        <td>{student.prn}</td>
                        <td>{student.class}</td>
                        <td>{student.division}</td>
                        <td>{student.email}</td>
                        <td>{student.phone}</td>
                        <td>{new Date(student.createdAt).toLocaleDateString()}</td>
                        <td>
                          <button
                            onClick={() => handleDeleteStudent(student.id, student.name)}
                            className="btn btn-danger"
                            style={{ fontSize: '12px', padding: '6px 12px' }}
                          >
                            🗑️ Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Departments Tab */}
        {activeTab === 'departments' && (
          <>
            <div className="card">
              <h3>🏛️ Add New Department</h3>
              <form onSubmit={handleAddDepartment} style={{ display: 'flex', gap: '10px' }}>
                <input
                  type="text"
                  placeholder="e.g., Civil Engineering"
                  value={newDepartment}
                  onChange={(e) => setNewDepartment(e.target.value)}
                  style={{ flex: 1 }}
                />
                <button type="submit" className="btn btn-success">Add Department</button>
              </form>
              <div style={{ marginTop: '15px' }}>
                <h4>All Departments ({departments.length})</h4>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '10px' }}>
                  {departments.map(dept => (
                    <span key={dept.id} className="class-badge">{dept.name}</span>
                  ))}
                </div>
              </div>
            </div>

            <div className="card">
              <h3>➕ Manage Classes for {currentUser.department}</h3>
              <form onSubmit={handleAddClass} style={{ display: 'flex', gap: '10px' }}>
                <input
                  type="text"
                  placeholder="e.g., SE, TE, BE"
                  value={newClass}
                  onChange={(e) => setNewClass(e.target.value)}
                  style={{ flex: 1 }}
                />
                <button type="submit" className="btn btn-success">Add Class</button>
              </form>
              <div style={{ marginTop: '15px', display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                {classes.map(cls => (
                  <span key={cls} className="class-badge">{cls}</span>
                ))}
              </div>
            </div>

            <div className="card">
              <h3>➕ Manage Divisions for {currentUser.department}</h3>
              <form onSubmit={handleAddDivision} style={{ display: 'flex', gap: '10px' }}>
                <input
                  type="text"
                  placeholder="e.g., A, B, C"
                  value={newDivision}
                  onChange={(e) => setNewDivision(e.target.value)}
                  style={{ flex: 1 }}
                />
                <button type="submit" className="btn btn-success">Add Division</button>
              </form>
              <div style={{ marginTop: '15px', display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                {divisions.map(div => (
                  <span key={div} className="class-badge">{div}</span>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default HODDashboard;