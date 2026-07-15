import { existsSync } from "fs";
import { mkdir, readFile, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

type LocalUser = {
  id: string;
  email: string;
  planType: "FREE" | "CREATOR" | "PRO";
  stripeCustomerId: string | null;
  createdAt: string;
  passwordHash?: string | null;
  resetPasswordToken?: string | null;
  resetPasswordExpiresAt?: string | null;
};

const dataDir = process.env.VERCEL === "1" ? join(tmpdir(), "innkwise") : join(process.cwd(), "data");
const usersFile = join(dataDir, "users.json");

async function ensureUsersFile() {
  await mkdir(dataDir, { recursive: true });
  if (!existsSync(usersFile)) {
    await writeFile(usersFile, "[]", "utf8");
  }
}

async function readUsers(): Promise<LocalUser[]> {
  await ensureUsersFile();
  const raw = await readFile(usersFile, "utf8");

  try {
    const parsed = JSON.parse(raw) as LocalUser[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeUsers(users: LocalUser[]) {
  await ensureUsersFile();
  await writeFile(usersFile, JSON.stringify(users, null, 2), "utf8");
}

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function findLocalUserByEmail(email: string) {
  const users = await readUsers();
  return users.find((user) => user.email === email) ?? null;
}

export async function createLocalUser(email: string, passwordHash?: string | null) {
  const users = await readUsers();
  const user: LocalUser = {
    id: createId(),
    email,
    planType: "FREE",
    stripeCustomerId: null,
    createdAt: new Date().toISOString(),
    passwordHash: passwordHash ?? null,
    resetPasswordToken: null,
    resetPasswordExpiresAt: null
  };

  users.push(user);
  await writeUsers(users);
  return user;
}

export async function findOrCreateLocalUser(email: string) {
  const existingUser = await findLocalUserByEmail(email);
  if (existingUser) {
    return { user: existingUser, isNewUser: false };
  }

  const user = await createLocalUser(email);
  return { user, isNewUser: true };
}

export async function createSignupLocalUser(email: string, passwordHash: string) {
  const existingUser = await findLocalUserByEmail(email);
  if (existingUser) {
    return null;
  }

  return createLocalUser(email, passwordHash);
}

export async function setLocalUserPassword(email: string, passwordHash: string) {
  const users = await readUsers();
  const user = users.find((entry) => entry.email === email);
  if (!user) return null;

  user.passwordHash = passwordHash;
  await writeUsers(users);
  return user;
}

export async function findLocalUserById(id: string) {
  const users = await readUsers();
  return users.find((user) => user.id === id) ?? null;
}

export async function setLocalResetToken(email: string, token: string, expiresAt: Date) {
  const users = await readUsers();
  const user = users.find((entry) => entry.email === email);
  if (!user) return null;

  user.resetPasswordToken = token;
  user.resetPasswordExpiresAt = expiresAt.toISOString();
  await writeUsers(users);
  return user;
}

export async function findLocalUserByResetToken(token: string) {
  const users = await readUsers();
  return (
    users.find(
      (user) =>
        user.resetPasswordToken === token &&
        !!user.resetPasswordExpiresAt &&
        new Date(user.resetPasswordExpiresAt).getTime() > Date.now()
    ) ?? null
  );
}

export async function updateLocalUserPassword(token: string, passwordHash: string) {
  const users = await readUsers();
  const user = users.find((entry) => entry.resetPasswordToken === token);
  if (!user) return null;

  if (!user.resetPasswordExpiresAt || new Date(user.resetPasswordExpiresAt).getTime() <= Date.now()) {
    return null;
  }

  user.passwordHash = passwordHash;
  user.resetPasswordToken = null;
  user.resetPasswordExpiresAt = null;
  await writeUsers(users);
  return user;
}
