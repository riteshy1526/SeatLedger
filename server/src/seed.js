const Library = require('./models/Library');
const User = require('./models/User');
const Student = require('./models/Student');
const Seat = require('./models/Seat');
const FeePayment = require('./models/FeePayment');

const DEMO_LIBRARY_SLUGS = ['kashi-study-point', 'awadh-digital-library'];

async function seedDatabase() {
  const existingLibrary = await Library.findOne({ slug: 'kashi-study-point' });
  if (existingLibrary) {
    await Library.updateMany(
      { slug: { $in: DEMO_LIBRARY_SLUGS } },
      { $set: { isDemo: true } }
    );
    console.log('[Seeder] Database already seeded.');
    return;
  }

  console.log('[Seeder] Seeding pilot libraries: Varanasi & Lucknow...');

  // 1. Library 1: Varanasi (Kashi Study Point)
  const varanasiLib = await Library.create({
    name: 'Kashi Study Point',
    slug: 'kashi-study-point',
    isDemo: true,
    city: 'Varanasi',
    address: 'Lanka Road, near BHU Gate, Varanasi, UP 221005',
    phone: '9876543210',
    email: 'admin@kashistudy.in',
    totalSeats: 40,
    defaultMonthlyFee: 800,
    shifts: [
      'Morning (06:00 AM - 12:00 PM)',
      'Afternoon (12:00 PM - 06:00 PM)',
      'Evening (06:00 PM - 12:00 AM)',
      'Night Shift (12:00 AM - 06:00 AM)',
      'Full Day (24x7)',
    ],
  });

  // Library 1 Admin
  await User.create({
    libraryId: varanasiLib._id,
    name: 'Rajesh Sharma (Admin)',
    email: 'admin@kashistudy.in',
    password: 'password123',
    role: 'admin',
    phone: '9876543210',
  });

  // Library 1 Staff
  await User.create({
    libraryId: varanasiLib._id,
    name: 'Anil Yadav (Staff)',
    email: 'staff@kashistudy.in',
    password: 'password123',
    role: 'staff',
    phone: '9876543211',
  });

  // 2. Library 2: Lucknow (Awadh Digital Library)
  const lucknowLib = await Library.create({
    name: 'Awadh Digital Library',
    slug: 'awadh-digital-library',
    isDemo: true,
    city: 'Lucknow',
    address: 'Hazratganj, near Metro Station, Lucknow, UP 226001',
    phone: '9876543220',
    email: 'admin@awadhlib.in',
    totalSeats: 50,
    defaultMonthlyFee: 1000,
  });

  // Library 2 Admin
  await User.create({
    libraryId: lucknowLib._id,
    name: 'Vikas Verma (Admin)',
    email: 'admin@awadhlib.in',
    password: 'password123',
    role: 'admin',
    phone: '9876543220',
  });

  // Seed Students for Varanasi Library
  const sampleStudents = [
    {
      studentName: 'Amit Tripathi',
      seatNumber: 'A1',
      shift: 'Full Day (24x7)',
      contactNo: '9988776655',
      email: 'amit.tripathi@gmail.com',
      fatherName: 'D. N. Tripathi',
      address: 'Assi Ghat, Varanasi',
      monthlyFee: 800,
      riskScore: 78,
      riskLevel: 'High',
      reason: '2 previous late payments, persistent overdue balance.',
      dueStatus: 'Due',
      paidAmount: 0,
    },
    {
      studentName: 'Priya Singh',
      seatNumber: 'A2',
      shift: 'Morning (06:00 AM - 12:00 PM)',
      contactNo: '9871122334',
      email: 'priya.singh@gmail.com',
      fatherName: 'R. K. Singh',
      address: 'Bhelupur, Varanasi',
      monthlyFee: 600,
      riskScore: 22,
      riskLevel: 'Low',
      reason: 'Always clears fee before 5th of each month.',
      dueStatus: 'Paid',
      paidAmount: 600,
    },
    {
      studentName: 'Rohan Gupta',
      seatNumber: 'A3',
      shift: 'Evening (06:00 PM - 12:00 AM)',
      contactNo: '9765432109',
      email: 'rohan.gupta@gmail.com',
      fatherName: 'Suresh Gupta',
      address: 'Sigra, Varanasi',
      monthlyFee: 700,
      riskScore: 45,
      riskLevel: 'Medium',
      reason: 'Occasional delay in payments (3-5 days late).',
      dueStatus: 'Partial',
      paidAmount: 400,
    },
    {
      studentName: 'Neha Pandey',
      seatNumber: 'B1',
      shift: 'Full Day (24x7)',
      contactNo: '9812345678',
      email: 'neha.pandey@gmail.com',
      fatherName: 'Alok Pandey',
      address: 'Sundarpur, Varanasi',
      monthlyFee: 800,
      riskScore: 15,
      riskLevel: 'Low',
      reason: 'Exemplary payment track record.',
      dueStatus: 'Paid',
      paidAmount: 800,
    },
    {
      studentName: 'Vikram Patel',
      seatNumber: 'B2',
      shift: 'Afternoon (12:00 PM - 06:00 PM)',
      contactNo: '9798765432',
      email: 'vikram.patel@gmail.com',
      fatherName: 'Ramesh Patel',
      address: 'Godowlia, Varanasi',
      monthlyFee: 650,
      riskScore: 82,
      riskLevel: 'High',
      reason: 'Multiple partial clearances and delay notices issued.',
      dueStatus: 'Due',
      paidAmount: 0,
    },
  ];

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  for (const item of sampleStudents) {
    const student = await Student.create({
      libraryId: varanasiLib._id,
      studentName: item.studentName,
      seatNumber: item.seatNumber,
      shift: item.shift,
      contactNo: item.contactNo,
      email: item.email,
      fatherName: item.fatherName,
      address: item.address,
      monthlyFee: item.monthlyFee,
      status: 'Active',
      aiRiskScore: item.riskScore,
      aiRiskLevel: item.riskLevel,
      aiPredictionReason: item.reason,
      lastPredictedAt: new Date(),
    });

    // Create student login user
    await User.create({
      libraryId: varanasiLib._id,
      studentProfileId: student._id,
      name: item.studentName,
      email: item.email,
      password: 'student123',
      role: 'student',
      phone: item.contactNo,
    });

    // Create Fee Record
    await FeePayment.create({
      libraryId: varanasiLib._id,
      studentId: student._id,
      month: currentMonth,
      year: currentYear,
      amountDue: item.monthlyFee,
      amountPaid: item.paidAmount,
      balance: Math.max(0, item.monthlyFee - item.paidAmount),
      status: item.dueStatus,
      dueDate: new Date(currentYear, currentMonth - 1, 5),
      paymentDate: item.dueStatus === 'Paid' ? new Date() : null,
      paymentMethod: item.dueStatus === 'Paid' ? 'Razorpay' : 'None',
    });

    // Create Seat
    await Seat.create({
      libraryId: varanasiLib._id,
      seatNumber: item.seatNumber,
      row: item.seatNumber[0],
      floor: 'Floor 1',
      status: 'Occupied',
      assignedStudentId: student._id,
      currentStudentName: student.studentName,
      currentShift: item.shift,
    });
  }

  // Populate remaining available seats for Varanasi
  for (let i = 6; i <= 20; i++) {
    const row = i <= 10 ? 'A' : 'B';
    const num = i <= 10 ? i : i - 10;
    const seatNumber = `${row}${num}`;
    const exists = await Seat.findOne({ libraryId: varanasiLib._id, seatNumber });
    if (!exists) {
      await Seat.create({
        libraryId: varanasiLib._id,
        seatNumber,
        row,
        floor: 'Floor 1',
        status: 'Available',
      });
    }
  }

  console.log('[Seeder] Successfully seeded pilot libraries with demo accounts!');
}

module.exports = { seedDatabase };
