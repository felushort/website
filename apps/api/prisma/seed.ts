import { PrismaClient, WorkspaceRole, SubscriptionPlan, SubscriptionStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("Password123!", 12);

  const owner = await prisma.user.upsert({
    where: { email: "owner@serverforge.io" },
    update: {},
    create: {
      email: "owner@serverforge.io",
      displayName: "Server Owner",
      passwordHash
    }
  });

  const admin = await prisma.user.upsert({
    where: { email: "admin@serverforge.io" },
    update: {},
    create: {
      email: "admin@serverforge.io",
      displayName: "Server Admin",
      passwordHash
    }
  });

  const workspace = await prisma.workspace.upsert({
    where: { slug: "ironrealm" },
    update: {},
    create: {
      name: "IronRealm Network",
      slug: "ironrealm",
      ownerId: owner.id,
      members: {
        create: [
          { userId: owner.id, role: WorkspaceRole.OWNER },
          { userId: admin.id, role: WorkspaceRole.ADMIN }
        ]
      }
    }
  });

  await prisma.subscription.upsert({
    where: { workspaceId: workspace.id },
    update: {},
    create: {
      workspaceId: workspace.id,
      ownerId: owner.id,
      plan: SubscriptionPlan.PRO,
      status: SubscriptionStatus.ACTIVE,
      periodStart: new Date(),
      periodEnd: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30)
    }
  });

  await prisma.revenueEntry.createMany({
    data: [
      {
        workspaceId: workspace.id,
        date: new Date("2026-02-01"),
        source: "Manual",
        productName: "VIP Rank",
        amount: 149.99,
        currency: "USD"
      },
      {
        workspaceId: workspace.id,
        date: new Date("2026-02-10"),
        source: "Manual",
        productName: "Crate Key Bundle",
        amount: 79.5,
        currency: "USD"
      }
    ],
    skipDuplicates: true
  });

  const identity = await prisma.playerIdentity.upsert({
    where: { globalPlayerId: "gp_steve_001" },
    update: {},
    create: {
      globalPlayerId: "gp_steve_001",
      minecraftUuid: "069a79f4-44e9-4726-a5be-fca90e38aaf5",
      knownUsernames: ["Steve"]
    }
  });

  await prisma.playerProfile.upsert({
    where: {
      workspaceId_playerIdentityId: {
        workspaceId: workspace.id,
        playerIdentityId: identity.id
      }
    },
    update: {},
    create: {
      workspaceId: workspace.id,
      playerIdentityId: identity.id,
      reputationScore: 88,
      warningCount: 1,
      notes: "Active PvP player"
    }
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
