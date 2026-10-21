import { createInterface } from "node:readline/promises";
import { openDatabase, hashPassword } from "../server/db.js";
const [role, username] = process.argv.slice(2);
if (
  !["admin", "owner", "cashier"].includes(role) ||
  !username ||
  !/^[a-zA-Z0-9._-]{3,40}$/.test(username)
) {
  console.error(
    "Usage: npm run staff:create -- admin|owner|cashier username (3–40 letters/numbers/._-)",
  );
  process.exit(1);
}
const rl = createInterface({ input: process.stdin, output: process.stdout });
console.log(
  "Local setup: password input is visible in this terminal. Do not share this terminal recording.",
);
const password = await rl.question("Password (at least 8 characters): ");
const confirm = await rl.question("Confirm password: ");
rl.close();
if (password.length < 8 || password.length > 128 || password !== confirm) {
  console.error("Passwords must match and contain 8–128 characters.");
  process.exit(1);
}
const db = openDatabase();
try {
  db.prepare(
    "INSERT INTO users(username,password,role,is_admin) VALUES(?,?,?,?)",
  ).run(
    username,
    hashPassword(password),
    role === "admin" ? "owner" : role,
    +(role === "admin"),
  );
  console.log("Created " + role + " " + username);
} catch {
  console.error(
    "Username already exists. Use owner user management to change accounts.",
  );
  process.exitCode = 1;
} finally {
  db.close();
}
