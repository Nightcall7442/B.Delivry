-- Cash orders are confirmed the moment they are placed and go straight to the courier search, with no
-- step for the desk in between (the Urgench trial: nobody sits in the admin panel to press «Подтвердить»).
-- A tenant that never had a settings row gets one; the rest keep their other switches. It can be turned
-- back off in the admin panel (Настройки).
INSERT INTO "tenant_settings" ("tenantId", "autoConfirmOrders", "updatedAt")
SELECT "id", true, CURRENT_TIMESTAMP FROM "tenants"
ON CONFLICT ("tenantId") DO UPDATE SET "autoConfirmOrders" = true, "updatedAt" = CURRENT_TIMESTAMP;
