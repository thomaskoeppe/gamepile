import { PrismaClient } from '@/src/prisma/generated/client.js'
import { withAccelerate } from '@prisma/extension-accelerate'
import { PrismaPg } from '@prisma/adapter-pg'

const globalForPrisma = global as unknown as {
    prisma: ReturnType<typeof createPrismaClient>
}

function createPrismaClient() {
    const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
    return new PrismaClient({ adapter }).$extends(withAccelerate())
}

const prisma = globalForPrisma.prisma || createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

export default prisma