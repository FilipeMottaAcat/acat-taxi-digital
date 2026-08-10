-- Password reset requests should be removed automatically when the driver they belong to is deleted.
ALTER TABLE "PasswordResetRequest" DROP CONSTRAINT "PasswordResetRequest_driverId_fkey";
ALTER TABLE "PasswordResetRequest" ADD CONSTRAINT "PasswordResetRequest_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;
