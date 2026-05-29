import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { db } from '../firebase';
import { collection, addDoc, query, where, getDocs } from 'firebase/firestore';

function Registration() {
  const navigate = useNavigate();
  const location = useLocation();
  const preSelectedRole = location.state?.role || 'student';

  const [role, setRole] = useState(preSelectedRole);
  const [studentForm, setStudentForm] = useState({
    name: '',
    phone: '',
    email: '',
    prn: '',
    department: '',
    class: '',
    division: ''
  });

  const [hodForm, setHodForm] = useState({
    name: '',
    phone: '',
    email: '',
    department: '',
    employeeId: ''
  });

  const [departments, setDepartments] = useState([]);
  const [classes, setClasses] = useState([]);
  const [divisions, setDivisions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    fetchDepartments();
  }, []);

  useEffect(() => {
    if (role === 'student' && studentForm.department) {
      fetchClassesAndDivisions(studentForm.department);
    }
  }, [studentForm.department, role]);

  const fetchDepartments = async () => {
    try {
      const deptSnapshot = await getDocs(collection(db, 'departments'));
      const deptList = [];
      deptSnapshot.forEach(doc => {
        const deptData = doc.data();
        if (deptData.name) {
          deptList.push(deptData.name);
        }
      });
      const uniqueDepts = [...new Set(deptList)];
      setDepartments(uniqueDepts.length > 0 ? uniqueDepts : ['Computer Engineering', 'Information Technology', 'Electronics', 'Mechanical']);
    } catch (error) {
      console.error('Error fetching departments:', error);
      setDepartments(['Computer Engineering', 'Information Technology', 'Electronics', 'Mechanical']);
    }
  };

  const fetchClassesAndDivisions = async (department) => {
    try {
      const q = query(collection(db, 'departments'), where('name', '==', department));
      const snapshot = await getDocs(q);
      
      if (!snapshot.empty) {
        const deptData = snapshot.docs[0].data();
        setClasses(deptData.classes || ['SE', 'TE', 'BE']);
        setDivisions(deptData.divisions || ['A', 'B', 'C']);
      } else {
        setClasses(['SE', 'TE', 'BE']);
        setDivisions(['A', 'B', 'C']);
      }
    } catch (error) {
      console.error('Error fetching classes/divisions:', error);
      setClasses(['SE', 'TE', 'BE']);
      setDivisions(['A', 'B', 'C']);
    }
  };

  const handleStudentChange = (e) => {
    const { name, value } = e.target;
    setStudentForm(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleHodChange = (e) => {
    const { name, value } = e.target;
    setHodForm(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const validateStudentForm = () => {
    if (!studentForm.name.trim()) {
      setError('Please enter your full name');
      return false;
    }
    if (!studentForm.phone.trim() || studentForm.phone.length < 10) {
      setError('Please enter a valid 10-digit phone number');
      return false;
    }
    if (!studentForm.email.trim() || !studentForm.email.includes('@')) {
      setError('Please enter a valid email address');
      return false;
    }
    if (!studentForm.prn.trim()) {
      setError('Please enter your PRN (Permanent Registration Number)');
      return false;
    }
    if (!studentForm.department) {
      setError('Please select your department');
      return false;
    }
    if (!studentForm.class) {
      setError('Please select your class');
      return false;
    }
    if (!studentForm.division) {
      setError('Please select your division');
      return false;
    }
    return true;
  };

  const validateHodForm = () => {
    if (!hodForm.name.trim()) {
      setError('Please enter your full name');
      return false;
    }
    if (!hodForm.phone.trim() || hodForm.phone.length < 10) {
      setError('Please enter a valid 10-digit phone number');
      return false;
    }
    if (!hodForm.email.trim() || !hodForm.email.includes('@')) {
      setError('Please enter a valid email address');
      return false;
    }
    if (!hodForm.department.trim()) {
      setError('Please enter your department name');
      return false;
    }
    if (!hodForm.employeeId.trim()) {
      setError('Please enter your employee ID');
      return false;
    }
    return true;
  };

  const checkStudentDuplicates = async () => {
    const prnQuery = query(collection(db, 'students'), where('prn', '==', studentForm.prn.trim().toUpperCase()));
    const prnSnapshot = await getDocs(prnQuery);
    if (!prnSnapshot.empty) {
      setError('A student with this PRN already exists');
      return false;
    }

    const phoneQuery = query(collection(db, 'students'), where('phone', '==', studentForm.phone.trim()));
    const phoneSnapshot = await getDocs(phoneQuery);
    if (!phoneSnapshot.empty) {
      setError('A student with this phone number already exists');
      return false;
    }

    return true;
  };

  const checkHodDuplicates = async () => {
    const phoneQuery = query(collection(db, 'hods'), where('phone', '==', hodForm.phone.trim()));
    const phoneSnapshot = await getDocs(phoneQuery);
    if (!phoneSnapshot.empty) {
      setError('An HOD with this phone number already exists');
      return false;
    }

    const empIdQuery = query(collection(db, 'hods'), where('employeeId', '==', hodForm.employeeId.trim().toUpperCase()));
    const empIdSnapshot = await getDocs(empIdQuery);
    if (!empIdSnapshot.empty) {
      setError('An HOD with this employee ID already exists');
      return false;
    }

    const deptQuery = query(collection(db, 'hods'), where('department', '==', hodForm.department.trim()));
    const deptSnapshot = await getDocs(deptQuery);
    if (!deptSnapshot.empty) {
      setError('An HOD already exists for this department. Each department can have only one HOD.');
      return false;
    }

    return true;
  };

  const handleStudentSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!validateStudentForm()) {
      return;
    }

    setLoading(true);

    try {
      const isUnique = await checkStudentDuplicates();
      if (!isUnique) {
        setLoading(false);
        return;
      }

      const studentData = {
        name: studentForm.name.trim(),
        phone: studentForm.phone.trim(),
        email: studentForm.email.trim().toLowerCase(),
        prn: studentForm.prn.trim().toUpperCase(),
        department: studentForm.department,
        class: studentForm.class,
        division: studentForm.division,
        createdAt: new Date().toISOString(),
        role: 'student'
      };

      await addDoc(collection(db, 'students'), studentData);

      setSuccess('🎉 Student registration successful! Redirecting to login...');
      
      setStudentForm({
        name: '',
        phone: '',
        email: '',
        prn: '',
        department: '',
        class: '',
        division: ''
      });

      setTimeout(() => {
        navigate('/login', { state: { role: 'student' } });
      }, 2000);

    } catch (error) {
      console.error('Registration error:', error);
      setError('Registration failed: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleHodSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!validateHodForm()) {
      return;
    }

    setLoading(true);

    try {
      const isUnique = await checkHodDuplicates();
      if (!isUnique) {
        setLoading(false);
        return;
      }

      const hodData = {
        name: hodForm.name.trim(),
        phone: hodForm.phone.trim(),
        email: hodForm.email.trim().toLowerCase(),
        department: hodForm.department.trim(),
        employeeId: hodForm.employeeId.trim().toUpperCase(),
        createdAt: new Date().toISOString(),
        role: 'hod'
      };

      await addDoc(collection(db, 'hods'), hodData);

      // Create department if it doesn't exist
      const deptQuery = query(collection(db, 'departments'), where('name', '==', hodForm.department.trim()));
      const deptSnapshot = await getDocs(deptQuery);
      
      if (deptSnapshot.empty) {
        await addDoc(collection(db, 'departments'), {
          name: hodForm.department.trim(),
          classes: ['SE', 'TE', 'BE'],
          divisions: ['A', 'B', 'C'],
          createdAt: new Date().toISOString()
        });
      }

      setSuccess('🎉 HOD registration successful! Redirecting to login...');
      
      setHodForm({
        name: '',
        phone: '',
        email: '',
        department: '',
        employeeId: ''
      });

      setTimeout(() => {
        navigate('/login', { state: { role: 'hod' } });
      }, 2000);

    } catch (error) {
      console.error('Registration error:', error);
      setError('Registration failed: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="gradient-bg" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', padding: '20px' }}>
      <div className="container" style={{ maxWidth: '600px' }}>
        <h2>📝 {role === 'student' ? 'Student' : 'HOD'} Registration</h2>
        <p style={{ textAlign: 'center', color: '#666', marginBottom: '20px' }}>
          {role === 'student' 
            ? 'Create your account to start tracking attendance' 
            : 'Register as Head of Department to manage your department'}
        </p>

        {/* Role Toggle */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
          <button
            onClick={() => setRole('student')}
            className={role === 'student' ? 'btn btn-success' : 'btn'}
            style={{ flex: 1 }}
          >
            👨‍🎓 Student
          </button>
          <button
            onClick={() => setRole('hod')}
            className={role === 'hod' ? 'btn btn-success' : 'btn'}
            style={{ flex: 1 }}
          >
            👨‍💼 HOD
          </button>
        </div>

        {error && <div className="alert alert-error">{error}</div>}
        {success && <div className="alert alert-success">{success}</div>}

        {/* Student Registration Form */}
        {role === 'student' && (
          <form onSubmit={handleStudentSubmit}>
            <div className="form-group">
              <label>Full Name *</label>
              <input
                type="text"
                name="name"
                placeholder="Enter your full name"
                value={studentForm.name}
                onChange={handleStudentChange}
                required
                disabled={loading}
              />
            </div>

            <div className="form-group">
              <label>Phone Number * (This will be your password)</label>
              <input
                type="tel"
                name="phone"
                placeholder="10-digit mobile number"
                value={studentForm.phone}
                onChange={handleStudentChange}
                maxLength="10"
                required
                disabled={loading}
              />
              <small style={{ color: '#666', fontSize: '12px' }}>
                Your phone number will be used as your password for login
              </small>
            </div>

            <div className="form-group">
              <label>Email Address *</label>
              <input
                type="email"
                name="email"
                placeholder="your.email@example.com"
                value={studentForm.email}
                onChange={handleStudentChange}
                required
                disabled={loading}
              />
            </div>

            <div className="form-group">
              <label>PRN (Permanent Registration Number) *</label>
              <input
                type="text"
                name="prn"
                placeholder="e.g., 2021COMP001"
                value={studentForm.prn}
                onChange={handleStudentChange}
                required
                disabled={loading}
              />
            </div>

            <div className="form-group">
              <label>Department *</label>
              <select
                name="department"
                value={studentForm.department}
                onChange={handleStudentChange}
                required
                disabled={loading}
              >
                <option value="">-- Select Department --</option>
                {departments.map(dept => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Class *</label>
              <select
                name="class"
                value={studentForm.class}
                onChange={handleStudentChange}
                required
                disabled={loading || !studentForm.department}
              >
                <option value="">-- Select Class --</option>
                {classes.map(cls => (
                  <option key={cls} value={cls}>{cls}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Division *</label>
              <select
                name="division"
                value={studentForm.division}
                onChange={handleStudentChange}
                required
                disabled={loading || !studentForm.department}
              >
                <option value="">-- Select Division --</option>
                {divisions.map(div => (
                  <option key={div} value={div}>{div}</option>
                ))}
              </select>
            </div>

            <button 
              type="submit" 
              className="btn btn-success" 
              disabled={loading}
              style={{ width: '100%', marginTop: '20px' }}
            >
              {loading ? 'Registering...' : '✅ Register as Student'}
            </button>
          </form>
        )}

        {/* HOD Registration Form */}
        {role === 'hod' && (
          <form onSubmit={handleHodSubmit}>
            <div className="form-group">
              <label>Full Name *</label>
              <input
                type="text"
                name="name"
                placeholder="Enter your full name"
                value={hodForm.name}
                onChange={handleHodChange}
                required
                disabled={loading}
              />
            </div>

            <div className="form-group">
              <label>Phone Number * (This will be your password)</label>
              <input
                type="tel"
                name="phone"
                placeholder="10-digit mobile number"
                value={hodForm.phone}
                onChange={handleHodChange}
                maxLength="10"
                required
                disabled={loading}
              />
              <small style={{ color: '#666', fontSize: '12px' }}>
                Your phone number will be used as your password for login
              </small>
            </div>

            <div className="form-group">
              <label>Email Address *</label>
              <input
                type="email"
                name="email"
                placeholder="hod@example.com"
                value={hodForm.email}
                onChange={handleHodChange}
                required
                disabled={loading}
              />
            </div>

            <div className="form-group">
              <label>Employee ID *</label>
              <input
                type="text"
                name="employeeId"
                placeholder="e.g., HOD2024001"
                value={hodForm.employeeId}
                onChange={handleHodChange}
                required
                disabled={loading}
              />
            </div>

            <div className="form-group">
              <label>Department Name *</label>
              <input
                type="text"
                name="department"
                placeholder="e.g., Computer Engineering"
                value={hodForm.department}
                onChange={handleHodChange}
                required
                disabled={loading}
              />
              <small style={{ color: '#666', fontSize: '12px' }}>
                Enter the department you will be heading
              </small>
            </div>

            <button 
              type="submit" 
              className="btn btn-success" 
              disabled={loading}
              style={{ width: '100%', marginTop: '20px' }}
            >
              {loading ? 'Registering...' : '✅ Register as HOD'}
            </button>
          </form>
        )}

        <div style={{ textAlign: 'center', marginTop: '20px' }}>
          <p style={{ color: '#666' }}>
            Already have an account?{' '}
            <button
              onClick={() => navigate('/login', { state: { role } })}
              style={{
                background: 'transparent',
                color: '#667eea',
                textDecoration: 'underline',
                border: 'none',
                cursor: 'pointer',
                fontSize: '15px',
                padding: '0'
              }}
            >
              Login here
            </button>
          </p>
        </div>

        <div style={{ textAlign: 'center', marginTop: '10px' }}>
          <button
            onClick={() => navigate('/')}
            style={{
              background: 'transparent',
              color: '#667eea',
              textDecoration: 'underline',
              border: 'none',
              cursor: 'pointer'
            }}
          >
            ← Back to Home
          </button>
        </div>
      </div>
    </div>
  );
}

export default Registration;