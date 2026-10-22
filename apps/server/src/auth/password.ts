import { hash, verify } from "@node-rs/argon2";

// Les options par défaut de @node-rs/argon2 produisent un hachage Argon2id
// (enum `Algorithm` non importable sous isolatedModules).
export function hashPassword(password: string): Promise<string> {
  return hash(password);
}

export function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  return verify(passwordHash, password);
}
