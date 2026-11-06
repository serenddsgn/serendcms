/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    /** Gesetzt von der Vorschau-Middleware. */
    preview?: boolean;
  }
}
