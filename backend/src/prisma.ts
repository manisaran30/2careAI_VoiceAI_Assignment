import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

function isPostgres(url: string): boolean {
  return url.startsWith('postgresql://') || url.startsWith('postgres://');
}

// For PostgreSQL, set session timezone to Asia/Kolkata so timestamps show local time
function getDbUrl(): string {
  const url = process.env.DATABASE_URL || '';
  if (!isPostgres(url)) return url;
  const param = 'options=-c%20timezone=Asia%2FKolkata';
  if (url.includes('?')) {
    return url.includes(param) ? url : `${url}&${param}`;
  }
  return `${url}?${param}`;
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  datasources: {
    db: { url: getDbUrl() },
  },
});

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

// For PostgreSQL, ensure timezone is set on any existing connections
if (isPostgres(process.env.DATABASE_URL || '')) {
  prisma.$executeRawUnsafe(`SET TIMEZONE TO 'Asia/Kolkata'`).catch(() => {});
}
