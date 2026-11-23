-- An account can hold several roles: its main role plus these.
ALTER TABLE "User" ADD COLUMN "extraRoles" "Role"[] NOT NULL DEFAULT ARRAY[]::"Role"[];
