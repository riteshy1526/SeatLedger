export function formatSeatNumber(seatNumber) {
  const value = String(seatNumber ?? '').trim();
  if (!value) return value;

  if (/^\d+$/.test(value)) {
    return String(Number(value));
  }

  const match = value.match(/^([a-z]+)(\d+)$/i);
  if (match) {
    const rowIndex = [...match[1].toUpperCase()].reduce(
      (total, letter) => total * 26 + letter.charCodeAt(0) - 64,
      0
    ) - 1;
    return String(rowIndex * 10 + Number(match[2]));
  }

  if (/^[a-z]+$/i.test(value)) {
    return String([...value.toUpperCase()].reduce(
      (total, letter) => total * 26 + letter.charCodeAt(0) - 64,
      0
    ));
  }

  return value;
}

export function sortSeatsByNumber(seats) {
  return [...seats].sort((first, second) => {
    const firstNumber = Number(formatSeatNumber(first.seatNumber));
    const secondNumber = Number(formatSeatNumber(second.seatNumber));
    if (Number.isFinite(firstNumber) && Number.isFinite(secondNumber)) {
      return firstNumber - secondNumber;
    }
    return String(first.seatNumber).localeCompare(String(second.seatNumber), undefined, { numeric: true });
  });
}
