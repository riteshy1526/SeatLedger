import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
  Building2,
  Shield,
  User,
  ArrowRight,
  CheckCircle2,
  Compass,
  GraduationCap,
} from 'lucide-react';

export default function Login({ onSwitchToExplore }) {
  const { login, registerLibrary, registerStudent, completeLogin } = useAuth();
  const [activeTab, setActiveTab] = useState('signin'); // 'signin' | 'student' | 'library'
  const [authStage, setAuthStage] = useState('form');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [librariesList, setLibrariesList] = useState([]);
  const [verificationEmail, setVerificationEmail] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [resetIdentifier, setResetIdentifier] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');

  // Login form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Student register form state
  const [stName, setStName] = useState('');
  const [stPhone, setStPhone] = useState('');
  const [stEmail, setStEmail] = useState('');
  const [stPassword, setStPassword] = useState('');
  const [stLibId, setStLibId] = useState('');

  // Library register form state
  const [libraryName, setLibraryName] = useState('');
  const [city, setCity] = useState('Varanasi');
  const [adminName, setAdminName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [totalSeats, setTotalSeats] = useState(50);
  const [monthlyFee, setMonthlyFee] = useState(800);

  // Student inline email OTP verification state
  const [stOtp, setStOtp] = useState('');
  const [stOtpSent, setStOtpSent] = useState(false);
  const [isStEmailVerified, setIsStEmailVerified] = useState(false);
  const [stOtpLoading, setStOtpLoading] = useState(false);

  // Library inline email OTP verification state
  const [regOtp, setRegOtp] = useState('');
  const [regOtpSent, setRegOtpSent] = useState(false);
  const [isRegEmailVerified, setIsRegEmailVerified] = useState(false);
  const [regOtpLoading, setRegOtpLoading] = useState(false);

  const handleSendStudentOtp = async () => {
    if (!stEmail || !stEmail.includes('@')) {
      setError('Please enter a valid student email address first.');
      return;
    }
    setError('');
    setSuccess('');
    setStOtpLoading(true);
    try {
      const res = await api.post('/auth/send-registration-otp', { email: stEmail });
      setStOtpSent(true);
      if (res.data.devCode) {
        setStOtp(res.data.devCode);
        setSuccess(`Verification OTP: ${res.data.devCode} (Demo/Dev mode)`);
      } else {
        setSuccess(res.data.message || 'OTP sent to your email.');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Could not send verification OTP.');
    } finally {
      setStOtpLoading(false);
    }
  };

  const handleVerifyStudentOtp = async () => {
    if (!stOtp || stOtp.length !== 6) {
      setError('Please enter the 6-digit OTP code.');
      return;
    }
    setError('');
    setSuccess('');
    setStOtpLoading(true);
    try {
      await api.post('/auth/verify-registration-otp', { email: stEmail, code: stOtp });
      setIsStEmailVerified(true);
      setSuccess('Email verified successfully! You can now create your student account.');
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid or expired OTP code.');
    } finally {
      setStOtpLoading(false);
    }
  };

  const handleSendRegOtp = async () => {
    if (!regEmail || !regEmail.includes('@')) {
      setError('Please enter a valid library admin email address first.');
      return;
    }
    setError('');
    setSuccess('');
    setRegOtpLoading(true);
    try {
      const res = await api.post('/auth/send-registration-otp', { email: regEmail });
      setRegOtpSent(true);
      if (res.data.devCode) {
        setRegOtp(res.data.devCode);
        setSuccess(`Verification OTP: ${res.data.devCode} (Demo/Dev mode)`);
      } else {
        setSuccess(res.data.message || 'OTP sent to your email.');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Could not send verification OTP.');
    } finally {
      setRegOtpLoading(false);
    }
  };

  const handleVerifyRegOtp = async () => {
    if (!regOtp || regOtp.length !== 6) {
      setError('Please enter the 6-digit OTP code.');
      return;
    }
    setError('');
    setSuccess('');
    setRegOtpLoading(true);
    try {
      await api.post('/auth/verify-registration-otp', { email: regEmail, code: regOtp });
      setIsRegEmailVerified(true);
      setSuccess('Email verified successfully! You can now launch your library.');
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid or expired OTP code.');
    } finally {
      setRegOtpLoading(false);
    }
  };

  const beginEmailVerification = (targetEmail, message, devCode) => {
    setVerificationEmail(targetEmail);
    if (devCode) {
      setVerificationCode(devCode);
      setSuccess(`Verification OTP is: ${devCode} (Demo/Dev delivery)`);
    } else {
      setVerificationCode('');
      setSuccess(message);
    }
    setAuthStage('verify');
  };

  useEffect(() => {
    // Fetch registered libraries for student dropdown
    api
      .get('/public/libraries')
      .then((res) => {
        if (res.data.success && res.data.libraries.length > 0) {
          setLibrariesList(res.data.libraries);
          setStLibId(res.data.libraries[0].id);
        }
      })
      .catch(() => {});
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      if (err.response?.data?.code === 'EMAIL_VERIFICATION_REQUIRED') {
        beginEmailVerification(
          err.response.data.email || email,
          'Verify your email address to continue signing in.'
        );
      } else {
        setError(
          err.response?.data?.message ||
            (err.request
              ? 'Cannot reach the SeatLedger API. Start the backend server and try again.'
              : err.message || 'Invalid credentials')
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const handleStudentRegister = async (e) => {
    e.preventDefault();
    if (!isStEmailVerified) {
      setError('Please verify your email with OTP first before submitting registration.');
      return;
    }
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      const response = await registerStudent({
        name: stName,
        phone: stPhone,
        email: stEmail,
        password: stPassword,
        libraryId: stLibId,
        isEmailVerified: true,
      });
      if (response.token) {
        completeLogin(response);
      } else {
        beginEmailVerification(
          response.email || stEmail,
          response.message || 'Enter the verification code sent to your email.',
          response.devCode
        );
      }
    } catch (err) {
      const serverMsg = err.response?.data?.message || err.response?.data?.error || err.message;
      if (err.response?.data?.verificationRequired) {
        beginEmailVerification(err.response.data.email || stEmail, '');
        setError(serverMsg);
      } else {
        setError(serverMsg || 'Student registration failed');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLibraryRegister = async (e) => {
    e.preventDefault();
    if (!isRegEmailVerified) {
      setError('Please verify your admin email with OTP first before launching your library.');
      return;
    }
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      const response = await registerLibrary({
        libraryName,
        city,
        adminName,
        email: regEmail,
        phone: regPhone,
        password: regPassword,
        totalSeats,
        monthlyFee,
        isEmailVerified: true,
      });
      if (response.token) {
        completeLogin(response);
      } else {
        beginEmailVerification(
          response.email || regEmail,
          response.message || 'Enter the verification code sent to your email.',
          response.devCode
        );
      }
    } catch (err) {
      const serverMsg = err.response?.data?.message || err.response?.data?.error || err.message;
      if (err.response?.data?.verificationRequired) {
        beginEmailVerification(err.response.data.email || regEmail, '');
        setError(serverMsg);
      } else {
        setError(serverMsg || 'Registration failed. Please check details and try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyEmail = async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const response = await api.post('/auth/verify-email', {
        email: verificationEmail,
        code: verificationCode,
      });
      completeLogin(response.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Email verification failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    if (!verificationEmail) {
      setError('Please enter your registered email address first.');
      return;
    }
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      const response = await api.post('/auth/resend-verification', { identifier: verificationEmail });
      if (response.data.devCode) {
        setVerificationCode(response.data.devCode);
        setSuccess(`Verification OTP is: ${response.data.devCode} (Demo/Dev delivery)`);
      } else {
        setSuccess(response.data.message || 'If verification is needed, a new code has been sent.');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Could not resend the verification code.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      const response = await api.post('/auth/forgot-password', { identifier: resetIdentifier });
      setAuthStage('reset');
      if (response.data.devCode) {
        setResetCode(response.data.devCode);
        setSuccess(`Reset OTP is: ${response.data.devCode} (Demo/Dev delivery)`);
      } else {
        setSuccess(response.data.message || 'If an account matches, a code has been sent to its email.');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Could not request a password reset.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      const response = await api.post('/auth/reset-password', {
        identifier: resetIdentifier,
        code: resetCode,
        newPassword,
      });
      setAuthStage('form');
      setActiveTab('signin');
      setEmail(resetIdentifier);
      setPassword('');
      setSuccess(response.data.message || 'Password reset. You can now sign in.');
    } catch (err) {
      setError(err.response?.data?.message || 'Could not reset the password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="inline-flex p-3 rounded-2xl bg-indigo-600 shadow-lg shadow-indigo-500/30 mb-4">
          <Building2 className="w-8 h-8 text-white" />
        </div>
        <h2 className="text-3xl font-extrabold tracking-tight">SeatLedger</h2>
        <p className="mt-1 text-sm text-slate-300">
          Multi-Tenant Library Management SaaS Platform
        </p>
        {onSwitchToExplore && (
          <div className="pt-2">
            <button
              type="button"
              onClick={onSwitchToExplore}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white text-xs font-bold shadow-lg shadow-emerald-500/20 transition-all border border-emerald-400/30"
            >
              <Compass className="w-4 h-4" />
              <span>Explore Nearby Libraries & Live Vacant Seats</span>
            </button>
          </div>
        )}
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-2xl">
        <div className="mx-auto">
          {/* Main Form Card with 3 Tabs */}
          <div className="bg-white text-slate-800 rounded-2xl shadow-xl p-4 sm:p-8 border border-slate-100">
            {/* Tab Switcher */}
            {authStage === 'form' && (
              <div className="flex border-b border-slate-200 mb-6 overflow-x-auto">
                <button
                  type="button"
                  onClick={() => { setActiveTab('signin'); setError(''); setSuccess(''); }}
                  className={`flex-1 pb-3 text-xs sm:text-sm font-bold border-b-2 whitespace-nowrap px-2 transition-all ${
                    activeTab === 'signin'
                      ? 'border-indigo-600 text-indigo-600'
                      : 'border-transparent text-slate-400 hover:text-slate-600'
                  }`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => { setActiveTab('student'); setError(''); setSuccess(''); }}
                  className={`flex-1 pb-3 text-xs sm:text-sm font-bold border-b-2 whitespace-nowrap px-2 transition-all ${
                    activeTab === 'student'
                      ? 'border-indigo-600 text-indigo-600'
                      : 'border-transparent text-slate-400 hover:text-slate-600'
                  }`}
                >
                  Student Sign Up
                </button>
                <button
                  type="button"
                  onClick={() => { setActiveTab('library'); setError(''); setSuccess(''); }}
                  className={`flex-1 pb-3 text-xs sm:text-sm font-bold border-b-2 whitespace-nowrap px-2 transition-all ${
                    activeTab === 'library'
                      ? 'border-indigo-600 text-indigo-600'
                      : 'border-transparent text-slate-400 hover:text-slate-600'
                  }`}
                >
                  Register Library
                </button>
              </div>
            )}

            {error && (
              <div className="mb-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
                {error}
              </div>
            )}
            {success && (
              <div role="status" className="mb-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold">
                {success}
              </div>
            )}

            {/* TAB 1: Sign In (Admin, Staff, Student) */}
            {authStage === 'form' && activeTab === 'signin' && (
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                    Email or Mobile Number
                  </label>
                  <input
                    type="text"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Email address or 10-digit mobile"
                    autoComplete="username"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                    Password
                  </label>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full mt-2 py-3 px-4 rounded-xl font-bold text-sm text-white bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-600/25 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {loading ? 'Authenticating...' : 'Sign In'}
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setResetIdentifier(email);
                    setAuthStage('forgot');
                    setError('');
                    setSuccess('');
                  }}
                  className="w-full text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                >
                  Forgot password?
                </button>
              </form>
            )}

            {/* TAB 2: Direct Student App Registration */}
            {authStage === 'form' && activeTab === 'student' && (
              <form onSubmit={handleStudentRegister} className="space-y-3">
                <div className="p-2.5 bg-indigo-50 rounded-lg text-indigo-700 text-xs flex items-center gap-2 mb-2 font-medium">
                  <GraduationCap className="w-4 h-4 shrink-0" />
                  <span>Quick Student Registration. Seat can be chosen now or assigned at desk.</span>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">Full Name</label>
                  <input
                    type="text"
                    required
                    value={stName}
                    onChange={(e) => setStName(e.target.value)}
                    placeholder="e.g. Ramesh Kumar"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">Phone Number</label>
                    <input
                      type="tel"
                      required
                      value={stPhone}
                      onChange={(e) => setStPhone(e.target.value)}
                      placeholder="9876543210"
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">Target Library</label>
                    <select
                      value={stLibId}
                      onChange={(e) => setStLibId(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs font-medium focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">Choose Library Later (At Desk)</option>
                      {librariesList.map((lib) => (
                        <option key={lib._id || lib.id} value={lib._id || lib.id}>
                          {lib.name} ({lib.city})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">Email Address</label>
                    {isStEmailVerified ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Email Verified
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={stOtpLoading || !stEmail}
                        onClick={handleSendStudentOtp}
                        className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 disabled:opacity-40"
                      >
                        {stOtpLoading ? 'Sending...' : (stOtpSent ? 'Resend OTP' : 'Verify Email')}
                      </button>
                    )}
                  </div>
                  <input
                    type="email"
                    required
                    disabled={isStEmailVerified}
                    value={stEmail}
                    onChange={(e) => {
                      setStEmail(e.target.value);
                      setIsStEmailVerified(false);
                      setStOtpSent(false);
                    }}
                    placeholder="student@gmail.com"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50 disabled:text-slate-500"
                  />
                  {stOtpSent && !isStEmailVerified && (
                    <div className="mt-2 p-2.5 bg-slate-50 rounded-xl border border-indigo-100 space-y-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          inputMode="numeric"
                          maxLength={6}
                          placeholder="6-digit OTP"
                          value={stOtp}
                          onChange={(e) => setStOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                          className="flex-1 px-3 py-1.5 rounded-lg border border-slate-300 text-center font-bold tracking-widest text-sm focus:ring-2 focus:ring-indigo-500"
                        />
                        <button
                          type="button"
                          disabled={stOtpLoading || stOtp.length !== 6}
                          onClick={handleVerifyStudentOtp}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg disabled:opacity-50 transition-all shadow-sm"
                        >
                          {stOtpLoading ? 'Verifying...' : 'Verify OTP'}
                        </button>
                      </div>
                      <p className="text-[10px] text-slate-500 text-center">
                        Enter 6-digit verification code sent to your email.
                      </p>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                    Password <span className="text-[10px] text-slate-400 font-normal lowercase">(min 6 characters)</span>
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={stPassword}
                    onChange={(e) => setStPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full mt-2 py-3 px-4 rounded-xl font-bold text-sm text-white bg-indigo-600 hover:bg-indigo-700 shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {loading ? 'Creating Student Account...' : 'Create Student Account'}
                </button>
              </form>
            )}

            {/* TAB 3: Register New Library */}
            {authStage === 'form' && activeTab === 'library' && (
              <form onSubmit={handleLibraryRegister} className="space-y-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                    Library Name
                  </label>
                  <input
                    type="text"
                    required
                    value={libraryName}
                    onChange={(e) => setLibraryName(e.target.value)}
                    placeholder="Kashi Study Point"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">City</label>
                    <input
                      type="text"
                      required
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="Varanasi / Lucknow"
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">Total Seats</label>
                    <input
                      type="number"
                      value={totalSeats}
                      onChange={(e) => setTotalSeats(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">Admin Name</label>
                  <input
                    type="text"
                    required
                    value={adminName}
                    onChange={(e) => setAdminName(e.target.value)}
                    placeholder="Admin Full Name"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">Admin Email</label>
                    {isRegEmailVerified ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Email Verified
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={regOtpLoading || !regEmail}
                        onClick={handleSendRegOtp}
                        className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 disabled:opacity-40"
                      >
                        {regOtpLoading ? 'Sending...' : (regOtpSent ? 'Resend OTP' : 'Verify Email')}
                      </button>
                    )}
                  </div>
                  <input
                    type="email"
                    required
                    disabled={isRegEmailVerified}
                    value={regEmail}
                    onChange={(e) => {
                      setRegEmail(e.target.value);
                      setIsRegEmailVerified(false);
                      setRegOtpSent(false);
                    }}
                    placeholder="admin@mylibrary.in"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50 disabled:text-slate-500"
                  />
                  {regOtpSent && !isRegEmailVerified && (
                    <div className="mt-2 p-2.5 bg-slate-50 rounded-xl border border-indigo-100 space-y-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          inputMode="numeric"
                          maxLength={6}
                          placeholder="6-digit OTP"
                          value={regOtp}
                          onChange={(e) => setRegOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                          className="flex-1 px-3 py-1.5 rounded-lg border border-slate-300 text-center font-bold tracking-widest text-sm focus:ring-2 focus:ring-indigo-500"
                        />
                        <button
                          type="button"
                          disabled={regOtpLoading || regOtp.length !== 6}
                          onClick={handleVerifyRegOtp}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg disabled:opacity-50 transition-all shadow-sm"
                        >
                          {regOtpLoading ? 'Verifying...' : 'Verify OTP'}
                        </button>
                      </div>
                      <p className="text-[10px] text-slate-500 text-center">
                        Enter 6-digit verification code sent to your email.
                      </p>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">Admin Mobile Number</label>
                  <input
                    type="tel"
                    required
                    value={regPhone}
                    onChange={(e) => setRegPhone(e.target.value)}
                    placeholder="10-digit mobile number"
                    autoComplete="tel"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                    Admin Password <span className="text-[10px] text-slate-400 font-normal lowercase">(min 6 characters)</span>
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full mt-2 py-3 px-4 rounded-xl font-bold text-sm text-white bg-indigo-600 hover:bg-indigo-700 transition-all disabled:opacity-50"
                >
                  {loading ? 'Creating Tenant...' : 'Create Library & Launch'}
                </button>
              </form>
            )}

            {authStage === 'verify' && (
              <form onSubmit={handleVerifyEmail} className="space-y-4">
                <div>
                  <h3 className="text-lg font-bold text-slate-800">Verify your Email</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Enter the 6-digit verification OTP sent to your registered email to activate your account.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                    Registered Email Address
                  </label>
                  <input
                    type="email"
                    required
                    value={verificationEmail}
                    onChange={(event) => setVerificationEmail(event.target.value)}
                    placeholder="Enter your registered email"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                    6-Digit Verification OTP
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    required
                    value={verificationCode}
                    onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    aria-label="Email verification code"
                    className="w-full px-3.5 py-3 rounded-xl border border-slate-300 text-center text-xl font-bold tracking-[0.4em] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 rounded-xl font-bold text-sm text-white bg-emerald-600 hover:bg-emerald-700 shadow-md transition-all disabled:opacity-50"
                >
                  {loading ? 'Verifying...' : 'Verify Email & Sign In'}
                </button>

                <div className="flex items-center justify-between text-xs pt-1">
                  <button
                    type="button"
                    disabled={loading}
                    onClick={handleResendVerification}
                    className="font-semibold text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
                  >
                    Resend OTP Code
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthStage('form');
                      setActiveTab('signin');
                      setError('');
                      setSuccess('');
                    }}
                    className="text-slate-500 hover:text-slate-700"
                  >
                    Back to Sign In
                  </button>
                </div>
              </form>
            )}

            {authStage === 'forgot' && (
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <div>
                  <h3 className="text-lg font-bold text-slate-800">Forgot password?</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Enter your account email or mobile. A reset code will be sent to the registered email.
                  </p>
                </div>
                <input
                  type="text"
                  required
                  value={resetIdentifier}
                  onChange={(event) => setResetIdentifier(event.target.value)}
                  placeholder="Email or mobile number"
                  autoComplete="username"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button type="submit" disabled={loading} className="w-full py-3 rounded-xl font-bold text-sm text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50">
                  {loading ? 'Sending code...' : 'Send Reset Code'}
                </button>
                <button type="button" onClick={() => { setAuthStage('form'); setActiveTab('signin'); setError(''); setSuccess(''); }} className="w-full text-xs text-slate-500 hover:text-slate-700">
                  Back to sign in
                </button>
              </form>
            )}

            {authStage === 'reset' && (
              <form onSubmit={handleResetPassword} className="space-y-4">
                <div>
                  <h3 className="text-lg font-bold text-slate-800">Reset your password</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Enter the 6-digit code sent to the account email and choose a new password.
                  </p>
                </div>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  required
                  value={resetCode}
                  onChange={(event) => setResetCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="6-digit reset code"
                  aria-label="Password reset code"
                  className="w-full px-3.5 py-3 rounded-xl border border-slate-300 text-center text-lg tracking-[0.4em] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <input
                  type="password"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  placeholder="New password (at least 6 characters)"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button type="submit" disabled={loading} className="w-full py-3 rounded-xl font-bold text-sm text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50">
                  {loading ? 'Resetting...' : 'Reset Password'}
                </button>
                <button type="button" disabled={loading} onClick={handleForgotPassword} className="w-full text-xs font-semibold text-indigo-600 hover:text-indigo-800 disabled:opacity-50">
                  Send another code
                </button>
                <button type="button" onClick={() => { setAuthStage('form'); setActiveTab('signin'); setError(''); setSuccess(''); }} className="w-full text-xs text-slate-500 hover:text-slate-700">
                  Back to sign in
                </button>
              </form>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
