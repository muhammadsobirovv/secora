import "dotenv/config";
import * as argon2 from "argon2";
import { randomBytes } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";

/// LOCAL-ONLY test account with a fixed, known password so you can sign in
/// while developing. Refuses to run unless NODE_ENV is not "production" AND the
/// database host is localhost/127.0.0.1/::1, so it can never touch a server DB.
/// Idempotent: re-running resets the password to the one below.
const TEST_EMAIL = "test@secora.local";
const TEST_PASSWORD = "Test1234!Local";
const TEST_NAME = "Local Tester";

function assertLocalOnly(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to run seed:local with NODE_ENV=production.");
  }
  const host = new URL(url).hostname;
  if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(host)) {
    throw new Error(`Refusing to run seed:local against non-local database host "${host}".`);
  }
  return url;
}

async function main(): Promise<void> {
  const connectionString = assertLocalOnly();
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    const passwordHash = await argon2.hash(TEST_PASSWORD, { type: argon2.argon2id });
    const role = await prisma.role.upsert({
      where: { name: "USER" },
      update: {},
      create: { name: "USER", description: "Standard authenticated user" },
    });

    const user = await prisma.user.upsert({
      where: { email: TEST_EMAIL },
      update: { passwordHash, emailVerified: true },
      create: { email: TEST_EMAIL, passwordHash, displayName: TEST_NAME, emailVerified: true },
    });

    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      update: {},
      create: { userId: user.id, roleId: role.id },
    });

    if (!(await prisma.workspaceMember.findFirst({ where: { userId: user.id } }))) {
      const workspace = await prisma.workspace.create({
        data: { name: "Local Tester's Workspace", slug: `local-tester-${randomBytes(3).toString("hex")}` },
      });
      await prisma.workspaceMember.create({
        data: { workspaceId: workspace.id, userId: user.id, role: "OWNER" },
      });
    }

    await prisma.userPreferences.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id },
    });

    console.log(`\nLocal test account ready:\n  ${TEST_EMAIL} / ${TEST_PASSWORD}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
