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

interface AvailabilityRequest {
  type: "CHECK_AVAILABILITY";
  requestId: string;
}

interface AvailabilityResponse {
  type: "AVAILABILITY_RESPONSE";
  requestId: string;
  available: boolean;
  version?: string;
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
      const request = event.data as ExternalRollRequest | AvailabilityRequest;
      
      if (request.type === "TRIGGER_ROLL") {
        console.log("[ExternalRollHandler] Processing TRIGGER_ROLL request:", request);
        handleExternalRoll(request as ExternalRollRequest);
      } else if (request.type === "CHECK_AVAILABILITY") {
        console.log("[ExternalRollHandler] Processing CHECK_AVAILABILITY request:", request);
        handleAvailabilityCheck(request as AvailabilityRequest);
      } else {
        console.log("[ExternalRollHandler] Unknown message type received:", (request as any).type);
      }
    };

    const handleAvailabilityCheck = (request: AvailabilityRequest) => {
      console.log("[ExternalRollHandler] Responding to availability check:", request.requestId);
      
      const response: AvailabilityResponse = {
        type: "AVAILABILITY_RESPONSE",
        requestId: request.requestId,
        available: true,
        version: "1.0.0" // You can make this dynamic
      };
      
      console.log("[ExternalRollHandler] Sending availability response:", response);
      channel.postMessage(response);
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
 * Helper functions for other extensions to use
 * These should be copied into other extensions that want to integrate with MYZ Dice
 */

// Helper function to check if MYZ Dice extension is available
export function checkMYZDiceAvailability(timeoutMs: number = 3000): Promise<{ available: boolean; version?: string }> {
  return new Promise((resolve) => {
    if (!window.BroadcastChannel) {
      console.warn("[MYZDiceIntegration] BroadcastChannel not supported");
      resolve({ available: false });
      return;
    }

    const channel = new BroadcastChannel("myz-dice-integration");
    const requestId = `availability-${Date.now()}-${Math.random()}`;
    let resolved = false;

    console.log("[MYZDiceIntegration] Checking MYZ Dice availability...");

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        console.log("[MYZDiceIntegration] Availability check timed out");
        channel.close();
        resolve({ available: false });
      }
    }, timeoutMs);

    channel.onmessage = (event) => {
      const response = event.data as AvailabilityResponse;
      if (response.type === "AVAILABILITY_RESPONSE" && response.requestId === requestId) {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          console.log("[MYZDiceIntegration] MYZ Dice availability confirmed:", response);
          channel.close();
          resolve({ available: response.available, version: response.version });
        }
      }
    };

    // Send availability check request
    const request: AvailabilityRequest = {
      type: "CHECK_AVAILABILITY",
      requestId: requestId
    };

    console.log("[MYZDiceIntegration] Sending availability check request:", request);
    channel.postMessage(request);
  });
}

// Helper function to trigger a dice roll
export function triggerMYZDiceRoll(config: {
  dice: {
    style: "MYZBASE" | "MYZSKILL" | "MYZGEAR";
    count?: number;
  }[];
  hidden?: boolean;
}): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!window.BroadcastChannel) {
      reject(new Error("BroadcastChannel not supported"));
      return;
    }

    const channel = new BroadcastChannel("myz-dice-integration");
    const rollId = `roll-${Date.now()}-${Math.random()}`;

    console.log("[MYZDiceIntegration] Triggering MYZ Dice roll:", config);

    const request: ExternalRollRequest = {
      type: "TRIGGER_ROLL",
      rollId: rollId,
      config: config
    };

    channel.postMessage(request);
    channel.close();
    
    console.log("[MYZDiceIntegration] Roll request sent:", rollId);
    resolve(); // For now, just resolve immediately
  });
}
