const express = require('express');
const Seat = require('../models/Seat');
const Student = require('../models/Student');
const Library = require('../models/Library');
const { authenticate } = require('../middleware/auth');
const { tenantContext } = require('../middleware/tenant');
const { requireRoles } = require('../middleware/roles');
const {
  acquireLibrarySeatMutation,
  ensureLibrarySeats,
  ensureLibrarySeatsUnlocked,
  getSeatLabel,
  planSeatRemoval,
} = require('../utils/seatProvisioning');

const router = express.Router();
router.use(authenticate, tenantContext);

async function rollbackSeatRemoval({
  libraryId,
  appliedMoves,
  removedSeat,
  targetSeatNumber,
  targetStudentIds,
  totalSeatsUpdateAttempted,
  originalTotalSeats,
  newTotalSeats,
}) {
  const rollbackErrors = [];

  for (const move of [...appliedMoves].reverse()) {
    try {
      if (move.studentIds.length > 0) {
        await Student.updateMany(
          { libraryId, _id: { $in: move.studentIds }, seatNumber: move.to },
          { $set: { seatNumber: move.from } }
        );
      }
      const result = await Seat.updateOne(
        { libraryId, _id: move.seatId, seatNumber: move.to },
        { $set: { seatNumber: move.from, row: move.oldRow } }
      );
      if (result.matchedCount !== 1) {
        throw new Error(`Could not restore seat ${move.from}.`);
      }
    } catch (error) {
      rollbackErrors.push(error.message);
    }
  }

  if (removedSeat) {
    try {
      await Seat.create(removedSeat);
    } catch (error) {
      rollbackErrors.push(`Could not restore removed seat ${targetSeatNumber}: ${error.message}`);
    }
  }

  if (targetStudentIds.length > 0) {
    try {
      await Student.updateMany(
        { libraryId, _id: { $in: targetStudentIds }, seatNumber: 'Pending Allocation' },
        { $set: { seatNumber: targetSeatNumber } }
      );
    } catch (error) {
      rollbackErrors.push(`Could not restore inactive student assignments: ${error.message}`);
    }
  }

  if (totalSeatsUpdateAttempted) {
    try {
      await Library.updateOne(
        { _id: libraryId, totalSeats: newTotalSeats },
        { $set: { totalSeats: originalTotalSeats } }
      );
    } catch (error) {
      rollbackErrors.push(`Could not restore the library seat count: ${error.message}`);
    }
  }

  return rollbackErrors;
}

/**
 * Get all seats with real-time status and occupancy
 */
router.get('/', async (req, res) => {
  try {
    const library = await Library.findById(req.libraryId);
    const seats = await ensureLibrarySeats(req.libraryId, library?.totalSeats);

    // Populate active student assignment info
    const activeStudents = await Student.find({ libraryId: req.libraryId, status: 'Active' });
    const studentMap = {};
    activeStudents.forEach((st) => {
      studentMap[st.seatNumber] = st;
    });

    const enrichedSeats = seats.map((seat) => {
      const assigned = studentMap[seat.seatNumber];
      return {
        ...seat.toObject(),
        status: assigned ? 'Occupied' : seat.status,
        studentName: assigned ? assigned.studentName : seat.currentStudentName || '',
        studentId: assigned ? assigned._id : null,
        shift: assigned ? assigned.shift : 'None',
      };
    });

    return res.json({ success: true, count: enrichedSeats.length, seats: enrichedSeats });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Add the next sequential seat to the current library (admin only)
 */
router.post('/', requireRoles('admin'), async (req, res) => {
  const release = await acquireLibrarySeatMutation(req.libraryId);
  try {
    const library = await Library.findById(req.libraryId);
    if (!library) {
      return res.status(404).json({ success: false, message: 'Library not found' });
    }

    const seats = await ensureLibrarySeatsUnlocked(req.libraryId, library.totalSeats);
    const nextSeatNumber = getSeatLabel(seats.length + 1);
    const seat = await Seat.create({
      libraryId: req.libraryId,
      seatNumber: nextSeatNumber,
      row: nextSeatNumber.match(/^([A-Z]+)/)[1],
      floor: 'Ground Floor',
      status: 'Available',
    });

    try {
      const result = await Library.updateOne(
        { _id: req.libraryId },
        { $max: { totalSeats: seats.length + 1 } }
      );
      if (result.matchedCount !== 1) {
        throw new Error('Library not found while updating its seat count.');
      }
    } catch (error) {
      await Seat.deleteOne({ _id: seat._id, libraryId: req.libraryId });
      throw error;
    }

    return res.status(201).json({
      success: true,
      message: `Seat ${seat.seatNumber} added.`,
      seat,
      totalSeats: seats.length + 1,
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ success: false, message: err.message });
  } finally {
    release();
  }
});

/**
 * Remove a seat and shift later labels down one number (admin only)
 */
router.delete('/:seatNumber', requireRoles('admin'), async (req, res) => {
  const libraryId = req.libraryId;
  const targetSeatNumber = String(req.params.seatNumber || '').trim().toUpperCase();
  const appliedMoves = [];
  let removedSeat = null;
  let targetStudentIds = [];
  let totalSeatsUpdateAttempted = false;
  let originalTotalSeats;
  let newTotalSeats;

  const release = await acquireLibrarySeatMutation(libraryId);
  try {
    const library = await Library.findById(libraryId);
    if (!library) {
      return res.status(404).json({ success: false, message: 'Library not found' });
    }

    const seats = await ensureLibrarySeatsUnlocked(libraryId, library.totalSeats);
    let removalPlan;
    try {
      removalPlan = planSeatRemoval(seats, targetSeatNumber);
    } catch (error) {
      return res.status(409).json({ success: false, message: error.message });
    }
    if (!removalPlan) {
      return res.status(404).json({ success: false, message: 'Seat not found in this library.' });
    }

    const affectedSeatNumbers = [
      targetSeatNumber,
      ...removalPlan.renumberedSeats.map((move) => move.from),
    ];
    const affectedStudents = await Student.find({
      libraryId,
      seatNumber: { $in: affectedSeatNumbers },
    }).select('_id seatNumber status').lean();
    if (affectedStudents.some((student) => (
      student.seatNumber === targetSeatNumber && student.status === 'Active'
    ))) {
      return res.status(409).json({
        success: false,
        message: 'Reassign active students from this seat before removing it.',
      });
    }

    targetStudentIds = affectedStudents
      .filter((student) => student.seatNumber === targetSeatNumber && student.status !== 'Active')
      .map((student) => student._id);
    if (targetStudentIds.length > 0) {
      const result = await Student.updateMany(
        {
          libraryId,
          _id: { $in: targetStudentIds },
          seatNumber: targetSeatNumber,
          status: { $ne: 'Active' },
        },
        { $set: { seatNumber: 'Pending Allocation' } }
      );
      if (result.matchedCount !== targetStudentIds.length) {
        throw new Error('Student assignments changed while removing this seat. Please try again.');
      }
    }

    removedSeat = await Seat.findOneAndDelete({
      _id: removalPlan.targetSeat._id,
      libraryId,
      seatNumber: targetSeatNumber,
    });
    if (!removedSeat) {
      throw new Error('This seat changed while it was being removed. Please refresh and try again.');
    }
    removedSeat = removedSeat.toObject();

    for (const move of removalPlan.renumberedSeats) {
      const movedStudentIds = affectedStudents
        .filter((student) => student.seatNumber === move.from)
        .map((student) => student._id);
      const updatedSeat = await Seat.findOneAndUpdate(
        { _id: move.seatId, libraryId, seatNumber: move.from },
        { $set: { seatNumber: move.to, row: move.row } },
        { new: true, runValidators: true }
      );
      if (!updatedSeat) {
        throw new Error(`Seat ${move.from} changed while labels were being updated.`);
      }
      const appliedMove = { ...move, studentIds: movedStudentIds };
      appliedMoves.push(appliedMove);

      if (movedStudentIds.length > 0) {
        const result = await Student.updateMany(
          {
            libraryId,
            _id: { $in: movedStudentIds },
            seatNumber: move.from,
          },
          { $set: { seatNumber: move.to } }
        );
        if (result.matchedCount !== movedStudentIds.length) {
          throw new Error(`Student assignments changed while moving seat ${move.from}.`);
        }
      }
    }

    originalTotalSeats = library.totalSeats;
    newTotalSeats = removalPlan.totalSeats;
    totalSeatsUpdateAttempted = true;
    const countResult = await Library.updateOne(
      { _id: libraryId },
      { $set: { totalSeats: newTotalSeats } }
    );
    if (countResult.matchedCount !== 1) {
      throw new Error('Library not found while updating its seat count.');
    }

    return res.json({
      success: true,
      message: `Seat ${targetSeatNumber} removed. Later seat numbers and student assignments were updated.`,
      removedSeatNumber: targetSeatNumber,
      renumberedSeats: appliedMoves.length,
      totalSeats: newTotalSeats,
    });
  } catch (err) {
    const rollbackErrors = await rollbackSeatRemoval({
      libraryId,
      appliedMoves,
      removedSeat,
      targetSeatNumber,
      targetStudentIds,
      totalSeatsUpdateAttempted,
      originalTotalSeats,
      newTotalSeats,
    });
    const message = rollbackErrors.length > 0
      ? `${err.message} Rollback issues: ${rollbackErrors.join('; ')}`
      : err.message;
    return res.status(err.statusCode || 500).json({ success: false, message });
  } finally {
    release();
  }
});

/**
 * Update seat status (e.g. Maintenance, Available, Reserved)
 */
router.put('/:seatNumber/status', requireRoles('admin', 'staff'), async (req, res) => {
  try {
    const { status } = req.body;
    if (!['Available', 'Maintenance', 'Reserved'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Choose a valid seat status.' });
    }
    const seat = await Seat.findOneAndUpdate(
      { libraryId: req.libraryId, seatNumber: req.params.seatNumber },
      { status },
      { new: true, runValidators: true }
    );
    if (!seat) {
      return res.status(404).json({ success: false, message: 'Seat not found. Refresh the seat matrix and try again.' });
    }
    return res.json({ success: true, seat });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
