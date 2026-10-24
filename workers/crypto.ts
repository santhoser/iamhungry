const encoder = new TextEncoder();
const hex = (bytes: ArrayBuffer) =>
  Array.from(new Uint8Array(bytes), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
const unhex = (text: string) =>
  Uint8Array.from(text.match(/../g) || [], (byte) => parseInt(byte, 16));
export async function digest(value: string) {
  return hex(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}
// PBKDF2 is available through asynchronous Web Crypto on Workers. Fresh D1 accounts
// use this explicit versioned format; local scrypt password records are not imported.
export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2-sha256:100000:${hex(salt.buffer)}:${await derive(password, salt, 100000)}`;
}
async function derive(password: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  return hex(
    await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        hash: "SHA-256",
        salt: salt as BufferSource,
        iterations,
      },
      key,
      256,
    ),
  );
}
export async function checkPassword(password: string, record: string) {
  const [algorithm, rounds, salt, expected] = record.split(":");
  if (
    algorithm !== "pbkdf2-sha256" ||
    rounds !== "100000" ||
    !/^[a-f0-9]{32}$/.test(salt) ||
    !/^[a-f0-9]{64}$/.test(expected)
  )
    return false;
  const actual = await derive(password, unhex(salt), Number(rounds));
  let difference = 0;
  for (let i = 0; i < actual.length; i++)
    difference |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  return difference === 0;
}
