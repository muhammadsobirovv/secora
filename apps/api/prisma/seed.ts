import "dotenv/config";
import * as argon2 from "argon2";
import { randomBytes } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const ROLES = [
  { name: "USER", description: "Standard authenticated user" },
  { name: "ADMIN", description: "Platform administrator" },
];

// Representative, not exhaustive — enough to prove the RBAC model works.
const PERMISSIONS = [
  { key: "users:read:self", description: "Read own user profile" },
  { key: "sessions:manage:self", description: "Manage own sessions" },
  { key: "admin:*", description: "Full administrative access" },
];

const ROLE_PERMISSIONS: Record<string, string[]> = {
  USER: ["users:read:self", "sessions:manage:self"],
  ADMIN: ["users:read:self", "sessions:manage:self", "admin:*"],
};

async function hashPassword(plaintext: string): Promise<string> {
  return argon2.hash(plaintext, { type: argon2.argon2id });
}

function generateDevPassword(): string {
  return randomBytes(9).toString("base64url");
}

async function seedRbac(): Promise<Map<string, string>> {
  const roleIdByName = new Map<string, string>();

  for (const role of ROLES) {
    const created = await prisma.role.upsert({
      where: { name: role.name },
      update: {},
      create: role,
    });
    roleIdByName.set(role.name, created.id);
  }

  const permissionIdByKey = new Map<string, string>();
  for (const permission of PERMISSIONS) {
    const created = await prisma.permission.upsert({
      where: { key: permission.key },
      update: {},
      create: permission,
    });
    permissionIdByKey.set(permission.key, created.id);
  }

  for (const [roleName, permissionKeys] of Object.entries(ROLE_PERMISSIONS)) {
    const roleId = roleIdByName.get(roleName)!;
    for (const permissionKey of permissionKeys) {
      const permissionId = permissionIdByKey.get(permissionKey)!;
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId, permissionId } },
        update: {},
        create: { roleId, permissionId },
      });
    }
  }

  return roleIdByName;
}

interface SeedUserInput {
  email: string;
  displayName: string;
  roleName: string;
}

async function seedUser(input: SeedUserInput, roleIdByName: Map<string, string>): Promise<string> {
  const password = generateDevPassword();
  const passwordHash = await hashPassword(password);

  const user = await prisma.user.upsert({
    where: { email: input.email },
    update: {},
    create: {
      email: input.email,
      passwordHash,
      displayName: input.displayName,
      emailVerified: true,
    },
  });

  const roleId = roleIdByName.get(input.roleName)!;
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId } },
    update: {},
    create: { userId: user.id, roleId },
  });

  const existingMembership = await prisma.workspaceMember.findFirst({ where: { userId: user.id } });
  if (!existingMembership) {
    const workspace = await prisma.workspace.create({
      data: {
        name: `${input.displayName}'s Workspace`,
        slug: `${input.displayName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${randomBytes(3).toString("hex")}`,
      },
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

  return password;
}

async function main(): Promise<void> {
  const roleIdByName = await seedRbac();

  const adminPassword = await seedUser(
    { email: "admin@pentesthub.local", displayName: "Admin", roleName: "ADMIN" },
    roleIdByName,
  );
  const userPassword = await seedUser(
    { email: "user@pentesthub.local", displayName: "Demo User", roleName: "USER" },
    roleIdByName,
  );

  console.log("\nSeed complete. Dev credentials (not stored anywhere else):\n");
  console.log(`  ADMIN  admin@pentesthub.local / ${adminPassword}`);
  console.log(`  USER   user@pentesthub.local  / ${userPassword}\n`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
