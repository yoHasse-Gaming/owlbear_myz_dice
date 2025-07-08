
import { useEffect, version } from "react";
import { useDiceRollStore } from "../dice/store";
import { useDiceControlsStore, getDiceToRoll } from "../controls/store";
import { generateDiceId } from "../helpers/generateDiceId";
import { DiceRoll } from "../types/DiceRoll";
import { getPluginId } from "./getPluginId";
import OBR from "@owlbear-rodeo/sdk";

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
 */
export function ExternalRollHandler() {
  const startRoll = useDiceRollStore(state => state.startRoll);
  const diceById = useDiceControlsStore(state => state.diceById);

  useEffect(() => {
    console.debug("[ExternalRollHandler] Initializing external roll handler...");
    
    if (!window.BroadcastChannel) {
      console.warn("[ExternalRollHandler] BroadcastChannel not supported in this environment");
      return;
    }

    const channel = new BroadcastChannel(getPluginId("myz-dice-integration"));
    console.debug("[ExternalRollHandler] BroadcastChannel 'myz-dice-integration' created and listening for messages");
    
    channel.onmessage = (event) => {
      console.debug("[ExternalRollHandler] Broadcast message received:", event.data);
      const request = event.data as ExternalRollRequest | AvailabilityRequest;
      
      if (request.type === "TRIGGER_ROLL") {
        console.debug("[ExternalRollHandler] Processing TRIGGER_ROLL request:", request);
        handleExternalRoll(request as ExternalRollRequest);
      } else if (request.type === "CHECK_AVAILABILITY") {
        console.debug("[ExternalRollHandler] Processing CHECK_AVAILABILITY request:", request);
        handleAvailabilityCheck(request as AvailabilityRequest);
      } else {
        console.debug("[ExternalRollHandler] Unknown message type received:", (request as any).type);
      }
    };

    const handleAvailabilityCheck = (request: AvailabilityRequest) => {
      console.debug("[ExternalRollHandler] Responding to availability check:", request.requestId);
      
      const response: AvailabilityResponse = {
        type: "AVAILABILITY_RESPONSE",
        requestId: request.requestId,
        available: true,
        version: "1.0.0" // TODO: make this dynamic if needed
      };
      
      console.debug("[ExternalRollHandler] Sending availability response:", response);
      channel.postMessage(response);
    };

    const handleExternalRoll = (request: ExternalRollRequest) => {
      try {
        console.debug("[ExternalRollHandler] Handling external roll request:", request);
        const { config } = request;
        
        // Build dice counts
        const diceCounts: Record<string, number> = {};
        config.dice.forEach(diceConfig => {
          const matchingDie = Object.values(diceById).find(die => 
            die.style === diceConfig.style
          );
          
          if (matchingDie) {
            diceCounts[matchingDie.id] = diceConfig.count || 1;
            console.debug(`[ExternalRollHandler] Mapped ${diceConfig.style} to die ID ${matchingDie.id} with count ${diceConfig.count || 1}`);
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

  useEffect(() => {
    const initializeMetadata = async () => {
      await OBR.room.setMetadata({
        [getPluginId("diceRollerReady")]: {
          timestamp: Date.now(),
          version: "1.0.0", // TODO: make this dynamic if needed
        },
      });

      setInterval(async () => {
        await OBR.room.setMetadata({
          [getPluginId("diceRollerReady")]: {
            timestamp: Date.now(),
            version: "1.0.0", // TODO: make this dynamic if needed
          },
        });
      }, 30000); // Add interval time
      
    };

    initializeMetadata();
  }, []);

  return null; // This component doesn't render anything
}


