import { z } from "zod";

const configSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default("0.0.0.0"),
  DATABASE_URL: z.url(),
  OP_BASE_URL: z.url(),
  /** Compte administrateur créé au premier démarrage s'il n'existe pas. */
  ADMIN_USERNAME: z.string().min(1),
  ADMIN_PASSWORD: z.string().min(12),
  /** Cookie de session réservé à HTTPS ; à désactiver uniquement en développement sur HTTP. */
  COOKIE_SECURE: z.stringbool().default(true),
  /** Clé AES-256-GCM des jetons OP : 32 octets encodés en base64 (`openssl rand -base64 32`). */
  OP_TOKEN_ENCRYPTION_KEY: z
    .base64()
    .transform((value) => Buffer.from(value, "base64"))
    .refine((key) => key.length === 32, "La clé doit faire 32 octets une fois décodée"),
});

export type Config = z.infer<typeof configSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = configSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Configuration invalide :\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}
