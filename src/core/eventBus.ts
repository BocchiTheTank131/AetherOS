// AetherOS - Typed System Event Bus
import type { SystemEvents } from './types';

type EventHandler<T> = (payload: T) => void;

export class EventBus {
  private listeners = new Map<keyof SystemEvents, Set<EventHandler<unknown>>>();
  private anyListeners = new Set<(event: keyof SystemEvents, payload: unknown) => void>();

  /**
   * Subscribe to a system event
   * @returns Unsubscribe function
   */
  public on<K extends keyof SystemEvents>(
    event: K,
    handler: EventHandler<SystemEvents[K]>
  ): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler as EventHandler<unknown>);

    return () => this.off(event, handler);
  }

  /**
   * Subscribe to a system event once
   */
  public once<K extends keyof SystemEvents>(
    event: K,
    handler: EventHandler<SystemEvents[K]>
  ): () => void {
    const wrapper: EventHandler<SystemEvents[K]> = (payload) => {
      this.off(event, wrapper);
      handler(payload);
    };
    return this.on(event, wrapper);
  }

  /**
   * Unsubscribe handler
   */
  public off<K extends keyof SystemEvents>(
    event: K,
    handler: EventHandler<SystemEvents[K]>
  ): void {
    const set = this.listeners.get(event);
    if (set) {
      set.delete(handler as EventHandler<unknown>);
      if (set.size === 0) {
        this.listeners.delete(event);
      }
    }
  }

  /**
   * Emit an event to all subscribers
   */
  public emit<K extends keyof SystemEvents>(event: K, payload: SystemEvents[K]): void {
    const set = this.listeners.get(event);
    if (set) {
      for (const handler of Array.from(set)) {
        try {
          handler(payload);
        } catch (err) {
          console.error(`Error in event handler for "${String(event)}":`, err);
        }
      }
    }

    for (const anyHandler of Array.from(this.anyListeners)) {
      try {
        anyHandler(event, payload);
      } catch (err) {
        console.error(`Error in universal event handler:`, err);
      }
    }
  }

  /**
   * Listen to all events
   */
  public onAny(handler: (event: keyof SystemEvents, payload: unknown) => void): () => void {
    this.anyListeners.add(handler);
    return () => this.anyListeners.delete(handler);
  }

  /**
   * Clear all listeners
   */
  public clear(): void {
    this.listeners.clear();
    this.anyListeners.clear();
  }
}

export const systemEventBus = new EventBus();
