/**
 * Add this component to the dice plugin to support external roll triggering
 * This goes in the MYZ Dice plugin to listen for roll requests from other plugins
 */

import { useEffect } from "react";
import { useDiceRollStore } from "../dice/store";
import { useDiceControlsStore, getDiceToRoll } from "../controls/store";
import { generateDiceId } from "../helpers/generateDiceId";
import { DiceRoll } from "../types/DiceRoll";

interface ExternalRollRequest {
  type: "TRIGGER_ROLL";
  rollId: string;
  config: {
    dice: {
      style: "MYZBASE" | "MYZSKILL" | "MYZGEAR";
      count?: number;
    }[];
    hidden?: boolean;
  };
}

/**
 * Component to handle external roll requests via BroadcastChannel
 * Add this to your main App component in the dice plugin
 */
export function ExternalRollHandler() {
  const startRoll = useDiceRollStore(state => state.startRoll);
  const diceById = useDiceControlsStore(state => state.diceById);

  useEffect(() => {
    console.log("[ExternalRollHandler] Initializing external roll handler...");
    
    if (!window.BroadcastChannel) {
      console.warn("[ExternalRollHandler] BroadcastChannel not supported in this environment");
      return;
    }

    const channel = new BroadcastChannel("myz-dice-integration");
    console.log("[ExternalRollHandler] BroadcastChannel 'myz-dice-integration' created and listening for messages");
    
    channel.onmessage = (event) => {
      console.log("[ExternalRollHandler] Broadcast message received:", event.data);
      const request = event.data as ExternalRollRequest;
      
      if (request.type === "TRIGGER_ROLL") {
        console.log("[ExternalRollHandler] Processing TRIGGER_ROLL request:", request);
        handleExternalRoll(request);
      } else {
        console.log("[ExternalRollHandler] Unknown message type received:", request.type);
      }
    };

    const handleExternalRoll = (request: ExternalRollRequest) => {
      try {
        console.log("[ExternalRollHandler] Handling external roll request:", request);
        const { config } = request;
        
        // Build dice counts
        const diceCounts: Record<string, number> = {};
        config.dice.forEach(diceConfig => {
          const matchingDie = Object.values(diceById).find(die => 
            die.style === diceConfig.style
          );
          
          if (matchingDie) {
            diceCounts[matchingDie.id] = diceConfig.count || 1;
            console.log(`[ExternalRollHandler] Mapped ${diceConfig.style} to die ID ${matchingDie.id} with count ${diceConfig.count || 1}`);
          } else {
            console.warn(`[ExternalRollHandler] No matching die found for style: ${diceConfig.style}`);
          }
        });
        
        console.log("[ExternalRollHandler] Final dice counts:", diceCounts);
        
        // Generate and start the dice roll (MYZ uses D6 only, no advantage/bonus)
        const diceRoll = getDiceToRoll(diceCounts, null, diceById);
        const rollConfig: DiceRoll = {
          dice: diceRoll,
          hidden: config.hidden
        };
        
        console.log("[ExternalRollHandler] Starting dice roll with config:", rollConfig);
        startRoll(rollConfig);
        
        console.log("[ExternalRollHandler] External dice roll triggered successfully for rollId:", request.rollId);
      } catch (error) {
        console.error("[ExternalRollHandler] Failed to handle external roll request:", error);
      }
    };

    return () => {
      console.log("[ExternalRollHandler] Cleaning up: closing BroadcastChannel");
      channel.close();
    };
  }, [startRoll, diceById]);

  return null; // This component doesn't render anything
}

/**
 * Also export the API globally so other plugins can use it directly
 * Add this to your main App component
 */
export function GlobalAPIExporter() {
  const startRoll = useDiceRollStore(state => state.startRoll);
  const diceById = useDiceControlsStore(state => state.diceById);

  useEffect(() => {
    console.log("[GlobalAPIExporter] Initializing global MYZ Dice API...");
    
    // Expose API globally for other plugins
    (window as any).MYZDiceAPI = {
      async triggerRoll(config: any) {
        console.log("[GlobalAPIExporter] API triggerRoll called with config:", config);
        return new Promise((resolve, reject) => {
          try {
            // Build dice counts
            const diceCounts: Record<string, number> = {};
            config.dice.forEach((diceConfig: any) => {
              const matchingDie = Object.values(diceById).find(die => 
                die.style === diceConfig.style
              );
              
              if (matchingDie) {
                diceCounts[matchingDie.id] = diceConfig.count || 1;
                console.log(`[GlobalAPIExporter] Mapped ${diceConfig.style} to die ID ${matchingDie.id} with count ${diceConfig.count || 1}`);
              } else {
                console.warn(`[GlobalAPIExporter] No matching die found for style: ${diceConfig.style}`);
              }
            });
            
            console.log("[GlobalAPIExporter] Final dice counts:", diceCounts);
            
            // Generate roll (MYZ uses D6 only, no advantage/bonus)
            const diceRoll = getDiceToRoll(diceCounts, null, diceById);
            const rollConfig = {
              dice: diceRoll,
              hidden: config.hidden
            };
            
            console.log("[GlobalAPIExporter] Starting dice roll with config:", rollConfig);
            startRoll(rollConfig);
            
            // For simplicity, resolve immediately
            // In a real implementation, you'd wait for the roll to complete
            console.log("[GlobalAPIExporter] API triggerRoll completed successfully");
            resolve({ success: true });
          } catch (error) {
            console.error("[GlobalAPIExporter] API triggerRoll failed:", error);
            reject(error);
          }
        });
      },

      isAvailable: () => {
        console.log("[GlobalAPIExporter] API isAvailable called - returning true");
        return true;
      }
    };

    console.log("[GlobalAPIExporter] Global MYZ Dice API has been exposed on window.MYZDiceAPI");

    return () => {
      console.log("[GlobalAPIExporter] Cleaning up: removing global MYZ Dice API");
      delete (window as any).MYZDiceAPI;
    };
  }, [startRoll, diceById]);

  return null;
}
