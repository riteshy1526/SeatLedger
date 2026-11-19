function buildSeatOccupancyUpdate(activeStudents, currentStatus) {
  if (activeStudents.length === 0) {
    return {
      status: currentStatus === 'Maintenance' ? 'Maintenance' : 'Available',
      assignedStudentId: null,
      currentStudentName: '',
      currentShift: 'Full Day (24x7)',
      bookedSlots: [],
    };
  }

  const assignedStudent = activeStudents[0];
  return {
    status: 'Occupied',
    assignedStudentId: assignedStudent._id,
    currentStudentName: assignedStudent.studentName,
    currentShift: assignedStudent.shift,
    bookedSlots: activeStudents.flatMap((student) => (
      (student.slots || [student.shift]).map((slot) => ({
        slot,
        studentId: student._id,
        studentName: student.studentName,
      }))
    )),
  };
}

async function syncSeatForActiveStudents(Student, Seat, libraryId, seatNumber) {
  const [activeStudents, currentSeat] = await Promise.all([
    Student.find({ libraryId, seatNumber, status: 'Active' }),
    Seat.findOne({ libraryId, seatNumber }).select('status'),
  ]);
  const update = buildSeatOccupancyUpdate(activeStudents, currentSeat?.status);
  if (!update) return;

  await Seat.findOneAndUpdate(
    { libraryId, seatNumber },
    update,
    { upsert: true }
  );
}

module.exports = { buildSeatOccupancyUpdate, syncSeatForActiveStudents };
