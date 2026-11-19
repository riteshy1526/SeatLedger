const assert = require('node:assert/strict');
const test = require('node:test');
const {
  acquireLibrarySeatMutation,
  getSeatLabel,
  planSeatRemoval,
} = require('../src/utils/seatProvisioning');

function createSeats(count) {
  return Array.from({ length: count }, (_, index) => {
    const seatNumber = getSeatLabel(index + 1);
    return {
      _id: `seat-${index + 1}`,
      seatNumber,
      row: seatNumber.match(/^([A-Z]+)/)[1],
    };
  });
}

test('plans removal of any seat and shifts subsequent labels down in order', () => {
  const plan = planSeatRemoval(createSeats(13), 'B2');

  assert.equal(plan.targetSeat.seatNumber, 'B2');
  assert.equal(plan.totalSeats, 12);
  assert.deepEqual(
    plan.renumberedSeats.map(({ from, to }) => [from, to]),
    [['B3', 'B2']]
  );
});

test('supports removing the first or last seat without renumbering unrelated seats', () => {
  const seats = createSeats(3);

  const firstSeatPlan = planSeatRemoval(seats, 'A1');
  assert.deepEqual(
    firstSeatPlan.renumberedSeats.map(({ from, to }) => [from, to]),
    [['A2', 'A1'], ['A3', 'A2']]
  );

  const lastSeatPlan = planSeatRemoval(seats, 'A3');
  assert.equal(lastSeatPlan.renumberedSeats.length, 0);
});

test('updates the row label when renumbering across a row boundary', () => {
  const plan = planSeatRemoval(createSeats(11), 'A10');
  const movedSeat = plan.renumberedSeats[0];

  assert.deepEqual([movedSeat.from, movedSeat.to, movedSeat.row], ['B1', 'A10', 'A']);
});

test('rejects removing from a non-sequential seat layout', () => {
  assert.throws(
    () => planSeatRemoval([
      { _id: 'seat-1', seatNumber: 'A1', row: 'A' },
      { _id: 'seat-3', seatNumber: 'A3', row: 'A' },
    ], 'A1'),
    /sequential labels/
  );
});

test('serializes seat provisioning and mutations per library', async () => {
  const releaseFirst = await acquireLibrarySeatMutation('library-1');
  let secondAcquired = false;
  const secondMutation = acquireLibrarySeatMutation('library-1').then((release) => {
    secondAcquired = true;
    release();
  });

  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(secondAcquired, false);

  releaseFirst();
  await secondMutation;
  assert.equal(secondAcquired, true);
});
