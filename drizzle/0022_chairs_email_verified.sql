-- Chairs never sign in by email (#136). Their addresses count as verified, so Better Auth's email
-- sign-in can't treat a Chair's account as unproven and strip its password before refusing it.
UPDATE "user" SET "email_verified" = true WHERE "role" LIKE '%admin%' AND "email_verified" = false;
