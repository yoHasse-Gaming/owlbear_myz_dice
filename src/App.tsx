import Stack from "@mui/material/Stack";
import Container from "@mui/material/Container";

import { InteractiveTray } from "./tray/InteractiveTray";
import { Sidebar } from "./controls/Sidebar";
import { ExternalRollHandler } from "./plugin/ExternalRollHandler";

export function App() {
  return (
    <Container disableGutters maxWidth="md">
      <Stack direction="row" justifyContent="center">
        <Sidebar />
        <InteractiveTray />
      </Stack>
      {/* Add these components to enable external plugin integration */}
      <ExternalRollHandler />
    </Container>
  );
}
