import { DiceRoll } from "../types/DiceRoll";

export interface DiceEvent {
  type: "ROLL_STARTED" | "ROLL_COMPLETE" | "DIE_FINISHED";
  data: {
    playerId: string;
    playerName: string;
    diceRoll: DiceRoll;
    rollValues?: Record<string, number>;
    finalValue?: number;
    timestamp: number;
  };
}

class DiceEventEmitter extends EventTarget {
  emitDiceEvent(event: DiceEvent) {
    this.dispatchEvent(new CustomEvent("dice-event", { detail: event }));
  }

  onDiceEvent(callback: (event: DiceEvent) => void) {
    const handler = (e: CustomEvent) => callback(e.detail);
    this.addEventListener("dice-event", handler as EventListener);
    return () => this.removeEventListener("dice-event", handler as EventListener);
  }
}

export const diceEventEmitter = new DiceEventEmitter();
