declare global {
  namespace App {
    interface Locals {
      /** Signed-in owner e-mail, resolved by `handleDivelog` on every request. */
      owner: string | null;
    }
  }
}

export {};
