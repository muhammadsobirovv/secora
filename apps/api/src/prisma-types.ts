// Single re-export point for generated Prisma types, so every repository
// interface/adapter (however deeply nested) imports from one place instead
// of computing a fresh relative path into apps/api/generated/prisma/.
export * from '../generated/prisma/client.js';
