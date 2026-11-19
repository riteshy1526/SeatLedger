const Seat = require('../models/Seat');
const Student = require('../models/Student');
const Library = require('../models/Library');

const seatMutationTails = new Map();

async function acquireLibrarySeatMutation(libraryId) {
  const key = String(libraryId);
  const previous = seatMutationTails.get(key) || Promise.resolve();
  let releaseCurrent;
  const current = new Promise((resolve) => {
    releaseCurrent = resolve;
  });
  const tail = previous.then(() => current);
  seatMutationTails.set(key, tail);
  await previous;

  let released = false;
  return () => {
    if (released) return;
    released = true;
    releaseCurrent();
    if (seatMutationTails.get(key) === tail) {
      seatMutationTails.delete(key);
    }
  };
}

function getRowLabel(rowIndex) {
  let value = rowIndex + 1;
  let label = '';

  while (value > 0) {
    value -= 1;
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26);
  }

  return label;
}

function getSeatLabel(seatIndex) {
  const row = getRowLabel(Math.floor((seatIndex - 1) / 10));
  const number = ((seatIndex - 1) % 10) + 1;
  return `${row}${number}`;
}

function getSeatOrdinal(seatNumber) {
  const value = String(seatNumber || '').trim();
  if (/^\d+$/.test(value)) return Number(value);

  const match = value.match(/^([a-z]+)(\d+)$/i);
  if (!match) return null;

  const row = [...match[1].toUpperCase()].reduce(
    (total, letter) => total * 26 + letter.charCodeAt(0) - 64,
    0
  );
  const column = Number(match[2]);
  return row > 0 && column > 0 ? (row - 1) * 10 + column : null;
}

function planSeatNumberRepairs(seats, targetCount) {
  const occupiedOrdinals = new Set();
  for (const seat of seats) {
    const ordinal = getSeatOrdinal(seat.seatNumber);
    if (ordinal > 0 && ordinal <= targetCount && getSeatLabel(ordinal) === seat.seatNumber) {
      occupiedOrdinals.add(ordinal);
    }
  }

  const repairs = [];
  const aliases = seats
    .filter((seat) => {
      const ordinal = getSeatOrdinal(seat.seatNumber);
      return ordinal > 0 && ordinal <= targetCount && getSeatLabel(ordinal) !== seat.seatNumber;
    })
    .sort((first, second) => (
      getSeatOrdinal(first.seatNumber) - getSeatOrdinal(second.seatNumber)
      || String(first.seatNumber).localeCompare(String(second.seatNumber), undefined, { numeric: true })
    ));

  for (const seat of aliases) {
    const currentOrdinal = getSeatOrdinal(seat.seatNumber);
    let targetOrdinal = !occupiedOrdinals.has(currentOrdinal) ? currentOrdinal : null;
    if (!targetOrdinal) {
      for (let ordinal = 1; ordinal <= targetCount; ordinal += 1) {
        if (!occupiedOrdinals.has(ordinal)) {
          targetOrdinal = ordinal;
          break;
        }
      }
    }
    if (!targetOrdinal) continue;

    occupiedOrdinals.add(targetOrdinal);
    repairs.push({
      seat,
      sourceSeatNumber: seat.seatNumber,
      seatNumber: getSeatLabel(targetOrdinal),
      row: getRowLabel(Math.floor((targetOrdinal - 1) / 10)),
    });
  }

  return repairs;
}

function planSeatRemoval(seats, requestedSeatNumber) {
  const seatNumber = String(requestedSeatNumber || '').trim().toUpperCase();
  const orderedSeats = [...seats].sort(
    (first, second) => getSeatOrdinal(first.seatNumber) - getSeatOrdinal(second.seatNumber)
  );
  const targetSeat = orderedSeats.find((seat) => seat.seatNumber === seatNumber);
  if (!targetSeat) return null;

  const hasNonSequentialSeat = orderedSeats.some((seat, index) => (
    getSeatOrdinal(seat.seatNumber) !== index + 1
    || getSeatLabel(index + 1) !== seat.seatNumber
  ));
  if (hasNonSequentialSeat) {
    throw new Error('Seats must have sequential labels before one can be removed.');
  }

  const targetOrdinal = getSeatOrdinal(targetSeat.seatNumber);
  const renumberedSeats = orderedSeats
    .filter((seat) => getSeatOrdinal(seat.seatNumber) > targetOrdinal)
    .map((seat) => {
      const newSeatNumber = getSeatLabel(getSeatOrdinal(seat.seatNumber) - 1);
      return {
        seatId: seat._id,
        from: seat.seatNumber,
        to: newSeatNumber,
        oldRow: seat.row,
        row: newSeatNumber.match(/^([A-Z]+)/)[1],
      };
    });

  return {
    targetSeat,
    renumberedSeats,
    totalSeats: orderedSeats.length - 1,
  };
}

async function ensureLibrarySeatsUnlocked(libraryId, totalSeats = 60) {
  let seats = await Seat.find({ libraryId }).select('_id seatNumber').lean();
  const targetCount = Math.max(Number(totalSeats) || 60, seats.length);
  const repairs = planSeatNumberRepairs(seats, targetCount);

  for (const repair of repairs) {
    const result = await Seat.updateOne(
      { _id: repair.seat._id, seatNumber: repair.seat.seatNumber },
      { $set: { seatNumber: repair.seatNumber, row: repair.row } }
    );
    if (result.modifiedCount !== 1) {
      throw new Error(`Could not safely repair seat number ${repair.sourceSeatNumber}.`);
    }
    await Student.updateMany(
      { libraryId, seatNumber: repair.sourceSeatNumber },
      { $set: { seatNumber: repair.seatNumber } }
    );
  }

  if (repairs.length > 0) {
    seats = await Seat.find({ libraryId }).select('_id seatNumber').lean();
  }

  const existingSeatNumbers = new Set(seats.map((seat) => seat.seatNumber));
  const seatsToCreate = [];

  for (let index = 1; index <= targetCount; index += 1) {
    const seatNumber = getSeatLabel(index);
    if (existingSeatNumbers.has(seatNumber)) continue;

    existingSeatNumbers.add(seatNumber);
    seatsToCreate.push({
      libraryId,
      seatNumber,
      row: getRowLabel(Math.floor((index - 1) / 10)),
      floor: 'Ground Floor',
      status: 'Available',
    });
  }

  if (seatsToCreate.length > 0) {
    try {
      await Seat.insertMany(seatsToCreate, { ordered: false });
    } catch (err) {
      const writeErrors = err.writeErrors || err.result?.getWriteErrors?.() || [];
      const duplicateOnly = writeErrors.length > 0
        ? writeErrors.every((writeError) => writeError.code === 11000)
        : err.code === 11000;

      if (!duplicateOnly) {
        throw err;
      }
    }
  }

  return Seat.find({ libraryId }).sort({ seatNumber: 1 });
}

async function ensureLibrarySeats(libraryId, totalSeats = 60) {
  const release = await acquireLibrarySeatMutation(libraryId);
  try {
    const library = await Library.findById(libraryId).select('totalSeats').lean();
    const currentSeatCount = library ? library.totalSeats : totalSeats;
    return await ensureLibrarySeatsUnlocked(libraryId, currentSeatCount);
  } finally {
    release();
  }
}

module.exports = {
  acquireLibrarySeatMutation,
  ensureLibrarySeats,
  ensureLibrarySeatsUnlocked,
  getSeatLabel,
  getSeatOrdinal,
  planSeatRemoval,
  planSeatNumberRepairs,
};
