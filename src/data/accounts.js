// Demo accounts. Passwords are stored only as salted hashes.
// Demo credentials (also shown on the login screen):
//   admin@hirara.demo  /  Admin@1234
//   maria@hirara.demo  /  Employee@1234
export const DEMO_CREDENTIALS = [
  { role: "Admin", email: "admin@hirara.demo", password: "Admin@1234" },
  { role: "Employee", email: "maria@hirara.demo", password: "Employee@1234" },
];

export const seedAccounts = [
  {
    id: "acc-admin",
    email: "admin@hirara.demo",
    name: "HR Administrator",
    role: "admin",
    employeeId: null,
    salt: "9f2c41a7d3e85b60",
    passwordHash:
      "0cce291f629076a46628b8d85c7baa7c1bb8c5b02db164c605f907ab81418111",
  },
  {
    id: "acc-maria",
    email: "maria@hirara.demo",
    name: "Maria Santos",
    role: "employee",
    employeeId: "EMP001",
    salt: "5be07d19c8a2f4e3",
    passwordHash:
      "3f936aa45e75bd40f8dfba68905c1b1c9e641906c7b360bd80c448866f680f19",
  },
];