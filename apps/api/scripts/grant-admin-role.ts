#!/usr/bin/env -S npx tsx
// PentestHub AI — Administrator role verification/grant utility.
//
// Purpose: verify whether an existing account holds the platform-wide
// `ADMIN` role (the global RBAC role — see `Role`/`UserRole` in
// schema.prisma, `docs/adr/0001-auth-module.md` decision 8) and grant it
// if missing, reusing the exact same tables and idempotent-upsert pattern
// `prisma/seed.ts` already uses for its own dev fixture accounts. This is
// NOT a new authorization mechanism — it is a thin, one-off operational
// wrapper around the RBAC schema that already exists and is already
// enforced by the global `RolesGuard` (`common/guards/roles.guard.ts`)
// wherever a controller carries `@Roles('ADMIN')` (currently:
// `QuotaController`, `AiCostControlController`,
// `MarketplacePublisherController`, `MarketplaceSecurityController`).
//
// Deliberately does NOT:
//   - create a user account (a real account must already exist via the
//     normal registration or OAuth sign-in flow, which is the only place
//     a password the account holder controls is ever set);
//   - generate, print, or store any password/credential/token;
//   - touch any other user's roles or workspace memberships;
//   - modify RolesGuard, the Role/UserRole schema, or any controller.
//
// Usage:
//   cd apps/api
//   npx tsx scripts/grant-admin-role.ts <email>
//
// Requires DATABASE_URL to point at a reachable PentestHub AI database
// (loaded via `dotenv/config`, same as prisma/seed.ts). Exits 0 on
// success or no-op-because-already-correct, exits 1 if the account does
// not exist or on error. Prints no secrets — only email, user id, role
// names, and workspace membership role (never passwordHash or tokens).

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const ADMIN_ROLE = { name: "ADMIN", description: "Platform administrator" };

async function main(): Promise<void> {
  const email = process.argv[2];
  if (!email) {
    console.error("Usage: npx tsx scripts/grant-admin-role.ts <email>");
    process.exitCode = 1;
    return;
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, status: true, emailVerified: true },
  });

  if (!user) {
    console.error(
      `No account exists for ${email}. This script does not create accounts ` +
        `or passwords — the account holder must register (or sign in via OAuth) ` +
        `through the normal application flow first, then re-run this script.`,
    );
    process.exitCode = 1;
    return;
  }

  // Idempotent — mirrors seed.ts's seedRbac(). Safe to run even if
  // `prisma db seed` was never run against this database.
  const adminRole = await prisma.role.upsert({
    where: { name: ADMIN_ROLE.name },
    update: {},
    create: ADMIN_ROLE,
  });

  const existingGrant = await prisma.userRole.findUnique({
    where: { userId_roleId: { userId: user.id, roleId: adminRole.id } },
  });

  if (existingGrant) {
    console.log(`No change: ${email} already holds the global ADMIN role.`);
  } else {
    await prisma.userRole.create({
      data: { userId: user.id, roleId: adminRole.id },
    });
    console.log(
      `Granted the global ADMIN role to ${email}. Takes effect on this ` +
        `account's next login or access-token refresh (roles are resolved ` +
        `fresh at each — see SessionIssuerService/refresh.use-case.ts — not ` +
        `cached in an existing session).`,
    );
  }

  // Report-only from here — no further writes. Workspace ownership is
  // established automatically at registration/first-OAuth-login
  // (register.use-case.ts / oauth-login.use-case.ts both create a
  // personal Workspace + WorkspaceMember{role: OWNER}); this script does
  // not create a workspace on the account's behalf if one is somehow
  // missing, since that would be acting on a case the normal signup flow
  // is already supposed to guarantee.
  const roleNames = (
    await prisma.userRole.findMany({
      where: { userId: user.id },
      include: { role: { select: { name: true } } },
    })
  ).map((ur) => ur.role.name);

  const memberships = await prisma.workspaceMember.findMany({
    where: { userId: user.id },
    select: { role: true, workspace: { select: { id: true, name: true } } },
  });

  console.log("\nCurrent state:");
  console.log(`  email: ${user.email}`);
  console.log(`  userId: ${user.id}`);
  console.log(`  emailVerified: ${user.emailVerified}`);
  console.log(`  status: ${user.status}`);
  console.log(`  global roles: ${roleNames.join(", ") || "(none)"}`);
  if (memberships.length === 0) {
    console.warn(
      "  workspace memberships: NONE — unexpected for an account created " +
        "through the normal registration/OAuth flow; investigate before " +
        "treating this account as fully configured.",
    );
  } else {
    for (const m of memberships) {
      console.log(`  workspace membership: "${m.workspace.name}" (${m.workspace.id}) — role ${m.role}`);
    }
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
