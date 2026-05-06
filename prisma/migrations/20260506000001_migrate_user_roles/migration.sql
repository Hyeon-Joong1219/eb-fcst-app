-- Step 2: Migrate existing data to new role values
UPDATE "users" SET "role" = 'EDITOR'::"UserRole" WHERE "role" = 'AM'::"UserRole";
UPDATE "users" SET "role" = 'VIEWER'::"UserRole" WHERE "role" = 'MANAGER'::"UserRole";

-- Update default value
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'VIEWER'::"UserRole";
