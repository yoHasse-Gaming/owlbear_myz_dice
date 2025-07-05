import { DiceRoll } from "../types/DiceRoll";
import { DiceStyle } from "../types/DiceStyle";
import { DiceType } from "../types/DiceType";

/**
 * Configuration for triggering a dice roll
 */
export interface DiceRollConfig {
  dice: {
    style: DiceStyle;
    type: DiceType;
    count?: number;
  }[];
  bonus?: number;
  hidden?: boolean;
  advantage?: "ADVANTAGE" | "DISADVANTAGE" | null;
}

/**
 * Simple API interface for integrating with the MYZ Dice plugin
 */
export interface DicePluginAPI {
  // Roll triggering
  triggerRoll: (config: DiceRollConfig) => Promise<DiceResult>;
  triggerRollAsync: (config: DiceRollConfig) => Promise<void>;
  
  // Event subscription
  onDiceRollComplete: (callback: (result: DiceResult) => void) => () => void;
  onDiceRollStarted: (callback: (data: DiceStartData) => void) => () => void;
  
  // State queries  
  getCurrentDiceState: () => Promise<PlayerDiceState[]>;
  isPlayerRolling: (playerId: string) => Promise<boolean>;
  
  // Integration helpers
  listenToPlayer: (playerId: string, callback: (state: PlayerDiceState) => void) => () => void;
}

export interface DiceResult {
  playerId: string;
  playerName: string;
  diceRoll: DiceRoll;
  individualResults: Record<string, number>; // die ID -> result
  finalValue: number;
  timestamp: number;
}

export interface DiceStartData {
  playerId: string;
  playerName: string;
  diceRoll: DiceRoll;
  timestamp: number;
}

export interface PlayerDiceState {
  playerId: string;
  playerName: string;
  isRolling: boolean;
  diceRoll?: DiceRoll;
  rollValues?: Record<string, number | null>;
  finalValue?: number;
}

/**
 * Implementation of the DicePluginAPI
 */
export class MYZDiceAPI implements DicePluginAPI {
  private eventTarget = new EventTarget();
  private pendingRolls = new Map<string, { resolve: (result: DiceResult) => void; reject: (error: Error) => void }>();

  constructor() {
    this.initializeOBRListeners();
  }

  private async initializeOBRListeners() {
    // Only import OBR when we actually need it
    const OBR = (await import("@owlbear-rodeo/sdk")).default;
    
    // Listen for player metadata changes
    OBR.party.onChange((players: any[]) => {
      players.forEach(player => {
        const diceRoll = player.metadata["rodeo.owlbear.dice/roll"] as DiceRoll;
        const rollValues = player.metadata["rodeo.owlbear.dice/rollValues"] as Record<string, number | null>;
        
        if (diceRoll && rollValues) {
          const allFinished = Object.values(rollValues).every(value => value !== null);
          
          if (allFinished) {
            // Calculate final value
            const individualResults: Record<string, number> = {};
            let finalValue = 0;
            
            for (const [id, value] of Object.entries(rollValues)) {
              if (value !== null) {
                individualResults[id] = value;
                finalValue += value; // Simple sum - you may want to implement proper combination logic
              }
            }
            
            const result: DiceResult = {
              playerId: player.id,
              playerName: player.name,
              diceRoll,
              individualResults,
              finalValue,
              timestamp: Date.now()
            };
            
            // Resolve any pending promises for this player's roll
            const pendingEntries = Array.from(this.pendingRolls.entries());
            pendingEntries.forEach(([rollId, { resolve }]) => {
              // Simple approach: resolve the first pending roll
              // In a real implementation, you might want to track rolls more precisely
              resolve(result);
              this.pendingRolls.delete(rollId);
            });
            
            this.eventTarget.dispatchEvent(new CustomEvent("dice-complete", { detail: result }));
          }
        }
      });
    });
  }

  onDiceRollComplete(callback: (result: DiceResult) => void): () => void {
    const handler = (event: Event) => {
      const customEvent = event as CustomEvent<DiceResult>;
      callback(customEvent.detail);
    };
    
    this.eventTarget.addEventListener("dice-complete", handler);
    
    return () => {
      this.eventTarget.removeEventListener("dice-complete", handler);
    };
  }

  onDiceRollStarted(callback: (data: DiceStartData) => void): () => void {
    const handler = (event: Event) => {
      const customEvent = event as CustomEvent<DiceStartData>;
      callback(customEvent.detail);
    };
    
    this.eventTarget.addEventListener("dice-started", handler);
    
    return () => {
      this.eventTarget.removeEventListener("dice-started", handler);
    };
  }

  async getCurrentDiceState(): Promise<PlayerDiceState[]> {
    const OBR = (await import("@owlbear-rodeo/sdk")).default;
    const players = await OBR.party.getPlayers();
    
    return players.map(player => {
      const diceRoll = player.metadata["rodeo.owlbear.dice/roll"] as DiceRoll | undefined;
      const rollValues = player.metadata["rodeo.owlbear.dice/rollValues"] as Record<string, number | null> | undefined;
      
      const isRolling = Boolean(diceRoll && rollValues && 
        Object.values(rollValues).some(value => value === null));
      
      let finalValue: number | undefined;
      if (rollValues && Object.values(rollValues).every(value => value !== null)) {
        finalValue = Object.values(rollValues).reduce((sum: number, value) => sum + (value || 0), 0);
      }
      
      return {
        playerId: player.id,
        playerName: player.name,
        isRolling,
        diceRoll,
        rollValues,
        finalValue
      };
    });
  }

  async isPlayerRolling(playerId: string): Promise<boolean> {
    const states = await this.getCurrentDiceState();
    const playerState = states.find(state => state.playerId === playerId);
    return playerState?.isRolling || false;
  }

  listenToPlayer(playerId: string, callback: (state: PlayerDiceState) => void): () => void {
    // This would need to be implemented with OBR player-specific listeners
    // For now, return a simple cleanup function
    return () => {};
  }

  /**
   * Trigger a dice roll and wait for the result
   */
  async triggerRoll(config: DiceRollConfig): Promise<DiceResult> {
    return new Promise(async (resolve, reject) => {
      try {
        // Import the dice store
        const { useDiceRollStore } = await import("../dice/store");
        const { useDiceControlsStore, getDiceToRoll } = await import("../controls/store");
        const { generateDiceId } = await import("../helpers/generateDiceId");
        
        // Get store actions
        const startRoll = useDiceRollStore.getState().startRoll;
        const setDiceAdvantage = useDiceControlsStore.getState().setDiceAdvantage;
        const setDiceBonus = useDiceControlsStore.getState().setDiceBonus;
        const diceById = useDiceControlsStore.getState().diceById;
        
        // Set up dice configuration
        setDiceAdvantage(config.advantage || null);
        setDiceBonus(config.bonus || 0);
        
        // Build dice counts for the getDiceToRoll function
        const diceCounts: Record<string, number> = {};
        config.dice.forEach(diceConfig => {
          // Find matching dice in the dice set
          const matchingDie = Object.values(diceById).find(die => 
            die.style === diceConfig.style && die.type === diceConfig.type
          );
          
          if (matchingDie) {
            diceCounts[matchingDie.id] = diceConfig.count || 1;
          }
        });
        
        // Generate the dice roll
        const diceRoll = getDiceToRoll(diceCounts, config.advantage || null, diceById);
        const rollConfig: DiceRoll = {
          dice: diceRoll,
          bonus: config.bonus,
          hidden: config.hidden
        };
        
        // Create a unique roll ID for tracking
        const rollId = generateDiceId();
        
        // Store the promise resolver
        this.pendingRolls.set(rollId, { resolve, reject });
        
        // Start the roll
        startRoll(rollConfig);
        
        // Set a timeout to reject if roll takes too long
        setTimeout(() => {
          if (this.pendingRolls.has(rollId)) {
            this.pendingRolls.delete(rollId);
            reject(new Error("Dice roll timed out"));
          }
        }, 30000); // 30 second timeout
        
      } catch (error) {
        reject(error instanceof Error ? error : new Error("Failed to trigger dice roll"));
      }
    });
  }

  /**
   * Trigger a dice roll without waiting for the result
   */
  async triggerRollAsync(config: DiceRollConfig): Promise<void> {
    try {
      // Import the dice store
      const { useDiceRollStore } = await import("../dice/store");
      const { useDiceControlsStore, getDiceToRoll } = await import("../controls/store");
      
      // Get store actions
      const startRoll = useDiceRollStore.getState().startRoll;
      const setDiceAdvantage = useDiceControlsStore.getState().setDiceAdvantage;
      const setDiceBonus = useDiceControlsStore.getState().setDiceBonus;
      const diceById = useDiceControlsStore.getState().diceById;
      
      // Set up dice configuration
      setDiceAdvantage(config.advantage || null);
      setDiceBonus(config.bonus || 0);
      
      // Build dice counts
      const diceCounts: Record<string, number> = {};
      config.dice.forEach(diceConfig => {
        const matchingDie = Object.values(diceById).find(die => 
          die.style === diceConfig.style && die.type === diceConfig.type
        );
        
        if (matchingDie) {
          diceCounts[matchingDie.id] = diceConfig.count || 1;
        }
      });
      
      // Generate and start the dice roll
      const diceRoll = getDiceToRoll(diceCounts, config.advantage || null, diceById);
      const rollConfig: DiceRoll = {
        dice: diceRoll,
        bonus: config.bonus,
        hidden: config.hidden
      };
      
      startRoll(rollConfig);
    } catch (error) {
      throw error instanceof Error ? error : new Error("Failed to trigger dice roll");
    }
  }
}

// Singleton instance for easy use
export const diceAPI = new MYZDiceAPI();
