import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const adminPhone = "0900000000";
  const existing = await prisma.user.findUnique({ where: { phone: adminPhone } });
  if (existing) {
    console.log("Admin account already exists:", adminPhone);
    return;
  }

  const passwordHash = await bcrypt.hash("admin123", 10);
  await prisma.user.create({
    data: {
      phone: adminPhone,
      name: "Quản trị viên",
      passwordHash,
      role: "ADMIN",
      mustChangePassword: true,
    },
  });

  console.log("Created default admin account:");
  console.log("  Phone:", adminPhone);
  console.log("  Password: admin123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
