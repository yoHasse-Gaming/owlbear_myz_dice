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
    if (!window.BroadcastChannel) {
      return;
    }

    const channel = new BroadcastChannel("myz-dice-integration");
    
    channel.onmessage = (event) => {
      const request = event.data as ExternalRollRequest;
      
      if (request.type === "TRIGGER_ROLL") {
        handleExternalRoll(request);
      }
    };

    const handleExternalRoll = (request: ExternalRollRequest) => {
      try {
        const { config } = request;
        
        // Build dice counts
        const diceCounts: Record<string, number> = {};
        config.dice.forEach(diceConfig => {
          const matchingDie = Object.values(diceById).find(die => 
            die.style === diceConfig.style
          );
          
          if (matchingDie) {
            diceCounts[matchingDie.id] = diceConfig.count || 1;
          }
        });
        
        // Generate and start the dice roll (MYZ uses D6 only, no advantage/bonus)
        const diceRoll = getDiceToRoll(diceCounts, null, diceById);
        const rollConfig: DiceRoll = {
          dice: diceRoll,
          hidden: config.hidden
        };
        
        startRoll(rollConfig);
        
        console.log("External dice roll triggered:", request.rollId);
      } catch (error) {
        console.error("Failed to handle external roll request:", error);
      }
    };

    return () => {
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
    // Expose API globally for other plugins
    (window as any).MYZDiceAPI = {
      async triggerRoll(config: any) {
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
              }
            });
            
            // Generate roll (MYZ uses D6 only, no advantage/bonus)
            const diceRoll = getDiceToRoll(diceCounts, null, diceById);
            const rollConfig = {
              dice: diceRoll,
              hidden: config.hidden
            };
            
            startRoll(rollConfig);
            
            // For simplicity, resolve immediately
            // In a real implementation, you'd wait for the roll to complete
            resolve({ success: true });
          } catch (error) {
            reject(error);
          }
        });
      },

      isAvailable: () => true
    };

    return () => {
      delete (window as any).MYZDiceAPI;
    };
  }, [startRoll, diceById]);

  return null;
}
