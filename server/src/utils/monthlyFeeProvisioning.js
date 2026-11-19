const FeePayment = require('../models/FeePayment');
const Student = require('../models/Student');
const { calculateMonthlyFee } = require('./feePricing');

async function ensureMonthlyFeeRecords(libraryId, library, month, year) {
  const periodEnd = new Date(year, month, 0, 23, 59, 59, 999);
  const activeStudents = await Student.find({
    libraryId,
    status: 'Active',
    joiningDate: { $lte: periodEnd },
  });
  const dueDay = library.settings?.dueDayOfMonth || 5;
  const feeMonth = new Date(year, month - 1, 15);

  await Promise.all(activeStudents.map(async (student) => {
    const filter = {
      libraryId,
      studentId: student._id,
      month,
      year,
    };
    const amountDue = student.monthlyFeeOverride
      ? student.monthlyFee
      : calculateMonthlyFee(
        library,
        student.slots?.length ? student.slots : [student.shift],
        feeMonth
      );

    try {
      await FeePayment.updateOne(filter, {
        $setOnInsert: {
          ...filter,
          amountDue,
          amountPaid: 0,
          balance: amountDue,
          status: 'Due',
          dueDate: new Date(year, month - 1, dueDay),
        },
      }, { upsert: true, setDefaultsOnInsert: false });
    } catch (error) {
      if (error.code !== 11000 || !await FeePayment.exists(filter)) {
        throw error;
      }
    }
  }));
}

module.exports = { ensureMonthlyFeeRecords };
