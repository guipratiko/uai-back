/**
 * Remove todos os dados do banco e recria apenas o usuário admin (ADMIN_EMAIL / ADMIN_PASSWORD).
 * Uso: npm run db:clean
 */
import { prisma } from "../src/lib/prisma";
import { ensureAdminUser } from "../src/services/auth.service";

async function main() {
  console.log("Limpando banco de dados...");

  await prisma.ticketTransfer.deleteMany();
  await prisma.passwordResetToken.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.issuedTicket.deleteMany();
  await prisma.eventCommissionerTicketTier.deleteMany();
  await prisma.discountCouponTicketTier.deleteMany();
  await prisma.order.deleteMany();
  await prisma.eventCommissioner.deleteMany();
  await prisma.discountCoupon.deleteMany();
  await prisma.producerCourtesyLog.deleteMany();
  await prisma.organizerEvent.deleteMany();
  await prisma.producerEvent.deleteMany();
  await prisma.heroSlide.deleteMany();
  await prisma.ticketTier.deleteMany();
  await prisma.event.deleteMany();
  await prisma.organizer.deleteMany();
  await prisma.producer.deleteMany();
  await prisma.user.deleteMany();

  await ensureAdminUser();

  console.log("Banco limpo. Usuário admin recriado.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
