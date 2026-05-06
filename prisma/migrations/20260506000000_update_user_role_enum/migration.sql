-- Step 1: Add new enum values (cannot be used in same transaction)
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'EDITOR';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'VIEWER';
