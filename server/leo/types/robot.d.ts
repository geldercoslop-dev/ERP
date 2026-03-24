/**
 * Tipos para biblioteca robotjs (import dinâmico)
 * Evita erros de TypeScript com require()
 */

declare module 'robotjs' {
  export function getScreenSize(): { width: number; height: number };
  export function moveMouse(x: number, y: number): void;
  export function moveMouseSmooth(x: number, y: number): void;
  export function mouseToggle(action: 'down' | 'up'): void;
  export function click(button?: 'left' | 'right' | 'middle'): void;
  export function doubleClick(button?: 'left' | 'right' | 'middle'): void;
  export function scrollMouse(x: number, y: number): void;
  export function getMousePos(): { x: number; y: number };
  export function typeString(key: string, modifier?: string[]): void;
  export function typeStringDelayed(key: string, modifier?: string[], delay: number): void;
  export function tap(key: string, modifier?: string[]): void;
  export function keyToggle(key: string, down: boolean, modifier?: string[]): void;
}
