import "server-only";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { seal } from "./crypto.server";

export type SecurityMessage = { purpose: "RESET" | "VERIFY" | "INVITE"; to: string; token: string; kind?: string; expiresAt: string };
export type SecurityDelivery = (client: PoolClient, message: SecurityMessage) => Promise<void>;
/** Durable encrypted delivery boundary. No external mail is sent implicitly.
 * Tests inject a memory inbox; a future worker must use an explicitly configured
 * provider and honor expiry. Tokens/addresses never enter application logs. */
export const queueSecurityMessage: SecurityDelivery = async (client,message) => {
  const id = randomUUID();
  await client.query(`INSERT INTO security_outbox(id,purpose,payload_cipher,expires_at) VALUES($1,$2,$3,$4)`,
    [id,message.purpose,seal(JSON.stringify(message),`mail:${id}`),message.expiresAt]);
};
